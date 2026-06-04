/** SQL Server CASE/bit values may arrive as 1, true, or '1' from mssql. */
export function isDbFlag(value) {
    return value === 1 || value === true || value === '1';
}
//# sourceMappingURL=sqlUtils.js.map