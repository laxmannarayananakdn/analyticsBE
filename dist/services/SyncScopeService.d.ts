/**
 * Sync Scope Service
 * Resolves which school configs (ManageBac and Nexquare) to sync based on node(s), with optional descendant inclusion.
 * Used by SyncOrchestratorService to determine the scope of a sync run.
 */
import type { ManageBacConfig, NexquareConfig } from '../middleware/configLoader.js';
export interface GetConfigsForScopeParams {
    /** Node ID(s) to sync. If empty and not `all`, returns empty. */
    nodeIds?: string[];
    /** Include descendant nodes (children, etc.) in scope. Default false. */
    includeDescendants?: boolean;
    /** If true, return all active configs from both sources, ignoring nodeIds. */
    all?: boolean;
    /** Academic year - reserved for future use (e.g. AY-specific config). Not used in scope resolution. */
    academicYear?: string;
    /** When set, return only these MB config IDs (overrides node/all for MB). */
    configIdsMb?: number[];
    /** When set, return only these NEX config IDs (overrides node/all for NEX). */
    configIdsNex?: number[];
}
export interface GetConfigsForScopeResult {
    mb: ManageBacConfig[];
    nex: NexquareConfig[];
}
/**
 * Get school configs for the given scope.
 * - If `configIdsMb` / `configIdsNex`: return only those configs (overrides node/all for that source).
 * - If `all`: return all active MB and NEX configs.
 * - If `nodeIds`: return configs whose schools are in Node_School for those nodes (and optionally descendants).
 * - Configs must have school_id populated and match Node_School.School_ID for the given source.
 */
export declare function getConfigsForScope(params: GetConfigsForScopeParams): Promise<GetConfigsForScopeResult>;
//# sourceMappingURL=SyncScopeService.d.ts.map