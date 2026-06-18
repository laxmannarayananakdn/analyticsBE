/**
 * FIS processing logs: SFTP pulls (EF uploads) and report generation run history.
 */
export interface FisSftpPullLogRow {
    uploadId: number;
    fileName: string;
    fileTypeCode: string;
    category: 'TB' | 'DIC' | 'OTHER';
    entityCode: string | null;
    period: string | null;
    tbKind: 'ACTUAL' | 'BUDGET' | null;
    pullStatus: string;
    rowCount: number | null;
    uploadedBy: string;
    uploadedAt: string;
    processedAt: string | null;
    errorMessage: string | null;
}
/** One row per report generation attempt (admin.fis_report_runs). */
export interface FisReportProcessingAttemptRow {
    runId: number;
    reportTypeCode: string;
    entityCode: string;
    period: string;
    outputFileStatus: string;
    runStatus: string;
    triggeredBy: string | null;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    outputRowCount: number | null;
    errorMessage: string | null;
    actualFileStatus: string | null;
    budgetFileStatus: string | null;
    actualFileName: string | null;
    budgetFileName: string | null;
}
export declare function listSftpPullLog(params: {
    limit?: number;
    entityCode?: string;
    period?: string;
}): Promise<FisSftpPullLogRow[]>;
export declare function listReportProcessingAttempts(params: {
    limit?: number;
    entityCode?: string;
    period?: string;
}): Promise<FisReportProcessingAttemptRow[]>;
/** @deprecated Use listReportProcessingAttempts */
export declare function listReportProcessingLog(params: {
    limit?: number;
    entityCode?: string;
    period?: string;
}): Promise<FisReportProcessingAttemptRow[]>;
//# sourceMappingURL=FISProcessingLogService.d.ts.map