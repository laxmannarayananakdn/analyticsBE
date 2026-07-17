/**
 * File logger for FIS report processing.
 * Tees existing console output (timing + SQL PRINT) into backend/logs/
 * on local dev only (not Azure). Does not add new log messages.
 *
 * Filename: <RunNumber>_<ENTITY>_<asOfPeriod>_<Actual|Budget|ActualBudget>.log
 */
export declare function resolveFisLogTbSide(params: {
    actualUploadId?: number | null;
    budgetUploadId?: number | null;
}): 'Actual' | 'Budget' | 'ActualBudget';
export declare function getFisProcessLogPath(): string | null;
/**
 * Run FIS generation with console output teed to a per-run log file (local only).
 * No-op on Azure / when disabled / when runId is missing.
 */
export declare function withFisProcessLog<T>(context: {
    runId: number | null;
    entity: string;
    asOfPeriod: string;
    reportTypeCode?: string;
    actualUploadId?: number | null;
    budgetUploadId?: number | null;
}, fn: () => Promise<T>): Promise<T>;
//# sourceMappingURL=fisProcessLog.d.ts.map