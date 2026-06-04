/**
 * Detect optional FIN.* columns so inserts work on older schemas.
 */
export interface FinTableColumnFlags {
    trialBalance: {
        hasRawAudit: boolean;
        hasEntityCode: boolean;
        hasPeriod: boolean;
    };
    dictionaryData: {
        hasRawAudit: boolean;
    };
}
export declare function clearFinTableColumnFlagsCache(): void;
export declare function getFinTableColumnFlags(): Promise<FinTableColumnFlags>;
//# sourceMappingURL=finTableColumns.d.ts.map