/**
 * Sync Orchestrator Service
 * Runs data sync for schools (ManageBac and Nexquare) with run tracking.
 * Invokes existing ManageBacService and NexquareService - no modifications to those services.
 */
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
}
export interface RunSyncResult {
    runId: number;
    status: 'completed' | 'failed' | 'running';
    totalSchools: number;
    schoolsSucceeded: number;
    schoolsFailed: number;
    errorSummary?: string;
}
/**
 * Run sync for the given scope.
 * Processes schools sequentially to avoid ManageBacService singleton conflicts.
 */
export declare function runSync(params: RunSyncParams): Promise<RunSyncResult>;
//# sourceMappingURL=SyncOrchestratorService.d.ts.map