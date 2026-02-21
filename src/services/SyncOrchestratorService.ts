/**
 * Sync Orchestrator Service
 * Runs data sync for schools (ManageBac and Nexquare) with run tracking.
 * Invokes existing ManageBacService and NexquareService - no modifications to those services.
 */

import { executeQuery } from '../config/database.js';
import { getConfigsForScope } from './SyncScopeService.js';
import type { ManageBacConfig, NexquareConfig } from '../middleware/configLoader.js';
import { ManageBacService, manageBacService } from './ManageBacService/index.js';
import { nexquareService } from './NexquareService/index.js';

export interface RunSyncParams {
  /** Node ID(s) to sync. Required unless all is true. */
  nodeIds?: string[];
  /** Academic year e.g. "2024", "2024-2025". Used for MB academic_year_id resolution and NEX date ranges. */
  academicYear?: string;
  /** Schedule ID if triggered by scheduler. */
  scheduleId?: number | null;
  /** MB endpoints to run. If null/empty, run all. */
  endpointsMb?: string[] | null;
  /** Nexquare endpoints to run. If null/empty, run all. */
  endpointsNex?: string[] | null;
  /** Include descendant nodes. */
  includeDescendants?: boolean;
  /** Sync all active configs (ignore nodeIds). */
  all?: boolean;
  /** Who triggered: "scheduler" or user email. */
  triggeredBy?: string;
  /** Pre-created run ID (e.g. from API trigger). If provided, skip insert and use this. */
  existingRunId?: number;
  /** AbortSignal for cancellation. If aborted, run exits early with status 'cancelled'. */
  abortSignal?: AbortSignal;
  /** Explicit MB config IDs (overrides node/all for MB). */
  configIdsMb?: number[];
  /** Explicit NEX config IDs (overrides node/all for NEX). */
  configIdsNex?: number[];
}

export interface RunSyncResult {
  runId: number;
  status: 'completed' | 'failed' | 'cancelled' | 'running';
  totalSchools: number;
  schoolsSucceeded: number;
  schoolsFailed: number;
  errorSummary?: string;
}

const MB_ENDPOINTS_ALL = ['school', 'academic-years', 'grades', 'subjects', 'teachers', 'students', 'classes', 'year-groups'];
const NEX_ENDPOINTS_ALL = ['schools', 'students', 'staff', 'classes', 'allocation-master', 'student-allocations', 'staff-allocations', 'daily-plans', 'daily-attendance', 'student-assessments'];

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

/**
 * Run sync for the given scope.
 * All schools run in parallel - each MB school gets its own ManageBacService instance.
 */
