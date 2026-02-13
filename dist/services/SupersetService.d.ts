/**
 * Superset Service
 * Handles Superset API authentication and guest token generation
 */
export declare class SupersetService {
    private config;
    private accessTokenCache;
    constructor();
    /**
     * Get CSRF token from Superset, plus session cookie for subsequent POSTs.
     * @param bearerToken - When provided, use Bearer auth (required by some Superset instances).
     *                      When absent, fallback to Basic auth.
     */
    private getCsrfToken;
    /**
     * Authenticate with Superset and get access token
     * Uses API key if available, otherwise uses username/password
     */
    getAccessToken(forceRefresh?: boolean): Promise<string>;
    /**
     * Generate a guest token for embedded dashboards
     * @param dashboardId - Dashboard ID (numeric or UUID string)
     * @param usePreGenerated - If true and SUPERSET_GUEST_TOKEN is set, return it (use only when token matches dashboard)
     */
    generateGuestToken(dashboardId: number | string, resources?: Array<{
        type: string;
        id: string;
    }>, usePreGenerated?: boolean): Promise<{
        token: string;
        expires_in?: number;
    }>;
    /**
     * Get list of dashboards
     */
    getDashboards(): Promise<any[]>;
    /**
     * Get embedded dashboard UUID for a dashboard by its integer ID
     * Required for embedded SDK - Superset uses UUIDs for /embedded/{uuid} URLs
     * Returns 404 if embedding is not enabled for the dashboard
     */
    getEmbeddedDashboardUuid(dashboardId: number): Promise<string>;
    /**
     * Get dashboard by ID
     */
    getDashboard(dashboardId: number): Promise<any>;
}
export declare const supersetService: SupersetService;
//# sourceMappingURL=SupersetService.d.ts.map