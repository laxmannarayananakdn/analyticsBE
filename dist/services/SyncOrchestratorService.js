/**
 * Sync Orchestrator Service
 * Runs data sync for schools (ManageBac and Nexquare) with run tracking.
 * Invokes existing ManageBacService and NexquareService - no modifications to those services.
 */
import { executeQuery } from '../config/database.js';
import { getConfigsForScope } from './SyncScopeService.js';
import { ManageBacService, manageBacService } from './ManageBacService/index.js';
import { nexquareService } from './NexquareService/index.js';
const MB_ENDPOINTS_ALL = ['school', 'academic-years', 'grades', 'subjects', 'teachers', 'students', 'classes', 'year-groups'];
const NEX_ENDPOINTS_ALL = ['schools', 'students', 'staff', 'classes', 'allocation-master', 'student-allocations', 'staff-allocations', 'daily-plans', 'daily-attendance', 'student-assessments'];
function throwIfAborted(signal) {
    if (signal?.aborted)
        throw new DOMException('Cancelled', 'AbortError');
}
/**
 * Run sync for the given scope.
 * All schools run in parallel - each MB school gets its own ManageBacService instance.
 */
export async function runSync(params) {
    const triggeredBy = params.triggeredBy || 'scheduler';
    const nodeIdStr = Array.isArray(params.nodeIds) ? params.nodeIds.join(',') : (params.nodeIds?.[0] ?? '');
    const academicYearStr = params.academicYear || new Date().getFullYear().toString();
    let runId;
    if (params.existingRunId != null) {
        runId = params.existingRunId;
        await executeQuery(`UPDATE admin.sync_runs SET status = 'running', started_at = @startedAt WHERE id = @runId`, { startedAt: new Date(), runId });
    }
    else {
        const result = await executeQuery(`INSERT INTO admin.sync_runs (schedule_id, node_id, academic_year, status, started_at, total_schools, schools_succeeded, schools_failed, triggered_by)
       OUTPUT INSERTED.id
       VALUES (@scheduleId, @nodeId, @academicYear, 'running', @startedAt, 0, 0, 0, @triggeredBy)`, {
            scheduleId: params.scheduleId ?? null,
            nodeId: nodeIdStr,
            academicYear: academicYearStr,
            startedAt: new Date(),
            triggeredBy,
        });
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
    const schoolItems = [];
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
    await executeQuery(`UPDATE admin.sync_runs SET total_schools = @total WHERE id = @runId`, { total: totalSchools, runId });
    const endpointsMb = params.endpointsMb?.length ? params.endpointsMb : MB_ENDPOINTS_ALL;
    const endpointsNex = params.endpointsNex?.length ? params.endpointsNex : NEX_ENDPOINTS_ALL;
    const itemsWithIds = [];
    for (const item of schoolItems) {
        const schoolRunResult = await executeQuery(`INSERT INTO admin.sync_run_schools (sync_run_id, school_id, school_source, config_id, school_name, status)
       OUTPUT INSERTED.id
       VALUES (@runId, @schoolId, @source, @configId, @schoolName, 'pending')`, {
            runId,
            schoolId: item.schoolId,
            source: item.source,
            configId: item.config.id,
            schoolName: item.schoolName,
        });
        if (schoolRunResult.error || !schoolRunResult.data?.[0]?.id)
            continue;
        itemsWithIds.push({ item, schoolRunId: Number(schoolRunResult.data[0].id) });
    }
    const startedAt = new Date();
    await executeQuery(`UPDATE admin.sync_run_schools SET status = 'running', started_at = @startedAt WHERE sync_run_id = @runId`, { startedAt, runId });
    const STAGGER_DELAY_MS = 5 * 60 * 1000; // 5 minutes between schools
    const results = [];
    let aborted = false;
    try {
        for (let i = 0; i < itemsWithIds.length; i++) {
            const { item, schoolRunId } = itemsWithIds[i];
            if (i > 0) {
                console.log(`⏳ Waiting ${STAGGER_DELAY_MS / 60000} min before next school (${i + 1}/${itemsWithIds.length})...`);
                await new Promise((resolve) => setTimeout(resolve, STAGGER_DELAY_MS));
            }
            throwIfAborted(params.abortSignal);
            const setCurrentEndpoint = async (endpoint) => {
                const r = await executeQuery(`UPDATE admin.sync_run_schools SET current_endpoint = @endpoint WHERE id = @id`, { endpoint: endpoint ?? null, id: schoolRunId });
                if (r.error) {
                    // Ignore if current_endpoint column doesn't exist (run add_current_endpoint_to_sync_run_schools.sql)
                }
            };
            try {
                if (item.source === 'mb') {
                    const mbService = new ManageBacService();
                    await syncManageBacSchool(item.config, {
                        academicYear: params.academicYear,
                        endpoints: endpointsMb,
                        abortSignal: params.abortSignal,
                        mbService,
                        onEndpointChange: setCurrentEndpoint,
                    });
                }
                else {
                    await syncNexquareSchool(item.config, item.schoolId, {
                        academicYear: params.academicYear,
                        endpoints: endpointsNex,
                        abortSignal: params.abortSignal,
                        onEndpointChange: setCurrentEndpoint,
                    });
                }
                await executeQuery(`UPDATE admin.sync_run_schools SET status = 'completed', completed_at = @completedAt, current_endpoint = NULL WHERE id = @id`, { completedAt: new Date(), id: schoolRunId });
                results.push({ status: 'fulfilled', value: { success: true, schoolRunId, item } });
            }
            catch (err) {
                if (err?.name === 'AbortError' || params.abortSignal?.aborted) {
                    throw err;
                }
                const errMsg = err?.message || String(err);
                await executeQuery(`UPDATE admin.sync_run_schools SET status = 'failed', completed_at = @completedAt, error_message = @errMsg, current_endpoint = NULL WHERE id = @id`, {
                    completedAt: new Date(),
                    errMsg: errMsg.length > 4000 ? errMsg.substring(0, 4000) : errMsg,
                    id: schoolRunId,
                });
                results.push({ status: 'fulfilled', value: { success: false, schoolRunId, item, errMsg } });
            }
        }
    }
    catch (err) {
        if (err?.name === 'AbortError' || params.abortSignal?.aborted) {
            aborted = true;
        }
        else {
            throw err;
        }
    }
    // Check for abort
    if (aborted) {
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const succeeded = fulfilled.filter((r) => r.value.success).length;
        const failed = fulfilled.filter((r) => !r.value.success).length;
        await executeQuery(`UPDATE admin.sync_runs SET status = 'cancelled', completed_at = @completedAt, schools_succeeded = @succeeded, schools_failed = @failed, error_summary = @errorSummary WHERE id = @runId`, {
            completedAt: new Date(),
            succeeded,
            failed,
            errorSummary: 'Cancelled by user',
            runId,
        });
        await executeQuery(`UPDATE admin.sync_run_schools SET status = 'skipped', completed_at = @completedAt, error_message = @msg WHERE sync_run_id = @runId AND status = 'running'`, { completedAt: new Date(), msg: 'Cancelled', runId });
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
    const errors = [];
    for (const r of results) {
        if (r.status === 'fulfilled') {
            if (r.value.success)
                succeeded++;
            else {
                failed++;
                errors.push(`${r.value.item.schoolName} (${r.value.item.source}): ${r.value.errMsg}`);
            }
        }
        else {
            failed++;
            const reason = r.reason;
            errors.push(reason?.message || 'Unknown error');
        }
    }
    const status = failed > 0 && succeeded === 0 ? 'failed' : 'completed';
    const errorSummary = errors.length > 0 ? errors.slice(0, 5).join('; ') : null;
    await executeQuery(`UPDATE admin.sync_runs SET status = @status, completed_at = @completedAt, schools_succeeded = @succeeded, schools_failed = @failed, error_summary = @errorSummary WHERE id = @runId`, {
        status,
        completedAt: new Date(),
        succeeded,
        failed,
        errorSummary,
        runId,
    });
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
async function syncManageBacSchool(config, options) {
    const eps = options?.endpoints ?? MB_ENDPOINTS_ALL;
    const apiKey = config.api_token;
    const baseUrl = config.base_url || undefined;
    const signal = options?.abortSignal;
    const svc = options?.mbService ?? manageBacService;
    const onEndpoint = options?.onEndpointChange;
    if (config.school_id != null) {
        svc.setCurrentSchoolId(config.school_id);
    }
    const run = async (name, fn) => {
        if (onEndpoint)
            await onEndpoint(name);
        await fn();
    };
    throwIfAborted(signal);
    if (eps.includes('school')) {
        await run('school', () => svc.getSchoolDetails(apiKey, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('academic-years')) {
        await run('academic-years', () => svc.getAcademicYears(apiKey, undefined, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('grades')) {
        await run('grades', async () => {
            const academicYearId = await resolveAcademicYearId(svc, apiKey, baseUrl, options?.academicYear);
            await svc.getGrades(apiKey, academicYearId, baseUrl);
        });
    }
    throwIfAborted(signal);
    if (eps.includes('subjects')) {
        await run('subjects', () => svc.getSubjects(apiKey, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('teachers')) {
        await run('teachers', () => svc.getTeachers(apiKey, {}, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('students')) {
        await run('students', () => svc.getStudents(apiKey, {}, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('classes')) {
        await run('classes', () => svc.getClasses(apiKey, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('year-groups')) {
        await run('year-groups', () => svc.getYearGroups(apiKey, baseUrl));
    }
}
/**
 * Resolve ManageBac academic_year_id from academic year string (e.g. "2024").
 */
async function resolveAcademicYearId(svc, apiKey, baseUrl, academicYear) {
    if (!academicYear)
        return undefined;
    try {
        const data = await svc.getAcademicYears(apiKey, undefined, baseUrl);
        const programs = data?.academic_years ?? data;
        if (typeof programs !== 'object')
            return undefined;
        for (const prog of Object.values(programs)) {
            const years = prog?.academic_years ?? [];
            for (const y of years) {
                const name = y?.name ?? '';
                if (name.includes(academicYear)) {
                    const id = y?.id ?? y?.uid;
                    return id != null ? String(id) : undefined;
                }
            }
        }
    }
    catch {
        // ignore
    }
    return undefined;
}
/**
 * Derive date range from academic year string.
 * "2024" -> Jan 1 2024 to Dec 31 2024.
 */
function getDateRangeFromAcademicYear(academicYear) {
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
async function syncNexquareSchool(config, schoolId, options) {
    const eps = options?.endpoints ?? NEX_ENDPOINTS_ALL;
    const { start, end } = getDateRangeFromAcademicYear(options?.academicYear);
    const ay = options?.academicYear || new Date().getFullYear().toString();
    const signal = options?.abortSignal;
    const onEndpoint = options?.onEndpointChange;
    const run = async (name, fn) => {
        if (onEndpoint)
            await onEndpoint(name);
        await fn();
    };
    throwIfAborted(signal);
    if (eps.includes('schools')) {
        await run('schools', () => nexquareService.getSchools(config));
    }
    throwIfAborted(signal);
    if (eps.includes('students')) {
        await run('students', () => nexquareService.getStudents(config, schoolId));
    }
    throwIfAborted(signal);
    if (eps.includes('staff')) {
        await run('staff', () => nexquareService.getStaff(config, schoolId));
    }
    throwIfAborted(signal);
    if (eps.includes('classes')) {
        await run('classes', () => nexquareService.getClasses(config, schoolId));
    }
    throwIfAborted(signal);
    if (eps.includes('allocation-master')) {
        await run('allocation-master', () => nexquareService.getAllocationMaster(config, schoolId));
    }
    throwIfAborted(signal);
    if (eps.includes('student-allocations')) {
        await run('student-allocations', () => nexquareService.getStudentAllocations(config, schoolId, ay));
    }
    throwIfAborted(signal);
    if (eps.includes('staff-allocations')) {
        await run('staff-allocations', () => nexquareService.getStaffAllocations(config, schoolId, ay));
    }
    throwIfAborted(signal);
    if (eps.includes('daily-plans')) {
        await run('daily-plans', () => nexquareService.getDailyPlans(config, schoolId, start, end));
    }
    throwIfAborted(signal);
    if (eps.includes('daily-attendance')) {
        await run('daily-attendance', () => nexquareService.getDailyAttendance(config, schoolId, start, end));
    }
    throwIfAborted(signal);
    if (eps.includes('student-assessments')) {
        await run('student-assessments', () => nexquareService.getStudentAssessments(config, schoolId, ay));
    }
}
//# sourceMappingURL=SyncOrchestratorService.js.map