export async function runSync(params: RunSyncParams): Promise<RunSyncResult> {
  const triggeredBy = params.triggeredBy || 'scheduler';
  const nodeIdStr = Array.isArray(params.nodeIds) ? params.nodeIds.join(',') : (params.nodeIds?.[0] ?? '');
  const academicYearStr = params.academicYear || new Date().getFullYear().toString();

  let runId: number;

  if (params.existingRunId != null) {
    runId = params.existingRunId;
    await executeQuery(
      `UPDATE admin.sync_runs SET status = 'running', started_at = @startedAt WHERE id = @runId`,
      { startedAt: new Date(), runId }
    );
  } else {
    const result = await executeQuery<{ id: number }>(
      `INSERT INTO admin.sync_runs (schedule_id, node_id, academic_year, status, started_at, total_schools, schools_succeeded, schools_failed, triggered_by)
       OUTPUT INSERTED.id
       VALUES (@scheduleId, @nodeId, @academicYear, 'running', @startedAt, 0, 0, 0, @triggeredBy)`,
      {
        scheduleId: params.scheduleId ?? null,
        nodeId: nodeIdStr,
        academicYear: academicYearStr,
        startedAt: new Date(),
        triggeredBy,
      }
    );

    if (result.error || !result.data?.[0]?.id) {
      throw new Error(result.error || 'Failed to create sync run');
    }

    runId = Number(result.data[0].id);
  }
  const { mb, nex } = await getConfigsForScope({
    nodeIds: params.nodeIds,
    includeDescendants: params.includeDescendants,
    all: params.all,
    academicYear: params.academicYear,
    configIdsMb: params.configIdsMb,
    configIdsNex: params.configIdsNex,
  });

  const schoolItems: Array<{ config: ManageBacConfig | NexquareConfig; source: 'mb' | 'nex'; schoolId: string; schoolName: string }> = [];

  for (const c of mb) {
    const sid = c.school_id != null ? String(c.school_id) : '';
    if (sid) {
      schoolItems.push({ config: c, source: 'mb', schoolId: sid, schoolName: c.school_name });
    }
  }
  for (const c of nex) {
    const sid = c.school_id?.trim() ?? '';
    if (sid) {
      schoolItems.push({ config: c, source: 'nex', schoolId: sid, schoolName: c.school_name });
    }
  }

  const totalSchools = schoolItems.length;

  await executeQuery(
    `UPDATE admin.sync_runs SET total_schools = @total WHERE id = @runId`,
    { total: totalSchools, runId }
  );

  const endpointsMb = params.endpointsMb?.length ? params.endpointsMb : MB_ENDPOINTS_ALL;
  const endpointsNex = params.endpointsNex?.length ? params.endpointsNex : NEX_ENDPOINTS_ALL;

  // Pre-create all sync_run_schools rows and mark as running
  type ItemWithId = { item: typeof schoolItems[0]; schoolRunId: number };
  const itemsWithIds: ItemWithId[] = [];

  for (const item of schoolItems) {
    const schoolRunResult = await executeQuery<{ id: number }>(
      `INSERT INTO admin.sync_run_schools (sync_run_id, school_id, school_source, config_id, school_name, status)
       OUTPUT INSERTED.id
       VALUES (@runId, @schoolId, @source, @configId, @schoolName, 'pending')`,
      {
        runId,
        schoolId: item.schoolId,
        source: item.source,
        configId: item.config.id,
        schoolName: item.schoolName,
      }
    );
    if (schoolRunResult.error || !schoolRunResult.data?.[0]?.id) continue;
    itemsWithIds.push({ item, schoolRunId: Number(schoolRunResult.data[0].id) });
  }

  const startedAt = new Date();
  await executeQuery(
    `UPDATE admin.sync_run_schools SET status = 'running', started_at = @startedAt WHERE sync_run_id = @runId`,
    { startedAt, runId }
  );

  // Run all schools in parallel
  const results = await Promise.allSettled(
    itemsWithIds.map(async ({ item, schoolRunId }) => {
      throwIfAborted(params.abortSignal);
      try {
        if (item.source === 'mb') {
          const mbService = new ManageBacService();
          await syncManageBacSchool(item.config as ManageBacConfig, {
            academicYear: params.academicYear,
            endpoints: endpointsMb,
            abortSignal: params.abortSignal,
            mbService,
          });
        } else {
          await syncNexquareSchool(item.config as NexquareConfig, item.schoolId, {
            academicYear: params.academicYear,
            endpoints: endpointsNex,
            abortSignal: params.abortSignal,
          });
        }
        await executeQuery(
          `UPDATE admin.sync_run_schools SET status = 'completed', completed_at = @completedAt WHERE id = @id`,
          { completedAt: new Date(), id: schoolRunId }
        );
        return { success: true as const, schoolRunId, item };
      } catch (err: any) {
        if (err?.name === 'AbortError' || params.abortSignal?.aborted) {
          throw err;
        }
        const errMsg = err?.message || String(err);
        await executeQuery(
          `UPDATE admin.sync_run_schools SET status = 'failed', completed_at = @completedAt, error_message = @errMsg WHERE id = @id`,
          {
            completedAt: new Date(),
            errMsg: errMsg.length > 4000 ? errMsg.substring(0, 4000) : errMsg,
            id: schoolRunId,
          }
        );
        return { success: false as const, schoolRunId, item, errMsg };
      }
    })
  );

  // Check for abort
  const abortedResult = results.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected' && (r.reason as any)?.name === 'AbortError'
  );
  if (abortedResult) {
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
    const succeeded = fulfilled.filter((r) => r.value.success).length;
    const failed = fulfilled.filter((r) => !r.value.success).length;
    await executeQuery(
      `UPDATE admin.sync_runs SET status = 'cancelled', completed_at = @completedAt, schools_succeeded = @succeeded, schools_failed = @failed, error_summary = @errorSummary WHERE id = @runId`,
      {
        completedAt: new Date(),
        succeeded,
        failed,
        errorSummary: 'Cancelled by user',
        runId,
      }
    );
    await executeQuery(
      `UPDATE admin.sync_run_schools SET status = 'skipped', completed_at = @completedAt, error_message = @msg WHERE sync_run_id = @runId AND status = 'running'`,
      { completedAt: new Date(), msg: 'Cancelled', runId }
    );
    return {
      runId,
      status: 'cancelled',
      totalSchools,
      schoolsSucceeded: succeeded,
      schoolsFailed: failed,
      errorSummary: 'Cancelled by user',
    };
  }

  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value.success) succeeded++;
      else {
        failed++;
        errors.push(`${r.value.item.schoolName} (${r.value.item.source}): ${r.value.errMsg}`);
      }
    } else {
      failed++;
      errors.push((r.reason as Error)?.message || 'Unknown error');
    }
  }

  const status = failed > 0 && succeeded === 0 ? 'failed' : 'completed';
  const errorSummary = errors.length > 0 ? errors.slice(0, 5).join('; ') : null;

  await executeQuery(
    `UPDATE admin.sync_runs SET status = @status, completed_at = @completedAt, schools_succeeded = @succeeded, schools_failed = @failed, error_summary = @errorSummary WHERE id = @runId`,
    {
      status,
      completedAt: new Date(),
      succeeded,
      failed,
      errorSummary,
      runId,
    }
  );

  return {
    runId,
    status,
    totalSchools,
    schoolsSucceeded: succeeded,
    schoolsFailed: failed,
    errorSummary: errorSummary ?? undefined,
  };
}

