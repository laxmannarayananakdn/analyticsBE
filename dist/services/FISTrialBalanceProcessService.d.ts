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
export declare function getLatestTrialBalanceUploads(entityCode: string, period: string): Promise<{
    actual: TbUploadInfo | null;
    budget: TbUploadInfo | null;
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
/** Six columns per processed month: Actual, Budget, YTD Actual, YTD Budget, YTD Variance, YTD Var %. */
export declare function buildMonthColumnSet(period: string, startOrder?: number): FisMonthColumnDef[];
export declare function buildColumnsFromEntityTrialBalance(entityCode: string, period?: string): Promise<FisMonthColumnDef[]>;
/** Verify both Actual and Budget TB rows exist for entity + period. */
export declare function assertTrialBalanceDataForPeriod(entityCode: string, period: string): Promise<void>;
export declare function getReportOutputPreview(instanceId: number, limit?: number): Promise<{
    totalRows: number;
    rows: FisReportOutputRow[];
}>;
//# sourceMappingURL=FISTrialBalanceProcessService.d.ts.map