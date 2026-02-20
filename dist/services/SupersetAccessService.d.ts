/**
 * Superset Access Service
 * Checks if a user (by email) exists in Superset and has access to a dashboard.
 * Connects to Superset's PostgreSQL database for role-based access control.
 */
export interface SupersetAccessCheckResult {
    allowed: boolean;
    reason?: string;
}
/** RLS rule for guest token - matches Superset's expected format */
export interface SupersetRlsRule {
    clause: string;
    dataset: number;
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
/**
 * Get RLS (Row Level Security) rules for a Superset user by email/username.
 * Returns rules from row_level_security_filters that apply to the user's roles.
 * Used to pass RLS into guest tokens so embedded dashboards show the same
 * restricted data as when the user logs in directly to Superset.
 *
 * @param userEmail - User's email (must match ab_user.username or ab_user.email)
 * @returns Array of { clause, dataset } for the guest token, or [] if none/user not found
 */
export declare function getRlsRulesForUser(userEmail: string): Promise<SupersetRlsRule[]>;
//# sourceMappingURL=SupersetAccessService.d.ts.map