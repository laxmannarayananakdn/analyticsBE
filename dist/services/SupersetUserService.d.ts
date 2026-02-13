/**
 * Superset User Service
 * Syncs app users to Superset ab_user/ab_user_role via direct PostgreSQL (Option B).
 * Uses placeholder password - these users do not log into Superset directly.
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
 * Fetch all roles from Superset ab_role table.
 */
export declare function getSupersetRoles(): Promise<SupersetRole[]>;
/**
 * Sync a user to Superset (create or update roles).
 * - If user exists: update ab_user_role only.
 * - If user does not exist: insert ab_user + ab_user_role.
 *
 * Idempotent: safe to call multiple times.
 */
export declare function syncUserToSuperset(email: string, displayName: string | null, roleIds: number[]): Promise<void>;
//# sourceMappingURL=SupersetUserService.d.ts.map