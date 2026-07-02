/**
 * Phase 4: FIS run tracking, TB period coverage, entity-period locks.
 */
import { FinanceTrialBalanceRecord } from '../types/ef.js';
export type FisFileStatus = 'Preliminary' | 'Final';
export declare function isFisPhase4Enabled(): boolean;
export declare function normalizeTbFileStatus(raw: string | null | undefined): FisFileStatus | null;
export declare function assertHomogeneousTbStatus(records: FinanceTrialBalanceRecord[]): FisFileStatus;
export declare function assertTbUploadAllowed(entityCode: string, period: string): Promise<void>;
export declare function upsertTbPeriodCoverage(params: {
    entityCode: string;
    period: string;
    tbType: 'ACTUAL' | 'BUDGET';
    uploadId: number;
    fileName: string;
    fileStatus: FisFileStatus;
    rowCount: number;
}): Promise<void>;
export declare function maybeLockEntityPeriod(entityCode: string, period: string, lockedBy: string | null): Promise<boolean>;
export interface ResolvedTbFileStatus {
    fileStatus: FisFileStatus;
    actualUploadId: number | null;
    budgetUploadId: number | null;
    actualFileName: string | null;
    budgetFileName: string | null;
    actualTbStatus: FisFileStatus;
    budgetTbStatus: FisFileStatus | null;
    isTbLocked: boolean;
}
export declare function resolveFileStatusForPeriod(entityCode: string, period: string): Promise<ResolvedTbFileStatus>;
export declare function resolveRunLoggingContext(entityCode: string, period: string): Promise<{
    fileStatus: FisFileStatus;
    actualUploadId: number | null;
    budgetUploadId: number | null;
    actualFileName: string | null;
    budgetFileName: string | null;
    actualTbStatus: FisFileStatus;
    budgetTbStatus: FisFileStatus;
}>;
export declare function startReportRun(params: {
    reportTypeCode: string;
    entityCode: string;
    asOfPeriod: string;
    fileStatus: FisFileStatus;
    triggeredBy: string | null;
    actualUploadId: number | null;
    budgetUploadId: number | null;
    actualFileName: string | null;
    budgetFileName: string | null;
    actualTbStatus: FisFileStatus;
    budgetTbStatus: FisFileStatus | null;
}): Promise<number | null>;
export declare function completeReportRun(runId: number | null, success: boolean, outputRowCount: number, errorMessage?: string | null): Promise<void>;
export interface FisRunCalendarRow {
    entityCode: string;
    period: string;
    reportYear: number;
    reportMonth: number;
    actualUploadId: number | null;
    actualFileName: string | null;
    actualFileStatus: string | null;
    budgetUploadId: number | null;
    budgetFileName: string | null;
    budgetFileStatus: string | null;
    isTbLocked: boolean;
    tbLockedAt: string | null;
    nfLastRunAt: string | null;
    nfOutputRows: number | null;
    nfFileStatus: string | null;
    plLastRunAt: string | null;
    plOutputRows: number | null;
    plFileStatus: string | null;
    bsLastRunAt: string | null;
    bsOutputRows: number | null;
    bsFileStatus: string | null;
    cfLastRunAt: string | null;
    cfOutputRows: number | null;
    cfFileStatus: string | null;
}
export declare function getRunCalendar(entityCode?: string, year?: string): Promise<FisRunCalendarRow[]>;
export declare function getPeriodCoverage(entityCode: string, period: string): Promise<{
    entityCode: string;
    period: string;
    actualFileStatus: string | null;
    budgetFileStatus: string | null;
    isTbLocked: boolean;
} | null>;
//# sourceMappingURL=FISRunTrackingService.d.ts.map