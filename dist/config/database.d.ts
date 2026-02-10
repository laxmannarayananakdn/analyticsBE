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
export { sql };
//# sourceMappingURL=database.d.ts.map