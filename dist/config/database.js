/**
 * Azure SQL Database Connection Configuration
 */
import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();
const config = {
    server: process.env.AZURE_SQL_SERVER || '',
    database: process.env.AZURE_SQL_DATABASE || '',
    user: process.env.AZURE_SQL_USER || '',
    password: process.env.AZURE_SQL_PASSWORD || '',
    options: {
        encrypt: true, // Required for Azure
        trustServerCertificate: false,
        enableArithAbort: true,
        requestTimeout: 300000, // 5 minutes for long-running queries
        connectionTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};
let pool = null;
/**
 * Get or create database connection pool
 */
export async function getConnection() {
    if (!pool || !pool.connected) {
        try {
            console.log('🔌 Connecting to Azure SQL Database...');
            pool = await sql.connect(config);
            console.log('✅ Connected to Azure SQL Database');
        }
        catch (error) {
            console.error('❌ Failed to connect to Azure SQL Database:', error);
            throw error;
        }
    }
    return pool;
}
/**
 * Close database connection pool
 */
export async function closeConnection() {
    if (pool) {
        try {
            await pool.close();
            pool = null;
            console.log('🔌 Database connection closed');
        }
        catch (error) {
            console.error('❌ Error closing database connection:', error);
        }
    }
}
/**
 * Test database connection
 */
export async function testConnection() {
    try {
        const connection = await getConnection();
        const result = await connection.request().query('SELECT 1 as test');
        return result.recordset.length > 0;
    }
    catch (error) {
        console.error('❌ Database connection test failed:', error);
        return false;
    }
}
/**
 * Execute a SQL query
 */
export async function executeQuery(query, params) {
    try {
        const connection = await getConnection();
        const request = connection.request();
        // Add parameters if provided
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                // Handle null values explicitly
                if (value === null || value === undefined) {
                    request.input(key, sql.NVarChar(sql.MAX), null);
                }
                else if (typeof value === 'number') {
                    if (Number.isInteger(value)) {
                        request.input(key, sql.BigInt, value);
                    }
                    else {
                        request.input(key, sql.Decimal(18, 2), value);
                    }
                }
                else if (typeof value === 'boolean') {
                    request.input(key, sql.Bit, value);
                }
                else if (value instanceof Date) {
                    request.input(key, sql.DateTimeOffset, value);
                }
                else {
                    // Convert to string for string types
                    request.input(key, sql.NVarChar(sql.MAX), String(value));
                }
            });
        }
        const result = await request.query(query);
        return { data: result.recordset, error: null };
    }
    catch (error) {
        console.error('❌ Query execution failed:', error);
        return { data: null, error: error.message || 'Database query failed' };
    }
}
/**
 * Execute a stored procedure
 */
export async function executeProcedure(procedureName, params) {
    try {
        const connection = await getConnection();
        const request = connection.request();
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    request.input(key, Number.isInteger(value) ? sql.BigInt : sql.Decimal(18, 2), value);
                }
                else if (typeof value === 'boolean') {
                    request.input(key, sql.Bit, value);
                }
                else if (value instanceof Date) {
                    request.input(key, sql.DateTimeOffset, value);
                }
                else {
                    request.input(key, sql.NVarChar, value);
                }
            });
        }
        const result = await request.execute(procedureName);
        return { data: result.recordset, error: null };
    }
    catch (error) {
        console.error('❌ Stored procedure execution failed:', error);
        return { data: null, error: error.message || 'Stored procedure execution failed' };
    }
}
export { sql };
//# sourceMappingURL=database.js.map