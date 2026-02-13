/**
 * Superset User Service
 * Syncs app users to Superset ab_user/ab_user_role via direct PostgreSQL (Option B).
 * Uses placeholder password - these users do not log into Superset directly.
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

/** Placeholder password hash for users who never log into Superset. */
async function getPlaceholderPasswordHash(): Promise<string> {
  const random = `superset-no-login-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return bcrypt.hash(random, 10);
}

/**
 * Sync a user to Superset (create or update roles).
 * - If user exists: update ab_user_role only.
 * - If user does not exist: insert ab_user + ab_user_role.
 *
 * Idempotent: safe to call multiple times.
 */
export async function syncUserToSuperset(
  email: string,
  displayName: string | null,
  roleIds: number[]
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

    if (existingResult.rows.length > 0) {
      userId = existingResult.rows[0].id;
      // Update name in case it changed
      await db.query(
        `UPDATE ab_user SET first_name = $1, last_name = $2, active = true, changed_on = NOW()
         WHERE id = $3`,
        [firstName, lastName, userId]
      );
    } else {
      const passwordHash = await getPlaceholderPasswordHash();
      const insertResult = await db.query(
        `INSERT INTO ab_user (id, first_name, last_name, username, email, password, active)
         VALUES (nextval('ab_user_id_seq'), $1, $2, $3, $4, $5, true)
         RETURNING id`,
        [firstName, lastName, email, email, passwordHash]
      );
      userId = insertResult.rows[0].id;
    }

    // Replace role assignments
    await db.query(`DELETE FROM ab_user_role WHERE user_id = $1`, [userId]);

    if (roleIds.length > 0) {
      const values = roleIds.map((_, i) => `(nextval('ab_user_role_id_seq'), $1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO ab_user_role (id, user_id, role_id) VALUES ${values}`,
        [userId, ...roleIds]
      );
    }
  } catch (err) {
    console.error('SupersetUserService: Error syncing user:', err);
    throw new Error(
      err instanceof Error ? err.message : 'Failed to sync user to Superset'
    );
  }
}
