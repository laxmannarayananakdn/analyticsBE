/**
 * Map FIS SFTP finance filenames to EF file type codes.
 *
 * Dictionary: Dic_{Type}_{...}.xlsx  e.g. Dic_Account_202604.xlsx
 * Trial balance: TB_{...}_{Actual|Budget}.xlsx  e.g. TB_202601_TZES_Actual.xlsx
 */
export type FinanceFileCategory = 'DIC' | 'TB' | 'UNKNOWN';
export interface ResolvedFinanceFileType {
    fileTypeCode: string;
    category: FinanceFileCategory;
}
export declare function getFinanceFileCategory(fileName: string): FinanceFileCategory;
/**
 * Resolve filename to EF file type code, or null if unrecognized.
 */
export declare function resolveFinanceFileType(fileName: string): ResolvedFinanceFileType | null;
export declare function isFinanceFileTypeCode(fileTypeCode: string): boolean;
export interface ParsedTrialBalanceFileName {
    /** Normalized file name (no path) */
    sourceFileName: string;
    periodYyyymm: string;
    entityCode: string;
    tbKind: 'ACTUAL' | 'BUDGET';
    fiscalYear: number;
    fiscalMonth: number;
    /** Human-readable column label, e.g. "January 2026 Actual" */
    columnLabel: string;
}
/**
 * Parse TB_YYYYMM_ENTY_Actual|Budget.xlsx filenames.
 */
export declare function parseTrialBalanceFileName(fileName: string): ParsedTrialBalanceFileName | null;
/**
 * Build column metadata from entity + YYYYMM period (no file name required).
 */
/**
 * Ensure TB filename parses and matches the submitted file type (Actual/Budget).
 * Throws when entity, period, or tb type cannot be derived or do not agree.
 */
export declare function validateTrialBalanceFileIdentity(fileName: string, fileTypeCode: string): ParsedTrialBalanceFileName;
export declare function parseTrialBalancePeriod(entityCode: string, periodYyyymm: string): ParsedTrialBalanceFileName | null;
//# sourceMappingURL=financeFileNameResolver.d.ts.map