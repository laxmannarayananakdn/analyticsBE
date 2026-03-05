/**
 * Superset User Service
 * Syncs app users to Superset ab_user/ab_user_role via direct PostgreSQL (Option B).
 *
 * - Password auth users: syncs bcrypt hash so they can log in with the same credentials.
 * - AppRegistration users: initial placeholder; they can set password in Superset for direct login (report creators).
 * - New users get created_on, changed_on, created_by_fk, changed_by_fk (required for Superset login).
 * - Password is never overwritten on update for AppRegistration users (preserves Superset-set passwords).
 * - Users without roles get default Gamma role (Superset requires at least one role).
 */
export interface SupersetRole {
    id: number;
    name: string;
}
/**
 * Check if Superset user sync is configured.
 */
export declare function isSupersetUserSyncEnabled(): boolean;
/**
 * Get Superset role IDs assigned to a user (by email).
 * Returns [] if user not found in Superset or Superset not configured.
 */
export declare function getSupersetRoleIdsForUser(email: string): Promise<number[]>;
/**
 * Fetch all roles from Superset ab_role table.
 */
export declare function getSupersetRoles(): Promise<SupersetRole[]>;
/**
 * Sync a user to Superset (create or update roles).
 * - If user exists: update ab_user (name, active, password) and ab_user_role.
 * - If user does not exist: insert ab_user + ab_user_role.
 *
 * @param passwordHash - Optional. Use the app user's bcrypt hash so they can log in to Superset with the same password.
 *   If omitted (AppRegistration users), a placeholder is used - they cannot log into Superset directly.
 *
 * Idempotent: safe to call multiple times.
 */
export declare function syncUserToSuperset(email: string, displayName: string | null, roleIds: number[], active?: boolean, passwordHash?: string | null): Promise<void>;
/**
 * Sync a user's active status to Superset.
 * - If user exists: update ab_user.active.
 * - If user does not exist and activating: create user with active=true (no roles).
 * - If user does not exist and deactivating: no-op.
 *
 * @param passwordHash - Optional. For Password auth users, pass so they can log in to Superset.
 *
 * Call this when user is activated/deactivated in the webapp.
 */
export declare function syncSupersetUserActiveStatus(email: string, isActive: boolean, displayName: string | null, passwordHash?: string | null): Promise<void>;
//# sourceMappingURL=SupersetUserService.d.ts.map