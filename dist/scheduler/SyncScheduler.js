/**
 * Sync Scheduler
 * Runs scheduled sync jobs from admin.sync_schedules.
 * Can be embedded in the API server (Azure Web App) or run standalone via scheduler-daemon.
 *
 * Set ENABLE_SCHEDULER=false to disable when running the API server.
 * Set CRON_TIMEZONE (e.g. Asia/Kolkata) for cron timezone; default is Asia/Kolkata (IST).
 */
import cron from 'node-cron';
import { executeQuery } from '../config/database.js';
import { runSync } from '../services/SyncOrchestratorService.js';
const RELOAD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let scheduledTasks = new Map();
let reloadTimer = null;
function parseEndpoints(json) {
    if (!json || !json.trim())
        return null;
    try {
        const arr = JSON.parse(json);
        return Array.isArray(arr) ? arr : null;
    }
    catch {
        return null;
    }
}
async function loadActiveSchedules() {
    const result = await executeQuery(`SELECT id, node_id, academic_year, cron_expression, endpoints_mb, endpoints_nex, include_descendants
     FROM admin.sync_schedules
     WHERE is_active = 1
     ORDER BY id`);
    if (result.error || !result.data) {
        console.error('[SyncScheduler] Failed to load schedules:', result.error);
        return [];
    }
    return result.data;
}
function getTimezone() {
    return process.env.CRON_TIMEZONE || 'Asia/Kolkata';
}
function registerSchedule(schedule) {
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
    const task = cron.schedule(cron_expression, async () => {
        const now = new Date().toISOString();
        console.log(`[SyncScheduler ${id}] Firing at ${now} – node ${schedule.node_id}, AY ${schedule.academic_year}`);
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
            console.log(`[SyncScheduler ${id}] Run ${result.runId} completed: ${result.schoolsSucceeded} succeeded, ${result.schoolsFailed} failed`);
        }
        catch (err) {
            console.error(`[SyncScheduler ${id}] Sync failed:`, err);
        }
    }, { timezone, name: `sync-schedule-${id}` });
    scheduledTasks.set(id, task);
    console.log(`[SyncScheduler ${id}] Registered: ${cron_expression} (${timezone}) – node ${schedule.node_id}, AY ${schedule.academic_year}`);
}
async function reloadSchedules() {
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
export async function startSyncScheduler() {
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
export function stopSyncScheduler() {
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
//# sourceMappingURL=SyncScheduler.js.map