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
/**
 * Run sync for the given scope.
 * MB and Nex tracks run in parallel; within each track, schools process serially.
 */
export declare function runSync(params: RunSyncParams): Promise<RunSyncResult>;
//# sourceMappingURL=SyncOrchestratorService.d.ts.map