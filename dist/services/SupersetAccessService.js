/**
 * Superset Access Service
 * Checks if a user (by email) exists in Superset and has access to a dashboard.
 * Connects to Superset's PostgreSQL database for role-based access control.
 */
import pg from 'pg';
const { Pool } = pg;
function getSupersetDbConfig() {
    const connStr = process.env.SUPERSET_DATABASE_URL;
    if (connStr) {
        return { connectionString: connStr };
    }
    const host = process.env.SUPERSET_DB_HOST;
    const database = process.env.SUPERSET_DB_NAME || process.env.SUPERSET_DB_DATABASE;
    const user = process.env.SUPERSET_DB_USER;
    const password = process.env.SUPERSET_DB_PASSWORD;
    if (host && database && user && password) {
        return {
            host,
            port: parseInt(process.env.SUPERSET_DB_PORT || '5432', 10),
            database,
            user,
            password,
        };
    }
    return null;
}
let pool = null;
function getPool() {
    if (pool)
        return pool;
    const config = getSupersetDbConfig();
    if (!config)
        return null;
    pool = new Pool(config);
    return pool;
}
/**
 * Check if a user (identified by email) exists in Superset and has access to the dashboard.
 * Uses Superset's ab_user, ab_user_role, dashboard_roles tables.
 *
 * @param userEmail - User's email (must match ab_user.username or ab_user.email)
 * @param dashboardId - Dashboard UUID (from Superset embed UI) or numeric id
 * @returns Result indicating if access is allowed
 */
export async function checkSupersetDashboardAccess(userEmail, dashboardId) {
    const db = getPool();
    if (!db) {
        // No Superset DB configured - skip access check (fail open for backwards compat)
        return { allowed: true };
    }
    try {
        // 1. Find user by email (Superset may use username=email or has separate email column)
        const userResult = await db.query(`SELECT id FROM ab_user
       WHERE (username = $1 OR email = $1) AND active = true
       LIMIT 1`, [userEmail]);
        if (userResult.rows.length === 0) {
            return { allowed: false, reason: 'user_not_found' };
        }
        const userId = userResult.rows[0].id;
        // 2. Resolve dashboard - support UUID (string) or numeric id
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dashboardId);
        const dashboardResult = await db.query(isUuid
            ? `SELECT id FROM dashboards WHERE uuid = $1::uuid LIMIT 1`
            : `SELECT id FROM dashboards WHERE id = $1::int LIMIT 1`, [dashboardId]);
        if (dashboardResult.rows.length === 0) {
            return { allowed: false, reason: 'dashboard_not_found' };
        }
        const dashboardDbId = dashboardResult.rows[0].id;
        // 3. Check dashboard access:
        // - If dashboard has no roles (dashboard_roles empty): allow (public dashboard)
        // - If dashboard has roles: user must have at least one of those roles
        // - Admin role typically has access to everything
        const accessResult = await db.query(`WITH user_roles AS (
         SELECT role_id FROM ab_user_role WHERE user_id = $1
       ),
       dashboard_role_ids AS (
         SELECT role_id FROM dashboard_roles WHERE dashboard_id = $2
       ),
       admin_role AS (
         SELECT id FROM ab_role WHERE name = 'Admin' LIMIT 1
       )
       SELECT
         (SELECT COUNT(*) FROM dashboard_role_ids) AS dashboard_role_count,
         (SELECT COUNT(*) FROM user_roles ur
          INNER JOIN dashboard_role_ids dr ON ur.role_id = dr.role_id) AS matching_roles,
         (SELECT COUNT(*) FROM user_roles ur
          INNER JOIN admin_role ar ON ur.role_id = ar.id) AS is_admin
      `, [userId, dashboardDbId]);
        const row = accessResult.rows[0];
        const dashboardRoleCount = parseInt(row.dashboard_role_count || '0', 10);
        const matchingRoles = parseInt(row.matching_roles || '0', 10);
        const isAdmin = parseInt(row.is_admin || '0', 10) > 0;
        // Admin has access to all dashboards
        if (isAdmin) {
            return { allowed: true };
        }
        // Dashboard has no RBAC roles - typically public/published, allow
        if (dashboardRoleCount === 0) {
            return { allowed: true };
        }
        // Dashboard has roles - user must have at least one
        if (matchingRoles > 0) {
            return { allowed: true };
        }
        return { allowed: false, reason: 'no_dashboard_access' };
    }
    catch (err) {
        console.error('SupersetAccessService: Error checking access:', err);
        // On DB error: fail closed (deny access) to be safe
        return { allowed: false, reason: 'user_not_found' };
    }
}
/**
 * Check if Superset DB access check is configured and enabled.
 */
export function isSupersetAccessCheckEnabled() {
    return getSupersetDbConfig() !== null;
}
/**
 * Get RLS (Row Level Security) rules for a Superset user by email/username.
 * Returns rules from row_level_security_filters that apply to the user's roles.
 * Used to pass RLS into guest tokens so embedded dashboards show the same
 * restricted data as when the user logs in directly to Superset.
 *
 * @param userEmail - User's email (must match ab_user.username or ab_user.email)
 * @returns Array of { clause, dataset } for the guest token, or [] if none/user not found
 */
export async function getRlsRulesForUser(userEmail) {
    const db = getPool();
    if (!db) {
        return [];
    }
    try {
        // Get RLS rules: filters that apply to the user's roles, with their dataset (table) mappings
        // Schema: row_level_security_filters, rls_filter_roles, rls_filter_tables, ab_user_role, ab_user
        const result = await db.query(`SELECT DISTINCT rlsf.clause, rft.table_id AS dataset_id
       FROM row_level_security_filters rlsf
       JOIN rls_filter_roles rfr ON rlsf.id = rfr.rls_filter_id
       JOIN rls_filter_tables rft ON rlsf.id = rft.rls_filter_id
       JOIN ab_user_role aur ON rfr.role_id = aur.role_id
       JOIN ab_user u ON aur.user_id = u.id
       WHERE (u.username = $1 OR u.email = $1) AND u.active = true`, [userEmail]);
        const rules = result.rows.map((r) => ({
            clause: r.clause,
            dataset: r.dataset_id,
        }));
        if (rules.length > 0) {
            console.log(`🔒 RLS: Loaded ${rules.length} rule(s) for ${userEmail} (roles from Superset)`);
        }
        return rules;
    }
    catch (err) {
        console.error('SupersetAccessService: Error fetching RLS rules:', err);
        return [];
    }
}
//# sourceMappingURL=SupersetAccessService.js.map