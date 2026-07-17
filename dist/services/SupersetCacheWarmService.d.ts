/**
 * Warm Superset chart cache for FIS dashboards after report generation.
 * Soft-fail friendly — callers should not fail FIS jobs if warm fails.
 */
export type SupersetCacheWarmResult = {
    dashboardId: number;
    entityCodes: string[];
    chartCount: number;
    ok: number;
    failed: number;
    skipped: boolean;
    skipReason?: string;
    durationMs: number;
};
/** When false, FIS V2 skips post-run cache warm. Default: enabled. */
export declare function isSupersetCacheWarmEnabled(): boolean;
/**
 * Warm FIS dashboard charts for one or more entity codes (entity-filter context).
 * Safe to call after FIS V2 publish; does not throw on partial chart failures.
 */
export declare function warmSupersetCacheForEntities(params: {
    entityCodes: string[];
    dashboardId?: number;
    delayMs?: number;
}): Promise<SupersetCacheWarmResult>;
/**
 * Fire-and-forget / soft-fail wrapper for FIS V2 completion.
 */
export declare function warmSupersetCacheAfterFisV2(entityCode: string): Promise<void>;
//# sourceMappingURL=SupersetCacheWarmService.d.ts.map