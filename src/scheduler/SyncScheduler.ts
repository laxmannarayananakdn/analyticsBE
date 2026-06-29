/**
 * Sync Scheduler
 * Runs scheduled sync jobs from admin.sync_schedules.
 * Can be embedded in the API server (Azure Web App) or run standalone via scheduler-daemon.
 *
 * Set ENABLE_SCHEDULER=false to disable when running the API server.
 * Set CRON_TIMEZONE (e.g. Asia/Kolkata) for cron timezone; default is Asia/Kolkata (IST).
 */

import cron from 'node-cron';
import { claimSyncRunForSchedule, executeQuery } from '../config/database.js';
import { runSync } from '../services/SyncOrchestratorService.js';

interface SyncScheduleRow {
  id: number;
  node_id: string;
  academic_year: string;
  cron_expression: string;
  endpoints_mb: string | null;
  endpoints_nex: string | null;
  load_rp_schema: boolean | number;
  build_student_assessments_by_academic_year: boolean | number;
  include_descendants: boolean | number;
  run_managebac: boolean | number;
  run_nexquare: boolean | number;
}

const RELOAD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let scheduledTasks: Map<number, cron.ScheduledTask> = new Map();
let reloadTimer: ReturnType<typeof setInterval> | null = null;

function parseEndpoints(json: string | null): string[] | null {
  if (!json || !json.trim()) return null;
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

async function loadActiveSchedules(): Promise<SyncScheduleRow[]> {
  const result = await executeQuery<SyncScheduleRow>(
    `SELECT id, node_id, academic_year, cron_expression, endpoints_mb, endpoints_nex,
            ISNULL(load_rp_schema, 1) AS load_rp_schema,
            ISNULL(build_student_assessments_by_academic_year, 0) AS build_student_assessments_by_academic_year,
            include_descendants,
            ISNULL(run_managebac, 1) AS run_managebac,
            ISNULL(run_nexquare, 1) AS run_nexquare
     FROM admin.sync_schedules
     WHERE is_active = 1
     ORDER BY id`
  );

  if (result.error || !result.data) {
    console.error('[SyncScheduler] Failed to load schedules:', result.error);
    return [];
  }

  return result.data;
}

function getTimezone(): string {
  return process.env.CRON_TIMEZONE || 'Asia/Kolkata';
}

/** Return the timezone used for cron schedules. */
export function getSyncSchedulerTimezone(): string {
  return getTimezone();
}

/** Return whether the scheduler is enabled (from env). */
export function isSyncSchedulerEnabled(): boolean {
  return process.env.ENABLE_SCHEDULER !== 'false';
}

function registerSchedule(schedule: SyncScheduleRow): void {
  const { cron_expression, id } = schedule;
  const timezone = getTimezone();

  if (!cron.validate(cron_expression)) {
    console.warn(`[SyncScheduler ${id}] Invalid cron expression: ${cron_expression} – skipping`);
    return;
  }

  // Stop existing task for this schedule if any
  const existing = scheduledTasks.get(id);
  if (existing) {
    existing.stop();
    scheduledTasks.delete(id);
  }

  const task = cron.schedule(
    cron_expression,
    async () => {
      const now = new Date().toISOString();
      console.log(`[SyncScheduler ${id}] Firing at ${now} – node ${schedule.node_id}, AY ${schedule.academic_year}`);

      try {
        // Atomic claim: multiple API instances (e.g. Azure scale-out) each run this cron;
        // a plain SELECT-then-runSync INSERT races. claimSyncRunForSchedule uses sp_getapplock
        // + INSERT in one transaction so only one worker creates a run per tick.
        const claimedRunId = await claimSyncRunForSchedule({
          scheduleId: id,
          nodeId: schedule.node_id,
          academicYear: schedule.academic_year,
          triggeredBy: 'scheduler',
        });
        if (claimedRunId == null) {
          console.warn(
            `[SyncScheduler ${id}] Skipping – lock not acquired, or another worker already started a run for this schedule in the last 2 minutes`
          );
          return;
        }

        const endpointsMb = parseEndpoints(schedule.endpoints_mb);
        const endpointsNex = parseEndpoints(schedule.endpoints_nex);
        const runManagebac = !!(schedule.run_managebac ?? true);
        const runNexquare = !!(schedule.run_nexquare ?? true);

        const result = await runSync({
          nodeIds: [schedule.node_id],
          academicYear: schedule.academic_year,
          scheduleId: schedule.id,
          existingRunId: claimedRunId,
          endpointsMb: runManagebac ? (endpointsMb ?? undefined) : undefined,
          endpointsNex: runNexquare ? (endpointsNex ?? undefined) : undefined,
          runManagebac,
          runNexquare,
          loadRpSchema: !!(schedule.load_rp_schema ?? true),
          buildStudentAssessmentsByAcademicYear: !!(schedule.build_student_assessments_by_academic_year),
          includeDescendants: !!(schedule.include_descendants),
          triggeredBy: 'scheduler',
        });

        console.log(
          `[SyncScheduler ${id}] Run ${result.runId} completed: ${result.schoolsSucceeded} succeeded, ${result.schoolsFailed} failed`
        );
      } catch (err: unknown) {
        console.error(`[SyncScheduler ${id}] Sync failed:`, err);
      }
    },
    { timezone, name: `sync-schedule-${id}` }
  );

  scheduledTasks.set(id, task);
  console.log(`[SyncScheduler ${id}] Registered: ${cron_expression} (${timezone}) – node ${schedule.node_id}, AY ${schedule.academic_year}`);
}

async function reloadSchedules(): Promise<void> {
  const schedules = await loadActiveSchedules();
  const currentIds = new Set(schedules.map((s) => s.id));
  const previousIds = new Set(scheduledTasks.keys());

  // Stop removed or deactivated schedules
  for (const id of previousIds) {
    if (!currentIds.has(id)) {
      const task = scheduledTasks.get(id);
      if (task) {
        task.stop();
        scheduledTasks.delete(id);
        console.log(`[SyncScheduler ${id}] Unregistered`);
      }
    }
  }

  // Register new or updated schedules
  for (const schedule of schedules) {
    registerSchedule(schedule);
  }
}

/**
 * Start the sync scheduler. Call this after the server/DB is ready.
 * No-op if ENABLE_SCHEDULER=false.
 */
export async function startSyncScheduler(): Promise<void> {
  const enabled = process.env.ENABLE_SCHEDULER !== 'false';
  if (!enabled) {
    console.log('🕐 Sync scheduler disabled (ENABLE_SCHEDULER=false)');
    return;
  }

  console.log('🕐 Sync scheduler starting...');

  const dbCheck = await executeQuery('SELECT 1 AS ok');
  if (dbCheck.error) {
    console.error('❌ [SyncScheduler] Database connection failed:', dbCheck.error);
    return;
  }

  await reloadSchedules();
  reloadTimer = setInterval(reloadSchedules, RELOAD_INTERVAL_MS);

  console.log(`🕐 Sync scheduler running (timezone: ${getTimezone()}). Reloading every ${RELOAD_INTERVAL_MS / 1000}s.`);
}

/**
 * Stop the sync scheduler. Call on graceful shutdown.
 */
export function stopSyncScheduler(): void {
  if (reloadTimer) {
    clearInterval(reloadTimer);
    reloadTimer = null;
  }
  for (const task of scheduledTasks.values()) {
    task.stop();
  }
  scheduledTasks.clear();
  console.log('🕐 Sync scheduler stopped');
}
