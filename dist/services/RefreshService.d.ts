/**
 * RP Refresh Service
 *
 * Runs the 12-step RP refresh pipeline (stored procedures) for a school + academic year.
 * Triggered automatically when a Sync Schedule runs with "Run RP refresh after sync" checked.
 * Uses a separate connection pool with no command timeout per design guide Section 5.5.
 */
/**
 * Close the refresh pool (for graceful shutdown).
 */
export declare function closeRefreshPool(): Promise<void>;
export interface TriggerRefreshParams {
    school_id: string;
    /** Required. Same format as Sync Schedules (e.g. "2024 - 2025"). */
    academic_year: string;
    triggered_by?: string;
}
/**
 * Run the full 12-step RP refresh pipeline.
 * Requires school_id and academic_year (same as Sync Schedules).
 * On error: stops pipeline, does NOT run step 12. Error is logged by the SP to refresh_job_log.
 */
export declare function runRefreshPipeline(params: TriggerRefreshParams): Promise<{
    job_run_id: string;
}>;
/**
 * Trigger the RP refresh pipeline in the background (fire-and-forget).
 * Called by SyncOrchestratorService when load_rp_schema is checked and sync completes.
 */
export declare function triggerRefresh(params: TriggerRefreshParams): Promise<{
    job_run_id: string;
}>;
//# sourceMappingURL=RefreshService.d.ts.map