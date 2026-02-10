/**
 * Superset Service
 * Handles Superset API authentication and guest token generation
 */
export declare class SupersetService {
    private config;
    private accessTokenCache;
    constructor();
    /**
     * Get CSRF token from Superset
     * Note: Some Superset instances may require authentication for this endpoint
     */
    private getCsrfToken;
    /**
     * Authenticate with Superset and get access token
     * Uses API key if available, otherwise uses username/password
     */
    getAccessToken(forceRefresh?: boolean): Promise<string>;
    /**
     * Generate a guest token for embedded dashboards
     * If a pre-generated guest token is provided in config, returns it directly
     * Otherwise, generates a new one using authentication
     */
    generateGuestToken(dashboardId: number, resources?: Array<{
        type: string;
        id: string;
    }>): Promise<{
        token: string;
        expires_in?: number;
    }>;
    /**
     * Get list of dashboards
     */
    getDashboards(): Promise<any[]>;
    /**
     * Get dashboard by ID
     */
    getDashboard(dashboardId: number): Promise<any>;
}
export declare const supersetService: SupersetService;
//# sourceMappingURL=SupersetService.d.ts.map