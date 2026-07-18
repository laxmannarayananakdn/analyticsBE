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
type AuthSession = {
    accessToken: string;
    csrfToken: string;
    cookieHeader?: string;
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
    session?: AuthSession;
}): Promise<SupersetCacheWarmResult>;
/**
 * After FIS V2 publish:
 *  - Dashboard 33 (entity): warm charts for the entity that just ran
 *  - Dashboard 44 (HO USD): warm charts for every active entity
 * Soft-fail — never throws to the caller.
 */
export declare function warmSupersetCacheAfterFisV2(entityCode: string): Promise<void>;
export {};
//# sourceMappingURL=SupersetCacheWarmService.d.ts.map