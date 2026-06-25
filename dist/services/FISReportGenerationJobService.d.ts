/**
 * In-memory job tracker for long-running FIS report generation.
 * Allows the API to return immediately while the server batches SP calls.
 */
export type FisGenerationJobProgress = {
    phase: 'init' | 'sum' | 'finalize';
    current: number;
    total: number;
    label?: string;
    sumStep?: 'column';
    finalizeStep?: 'pit' | 'variance' | 'expression' | 'normalize';
    reportTypeCode?: string;
    batchIndex?: number;
    batchTotal?: number;
    startedAt?: number;
};
export type FisGenerationJobStatus = 'pending' | 'running' | 'success' | 'failed';
export type FisGenerationJobReportResult = {
    reportTypeCode: string;
    outputRowCount: number;
};
export type FisGenerationJob = {
    jobId: string;
    status: FisGenerationJobStatus;
    progress: FisGenerationJobProgress | null;
    result?: {
        reportTypeCode?: string;
        entityCode: string;
        asOfPeriod: string;
        outputRowCount?: number;
        fileStatus?: 'Preliminary' | 'Final';
        isTbLocked?: boolean;
        reports?: FisGenerationJobReportResult[];
    };
    error?: string;
    startedAt: number;
    completedAt?: number;
};
export declare function createGenerationJob(): string;
export declare function updateGenerationJobProgress(jobId: string, progress: FisGenerationJobProgress): void;
export declare function completeGenerationJob(jobId: string, result: NonNullable<FisGenerationJob['result']>): void;
export declare function failGenerationJob(jobId: string, error: string): void;
export declare function getGenerationJob(jobId: string): FisGenerationJob | null;
//# sourceMappingURL=FISReportGenerationJobService.d.ts.map