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

import bcrypt from 'bcrypt';
import pg from 'pg';

const { Pool } = pg;

export interface SupersetRole {
  id: number;
  name: string;
}

interface SupersetDbConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

function getSupersetDbConfig(): SupersetDbConfig | null {
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

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
  if (pool) return pool;
  const config = getSupersetDbConfig();
  if (!config) return null;
  pool = new Pool(config);
  return pool;
}

/**
 * Check if Superset user sync is configured.
 */
export function isSupersetUserSyncEnabled(): boolean {
  return getSupersetDbConfig() !== null;
}

/**
 * Get Superset role IDs assigned to a user (by email).
 * Returns [] if user not found in Superset or Superset not configured.
 */
export async function getSupersetRoleIdsForUser(email: string): Promise<number[]> {
  const db = getPool();
  if (!db) return [];

  try {
    const result = await db.query(
      `SELECT aur.role_id
       FROM ab_user_role aur
       JOIN ab_user u ON aur.user_id = u.id
       WHERE u.username = $1 OR u.email = $1`,
      [email]
    );
    return result.rows.map((r: { role_id: number }) => r.role_id);
  } catch (err) {
    console.error('SupersetUserService: Error fetching user roles:', err);
    return [];
  }
}

/**
 * Get default role ID for new users (Gamma or Public).
 * Superset requires at least one role - users with no roles get 500 on login.
 */
async function getDefaultRoleId(): Promise<number | null> {
  const db = getPool();
  if (!db) return null;
  try {
    const result = await db.query(
      `SELECT id FROM ab_role WHERE name IN ('Gamma', 'Public') ORDER BY CASE WHEN name = 'Gamma' THEN 0 ELSE 1 END LIMIT 1`
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch {
    return null;
  }
}

/**
 * Fetch all roles from Superset ab_role table.
 */
export async function getSupersetRoles(): Promise<SupersetRole[]> {
  const db = getPool();
  if (!db) {
    return [];
  }

  try {
    const result = await db.query(
      `SELECT id, name FROM ab_role ORDER BY name`
    );
    return result.rows.map((r: { id: number; name: string }) => ({
      id: r.id,
      name: r.name,
    }));
  } catch (err) {
    console.error('SupersetUserService: Error fetching roles:', err);
    throw new Error('Failed to fetch Superset roles');
  }
}

/** Placeholder password hash for users who cannot log into Superset (e.g. AppRegistration). */
async function getPlaceholderPasswordHash(): Promise<string> {
  const random = `superset-no-login-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return bcrypt.hash(random, 10);
}

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
export async function syncUserToSuperset(
  email: string,
  displayName: string | null,
  roleIds: number[],
  active: boolean = true,
  passwordHash?: string | null
): Promise<void> {
  const db = getPool();
  if (!db) {
    throw new Error('Superset database not configured');
  }

  const nameParts = (displayName || email).trim().split(/\s+/);
  const firstName = nameParts[0] || email.split('@')[0] || 'User';
  const lastName = nameParts.slice(1).join(' ') || 'Account';

  try {
    const existingResult = await db.query(
      `SELECT id FROM ab_user WHERE username = $1 OR email = $1 LIMIT 1`,
      [email]
    );

    let userId: number;

    const hashToUse = passwordHash && passwordHash.length > 0
      ? passwordHash
      : await getPlaceholderPasswordHash();

    if (existingResult.rows.length > 0) {
      userId = existingResult.rows[0].id;
      // Update name and active status. Only update password when we have one from our app -
      // do NOT overwrite if user set password in Superset (e.g. AppRegistration report creators).
      if (passwordHash && passwordHash.length > 0) {
        await db.query(
          `UPDATE ab_user SET first_name = $1, last_name = $2, active = $3, password = $4, changed_on = NOW()
           WHERE id = $5`,
          [firstName, lastName, active, hashToUse, userId]
        );
      } else {
        await db.query(
          `UPDATE ab_user SET first_name = $1, last_name = $2, active = $3, changed_on = NOW()
           WHERE id = $4`,
          [firstName, lastName, active, userId]
        );
      }
    } else {
      // Single INSERT with audit columns - currval() uses the id from nextval() in same statement
      const insertResult = await db.query(
        `INSERT INTO ab_user (
          id, first_name, last_name, username, email, password, active,
          created_on, changed_on, created_by_fk, changed_by_fk
        ) VALUES (
          nextval('ab_user_id_seq'), $1, $2, $3, $4, $5, $6,
          NOW(), NOW(),
          currval('ab_user_id_seq'), currval('ab_user_id_seq')
        )
         RETURNING id`,
        [firstName, lastName, email, email, hashToUse, active]
      );
      userId = insertResult.rows[0].id;
    }

    // Replace role assignments. Superset requires at least one role - users with no roles get 500 on login.
    await db.query(`DELETE FROM ab_user_role WHERE user_id = $1`, [userId]);

    let rolesToAssign = roleIds.length > 0 ? roleIds : [];
    if (rolesToAssign.length === 0) {
      const defaultRoleId = await getDefaultRoleId();
      if (defaultRoleId) rolesToAssign = [defaultRoleId];
    }
    if (rolesToAssign.length > 0) {
      const values = rolesToAssign.map((_, i) => `(nextval('ab_user_role_id_seq'), $1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO ab_user_role (id, user_id, role_id) VALUES ${values}`,
        [userId, ...rolesToAssign]
      );
    }
  } catch (err) {
    console.error('SupersetUserService: Error syncing user:', err);
    throw new Error(
      err instanceof Error ? err.message : 'Failed to sync user to Superset'
    );
  }
}

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
export async function syncSupersetUserActiveStatus(
  email: string,
  isActive: boolean,
  displayName: string | null,
  passwordHash?: string | null
): Promise<void> {
  const db = getPool();
  if (!db) {
    return; // Superset not configured - skip silently
  }

  const nameParts = (displayName || email).trim().split(/\s+/);
  const firstName = nameParts[0] || email.split('@')[0] || 'User';
  const lastName = nameParts.slice(1).join(' ') || 'Account';

  try {
    const existingResult = await db.query(
      `SELECT id FROM ab_user WHERE username = $1 OR email = $1 LIMIT 1`,
      [email]
    );

    if (existingResult.rows.length > 0) {
      const userId = existingResult.rows[0].id;
      await db.query(
        `UPDATE ab_user SET active = $1, first_name = $2, last_name = $3, changed_on = NOW()
         WHERE id = $4`,
        [isActive, firstName, lastName, userId]
      );
    } else if (isActive) {
      // User doesn't exist in Superset but we're activating - create with minimal config
      await syncUserToSuperset(email, displayName, [], true, passwordHash);
    }
    // If deactivating and user doesn't exist in Superset: no-op
  } catch (err) {
    console.error('SupersetUserService: Error syncing user active status:', err);
    throw new Error(
      err instanceof Error ? err.message : 'Failed to sync user active status to Superset'
    );
  }
}
