/**
 * Sync Scheduler
 * Runs scheduled sync jobs from admin.sync_schedules.
 * Can be embedded in the API server (Azure Web App) or run standalone via scheduler-daemon.
 *
 * Set ENABLE_SCHEDULER=false to disable when running the API server.
 * Set CRON_TIMEZONE (e.g. Asia/Kolkata) for cron timezone; default is Asia/Kolkata (IST).
 */
/**
 * Start the sync scheduler. Call this after the server/DB is ready.
 * No-op if ENABLE_SCHEDULER=false.
 */
export declare function startSyncScheduler(): Promise<void>;
/**
 * Stop the sync scheduler. Call on graceful shutdown.
 */
export declare function stopSyncScheduler(): void;
//# sourceMappingURL=SyncScheduler.d.ts.map