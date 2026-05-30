/**
 * Azure SQL Database Connection Configuration
 */
import sql from 'mssql';
/**
 * Get or create database connection pool
 */
export declare function getConnection(): Promise<sql.ConnectionPool>;
/**
 * Close database connection pool
 */
export declare function closeConnection(): Promise<void>;
/**
 * Test database connection
 */
export declare function testConnection(): Promise<boolean>;
/**
 * Execute a SQL query
 */
export declare function executeQuery<T = any>(query: string, params?: Record<string, any>): Promise<{
    data: T[];
    error: null;
} | {
    data: null;
    error: string;
}>;
/**
 * Execute a stored procedure
 */
export declare function executeProcedure<T = any>(procedureName: string, params?: Record<string, any>): Promise<{
    data: T[];
    error: null;
} | {
    data: null;
    error: string;
}>;
/**
 * Atomically claim a scheduled sync run for schedule_id across all app instances.
 * Uses sp_getapplock (transaction-scoped) + INSERT in one transaction so parallel
 * API workers (e.g. multiple Azure instances each running startSyncScheduler) cannot
 * all pass a SELECT-then-INSERT race.
 *
 * @returns sync_runs.id to pass as existingRunId to runSync, or null if skipped.
 */
export declare function claimSyncRunForSchedule(params: {
    scheduleId: number;
    nodeId: string;
    academicYear: string;
    triggeredBy: string;
}): Promise<number | null>;
/**
 * Run FIS SFTP poll work only if this app instance acquires a cluster-wide lock.
 * Uses sp_getapplock on a dedicated pool connection so parallel Azure instances
 * cannot all process the same SFTP files.
 *
 * @returns fn result, or null if another instance is already polling
 */
export declare function withFisSftpPollLock<T>(fn: () => Promise<T>): Promise<T | null>;
export { sql };
//# sourceMappingURL=database.d.ts.map