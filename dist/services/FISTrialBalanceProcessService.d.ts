/**
 * Trial balance discovery and FIS column sync from FIN.TrialBalance.
 */
export interface TbEntityPeriod {
    entityCode: string;
    period: string;
    actualUploadId: number | null;
    budgetUploadId: number | null;
    actualFileName: string | null;
    budgetFileName: string | null;
    actualUploadedAt: string | null;
    budgetUploadedAt: string | null;
    actualRowCount: number | null;
    budgetRowCount: number | null;
}
export interface TbUploadInfo {
    uploadId: number;
    fileName: string;
    typeCode: 'FIN_TB_ACTUAL' | 'FIN_TB_BUDGET';
    uploadedAt: string;
    uploadedBy: string;
    rowCount: number | null;
}
export interface FisReportOutputRow {
    outputId: number;
    instanceId: number;
    columnId: number;
    columnLabel: string;
    lineItemCode: string;
    lineItemLabel: string;
    displayOrder: number;
    amount: number | null;
    formatType: string | null;
}
export declare function listTrialBalanceEntityPeriods(): Promise<TbEntityPeriod[]>;
/** Latest budget period on or before target (same fiscal year); null if none. */
export declare function resolveBudgetSourcePeriod(entityCode: string, period: string): Promise<string | null>;
export declare function getLatestTrialBalanceUploads(entityCode: string, period: string): Promise<{
    actual: TbUploadInfo | null;
    budget: TbUploadInfo | null;
    budgetSourcePeriod: string | null;
    budgetUsesFallback: boolean;
}>;
export type FisColumnKind = 'TB_SUM' | 'YTD_VARIANCE' | 'YTD_VAR_PCT';
export type FisColumnTbType = 'ACTUAL' | 'BUDGET';
export interface FisMonthColumnDef {
    columnOrder: number;
    columnLabel: string;
    fiscalYear: number;
    fiscalMonthFrom: number;
    fiscalMonthTo: number;
    isYtd: boolean;
    tbType: FisColumnTbType | null;
    columnKind: FisColumnKind;
}
export type FisColumnSortInput = {
    fiscalYear: number;
    fiscalMonthTo: number;
    isYtd: boolean;
    tbType: FisColumnTbType | null;
    columnKind: FisColumnKind;
    columnLabel?: string;
};
/** Within each month block: Budget before Actual; YTD Budget before YTD Actual. */
export declare function fisColumnBlockSortKey(col: FisColumnSortInput): number;
export declare function compareFisReportColumns(a: FisColumnSortInput, b: FisColumnSortInput): number;
/** Six columns per month: Budget, Actual, YTD Budget, YTD Actual, YTD Variance, YTD Var %. */
export declare function buildMonthColumnSet(period: string, startOrder?: number): FisMonthColumnDef[];
export declare function buildColumnsFromEntityTrialBalance(entityCode: string, period?: string): Promise<FisMonthColumnDef[]>;
/** Actual required for the period; budget may fall back to January (or latest revision). */
export declare function assertTrialBalanceDataForPeriod(entityCode: string, period: string): Promise<void>;
export declare function getReportOutputPreview(instanceId: number, limit?: number): Promise<{
    totalRows: number;
    rows: FisReportOutputRow[];
}>;
//# sourceMappingURL=FISTrialBalanceProcessService.d.ts.map