/**
 * Sync one ManageBac school.
 * Uses mbService when provided (for parallel runs); otherwise uses singleton.
 * Checks abortSignal before each endpoint for immediate cancel.
 */
async function syncManageBacSchool(
  config: ManageBacConfig,
  options?: { academicYear?: string; endpoints?: string[]; abortSignal?: AbortSignal; mbService?: ManageBacService }
): Promise<void> {
  const eps = options?.endpoints ?? MB_ENDPOINTS_ALL;
  const apiKey = config.api_token;
  const baseUrl = config.base_url || undefined;
  const signal = options?.abortSignal;
  const svc = options?.mbService ?? manageBacService;

  if (config.school_id != null) {
    svc.setCurrentSchoolId(config.school_id);
  }

  throwIfAborted(signal);
  if (eps.includes('school')) {
    await svc.getSchoolDetails(apiKey, baseUrl);
  }
  throwIfAborted(signal);
  if (eps.includes('academic-years')) {
    await svc.getAcademicYears(apiKey, undefined, baseUrl);
  }
  throwIfAborted(signal);
  if (eps.includes('grades')) {
    const academicYearId = await resolveAcademicYearId(svc, apiKey, baseUrl, options?.academicYear);
    await svc.getGrades(apiKey, academicYearId, baseUrl);
  }
  throwIfAborted(signal);
  if (eps.includes('subjects')) {
    await svc.getSubjects(apiKey, baseUrl);
  }
  throwIfAborted(signal);
  if (eps.includes('teachers')) {
    await svc.getTeachers(apiKey, {}, baseUrl);
  }
  throwIfAborted(signal);
  if (eps.includes('students')) {
    await svc.getStudents(apiKey, {}, baseUrl);
  }
  throwIfAborted(signal);
  if (eps.includes('classes')) {
    await svc.getClasses(apiKey, baseUrl);
  }
  throwIfAborted(signal);
  if (eps.includes('year-groups')) {
    await svc.getYearGroups(apiKey, baseUrl);
  }
}

/**
 * Resolve ManageBac academic_year_id from academic year string (e.g. "2024").
 */
async function resolveAcademicYearId(
  svc: ManageBacService,
  apiKey: string,
  baseUrl: string | undefined,
  academicYear?: string
): Promise<string | undefined> {
  if (!academicYear) return undefined;
  try {
    const data = await svc.getAcademicYears(apiKey, undefined, baseUrl);
    const programs = data?.academic_years ?? data;
    if (typeof programs !== 'object') return undefined;
    for (const prog of Object.values(programs as Record<string, any>)) {
      const years = prog?.academic_years ?? [];
      for (const y of years) {
        const name = y?.name ?? '';
        if (name.includes(academicYear)) {
          const id = y?.id ?? y?.uid;
          return id != null ? String(id) : undefined;
        }
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Derive date range from academic year string.
 * "2024" -> Jan 1 2024 to Dec 31 2024.
 */
function getDateRangeFromAcademicYear(academicYear?: string): { start: string; end: string } {
  const year = academicYear ? parseInt(academicYear, 10) : new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return { start, end };
}

/**
 * Sync one Nexquare school.
 * Pass schoolId explicitly - safe for parallel NEX schools (different configs).
 * Checks abortSignal before each endpoint for immediate cancel.
 */
async function syncNexquareSchool(
  config: NexquareConfig,
  schoolId: string,
  options?: { academicYear?: string; endpoints?: string[]; abortSignal?: AbortSignal }
): Promise<void> {
  const eps = options?.endpoints ?? NEX_ENDPOINTS_ALL;
  const { start, end } = getDateRangeFromAcademicYear(options?.academicYear);
  const ay = options?.academicYear || new Date().getFullYear().toString();
  const signal = options?.abortSignal;

  throwIfAborted(signal);
  if (eps.includes('schools')) {
    await nexquareService.getSchools(config);
  }
  throwIfAborted(signal);
  if (eps.includes('students')) {
    await nexquareService.getStudents(config, schoolId);
  }
  throwIfAborted(signal);
  if (eps.includes('staff')) {
    await nexquareService.getStaff(config, schoolId);
  }
  throwIfAborted(signal);
  if (eps.includes('classes')) {
    await nexquareService.getClasses(config, schoolId);
  }
  throwIfAborted(signal);
  if (eps.includes('allocation-master')) {
    await nexquareService.getAllocationMaster(config, schoolId);
  }
  throwIfAborted(signal);
  if (eps.includes('student-allocations')) {
    await nexquareService.getStudentAllocations(config, schoolId, ay);
  }
  throwIfAborted(signal);
  if (eps.includes('staff-allocations')) {
    await nexquareService.getStaffAllocations(config, schoolId, ay);
  }
  throwIfAborted(signal);
  if (eps.includes('daily-plans')) {
    await nexquareService.getDailyPlans(config, schoolId, start, end);
  }
  throwIfAborted(signal);
  if (eps.includes('daily-attendance')) {
    await nexquareService.getDailyAttendance(config, schoolId, start, end);
  }
  throwIfAborted(signal);
  if (eps.includes('student-assessments')) {
    await nexquareService.getStudentAssessments(config, schoolId, ay);
  }
}
