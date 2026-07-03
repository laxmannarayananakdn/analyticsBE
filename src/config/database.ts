/**
 * Azure SQL Database Connection Configuration
 */

import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config: sql.config = {
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  options: {
    encrypt: true, // Required for Azure
    trustServerCertificate: false,
    enableArithAbort: true,
    requestTimeout: parseInt(process.env.AZURE_SQL_REQUEST_TIMEOUT_MS ?? '3600000', 10) || 3600000, // 60 min default for long FIS/RP ops
    connectionTimeout: 30000
  },
  pool: {
    max: parseInt(process.env.AZURE_SQL_POOL_MAX ?? '10', 10) || 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool: sql.ConnectionPool | null = null;

/**
 * Get or create database connection pool
 */
export async function getConnection(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    try {
      console.log('🔌 Connecting to Azure SQL Database...');
      pool = await sql.connect(config);
      console.log('✅ Connected to Azure SQL Database');
    } catch (error) {
      console.error('❌ Failed to connect to Azure SQL Database:', error);
      throw error;
    }
  }
  return pool;
}

/**
 * Close database connection pool
 */
export async function closeConnection(): Promise<void> {
  if (pool) {
    try {
      await pool.close();
      pool = null;
      console.log('🔌 Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
    }
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await getConnection();
    const result = await connection.request().query('SELECT 1 as test');
    return result.recordset.length > 0;
  } catch (error) {
    console.error('❌ Database connection test failed:', error);
    return false;
  }
}

/**
 * Execute a SQL query
 */
export async function executeQuery<T = any>(
  query: string,
  params?: Record<string, any>
): Promise<{ data: T[]; error: null } | { data: null; error: string }> {
  try {
    const connection = await getConnection();
    const request = connection.request();

    // Add parameters if provided
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        // Handle null values explicitly
        if (value === null || value === undefined) {
          request.input(key, sql.NVarChar(sql.MAX), null);
        } else if (typeof value === 'number') {
          if (Number.isInteger(value)) {
            request.input(key, sql.BigInt, value);
          } else {
            request.input(key, sql.Decimal(18, 2), value);
          }
        } else if (typeof value === 'boolean') {
          request.input(key, sql.Bit, value);
        } else if (value instanceof Date) {
          request.input(key, sql.DateTimeOffset, value);
        } else {
          // Convert to string for string types
          request.input(key, sql.NVarChar(sql.MAX), String(value));
        }
      });
    }

    const result = await request.query(query);
    return { data: result.recordset as T[], error: null };
  } catch (error: any) {
    console.error('❌ Query execution failed:', error);
    return { data: null, error: error.message || 'Database query failed' };
  }
}

/**
 * Execute a stored procedure
 */
export async function executeProcedure<T = any>(
  procedureName: string,
  params?: Record<string, any>
): Promise<{ data: T[]; error: null } | { data: null; error: string }> {
  try {
    const connection = await getConnection();
    const request = connection.request();

    // Surface SQL PRINT / RAISERROR(...,0/10,...) messages to the backend terminal.
    // Without this, node-mssql silently discards all PRINT output.
    request.on('info', (info) => {
      if (info?.message) {
        console.log(`[SQL:${procedureName}] ${info.message}`);
      }
    });

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (typeof value === 'number') {
          request.input(key, Number.isInteger(value) ? sql.BigInt : sql.Decimal(18, 2), value);
        } else if (typeof value === 'boolean') {
          request.input(key, sql.Bit, value);
        } else if (value instanceof Date) {
          request.input(key, sql.DateTimeOffset, value);
        } else {
          request.input(key, sql.NVarChar, value);
        }
      });
    }

    const result = await request.execute(procedureName);
    return { data: result.recordset as T[], error: null };
  } catch (error: any) {
    console.error('❌ Stored procedure execution failed:', error);
    return { data: null, error: error.message || 'Stored procedure execution failed' };
  }
}

/**
 * Atomically claim a scheduled sync run for schedule_id across all app instances.
 * Uses sp_getapplock (transaction-scoped) + INSERT in one transaction so parallel
 * API workers (e.g. multiple Azure instances each running startSyncScheduler) cannot
 * all pass a SELECT-then-INSERT race.
 *
 * @returns sync_runs.id to pass as existingRunId to runSync, or null if skipped.
 */
export async function claimSyncRunForSchedule(params: {
  scheduleId: number;
  nodeId: string;
  academicYear: string;
  triggeredBy: string;
}): Promise<number | null> {
  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();
    const request = new sql.Request(transaction);
    request.input('scheduleId', sql.Int, params.scheduleId);
    request.input('nodeId', sql.NVarChar(500), params.nodeId);
    request.input('academicYear', sql.NVarChar(200), params.academicYear);
    request.input('triggeredBy', sql.NVarChar(200), params.triggeredBy);

    const result = await request.query<{ run_id: number | null }>(
      `DECLARE @lr int;
       DECLARE @lockName nvarchar(200) = CONCAT(N'SyncSchedule_', CAST(@scheduleId AS nvarchar(20)));
       EXEC @lr = sp_getapplock @Resource = @lockName, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 0;

       DECLARE @runId int = NULL;
       DECLARE @ids TABLE (id int);

       IF (@lr = 0 OR @lr = 1)
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM admin.sync_runs
           WHERE schedule_id = @scheduleId
             AND (status IN (N'running', N'pending')
                  OR started_at >= DATEADD(minute, -2, SYSDATETIMEOFFSET()))
         )
         BEGIN
           INSERT INTO admin.sync_runs (schedule_id, node_id, academic_year, status, started_at, total_schools, schools_succeeded, schools_failed, triggered_by)
           OUTPUT INSERTED.id INTO @ids(id)
           VALUES (@scheduleId, @nodeId, @academicYear, N'running', SYSDATETIMEOFFSET(), 0, 0, 0, @triggeredBy);
           SELECT TOP 1 @runId = id FROM @ids;
         END
       END

       SELECT @runId AS run_id;`
    );

    const row = result.recordset?.[0];
    const runId = row?.run_id != null ? Number(row.run_id) : null;

    if (runId != null && !Number.isNaN(runId)) {
      await transaction.commit();
      return runId;
    }

    await transaction.rollback();
    return null;
  } catch (error: any) {
    console.error('❌ claimSyncRunForSchedule failed:', error);
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

export { sql };

