/**
 * Scheduler Daemon
 * Long-running process that runs scheduled sync jobs based on admin.sync_schedules.
 * Uses node-cron to fire at configured times.
 *
 * Run: npm run scheduler   (or: tsx scripts/scheduler-daemon.ts)
 * Requires: backend/.env with Azure SQL credentials
 */

import cron from 'node-cron';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { executeQuery } from '../src/config/database.js';
import { runSync } from '../src/services/SyncOrchestratorService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

interface SyncScheduleRow {
  id: number;
  node_id: string;
  academic_year: string;
  cron_expression: string;
  endpoints_mb: string | null;
  endpoints_nex: string | null;
  include_descendants: boolean | number;
}

const RELOAD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let scheduledTasks: Map<number, cron.ScheduledTask> = new Map();

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
    `SELECT id, node_id, academic_year, cron_expression, endpoints_mb, endpoints_nex, include_descendants
     FROM admin.sync_schedules
     WHERE is_active = 1
     ORDER BY id`
  );

  if (result.error || !result.data) {
    console.error('Failed to load schedules:', result.error);
    return [];
  }

  return result.data;
}

function registerSchedule(schedule: SyncScheduleRow): void {
  const { cron_expression, id } = schedule;

  if (!cron.validate(cron_expression)) {
    console.warn(`[Schedule ${id}] Invalid cron expression: ${cron_expression} – skipping`);
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
      console.log(`[Schedule ${id}] Firing at ${now} – node ${schedule.node_id}, AY ${schedule.academic_year}`);

      try {
        const endpointsMb = parseEndpoints(schedule.endpoints_mb);
        const endpointsNex = parseEndpoints(schedule.endpoints_nex);

        const result = await runSync({
          nodeIds: [schedule.node_id],
          academicYear: schedule.academic_year,
          scheduleId: schedule.id,
          endpointsMb: endpointsMb ?? undefined,
          endpointsNex: endpointsNex ?? undefined,
          includeDescendants: !!(schedule.include_descendants),
          triggeredBy: 'scheduler',
        });

        console.log(
          `[Schedule ${id}] Run ${result.runId} completed: ${result.schoolsSucceeded} succeeded, ${result.schoolsFailed} failed`
        );
      } catch (err: unknown) {
        console.error(`[Schedule ${id}] Sync failed:`, err);
      }
    },
    { name: `sync-schedule-${id}` }
  );

  scheduledTasks.set(id, task);
  console.log(`[Schedule ${id}] Registered: ${cron_expression} – node ${schedule.node_id}, AY ${schedule.academic_year}`);
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
        console.log(`[Schedule ${id}] Unregistered`);
      }
    }
  }

  // Register new or updated schedules
  for (const schedule of schedules) {
    registerSchedule(schedule);
  }
}

async function main(): Promise<void> {
  console.log('🕐 Scheduler daemon starting...');

  const dbCheck = await executeQuery('SELECT 1 AS ok');
  if (dbCheck.error) {
    console.error('❌ Database connection failed:', dbCheck.error);
    process.exit(1);
  }
  console.log('✅ Database connection OK');

  await reloadSchedules();

  // Reload schedules periodically (e.g. after API add/update/delete)
  const reloadTimer = setInterval(reloadSchedules, RELOAD_INTERVAL_MS);

  console.log(`🕐 Scheduler daemon running. Reloading schedules every ${RELOAD_INTERVAL_MS / 1000}s. Ctrl+C to stop.`);

  process.on('SIGINT', () => {
    clearInterval(reloadTimer);
    for (const task of scheduledTasks.values()) {
      task.stop();
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    clearInterval(reloadTimer);
    for (const task of scheduledTasks.values()) {
      task.stop();
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
