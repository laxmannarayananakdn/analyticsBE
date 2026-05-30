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
//# sourceMappingURL=financeFileNameResolver.d.ts.map