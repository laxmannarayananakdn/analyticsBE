/**
 * Superset Access Service
 * Checks if a user (by email) exists in Superset and has access to a dashboard.
 * Connects to Superset's PostgreSQL database for role-based access control.
 */
export interface SupersetAccessCheckResult {
    allowed: boolean;
    reason?: string;
}
/**
 * Check if a user (identified by email) exists in Superset and has access to the dashboard.
 * Uses Superset's ab_user, ab_user_role, dashboard_roles tables.
 *
 * @param userEmail - User's email (must match ab_user.username or ab_user.email)
 * @param dashboardId - Dashboard UUID (from Superset embed UI) or numeric id
 * @returns Result indicating if access is allowed
 */
export declare function checkSupersetDashboardAccess(userEmail: string, dashboardId: string): Promise<SupersetAccessCheckResult>;
/**
 * Check if Superset DB access check is configured and enabled.
 */
export declare function isSupersetAccessCheckEnabled(): boolean;
//# sourceMappingURL=SupersetAccessService.d.ts.map