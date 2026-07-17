/**
 * Sync BS PREVIOUS_YEAR from period …00 into monthly as_of_period slices.
 */
import type { FisFileStatus } from './FISRunTrackingService.js';
export declare function syncBsPreviousYearColumn(params: {
    entityCode: string;
    /** YYYY00 source period, or any YYYYMM of the same reporting year (resolves to …00). */
    period: string;
    fileStatus?: FisFileStatus | null;
    /** live = rp.fis_report_output; new = rp.fis_report_output_new */
    outputTable?: 'live' | 'new';
}): Promise<{
    sourcePeriod: string;
    monthlyPeriodsUpdated: number;
    rowsCopied: number;
}>;
/** After monthly BS publish: restore PREVIOUS_YEAR from …00 if present. */
export declare function restoreBsPreviousYearAfterMonthlyRun(params: {
    entityCode: string;
    asOfPeriod: string;
    fileStatus?: FisFileStatus | null;
    outputTable?: 'live' | 'new';
}): Promise<void>;
//# sourceMappingURL=FISPreviousYearSyncService.d.ts.map