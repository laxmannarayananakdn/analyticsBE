/**
 * Trial balance entity/period backfill only.
 * Report instances and columns are created manually via FIS Report Processing.
 */
import { type ParsedTrialBalanceFileName } from '../utils/financeFileNameResolver.js';
/** Set entity_code / period on all rows for this upload file. */
export declare function backfillTrialBalanceEntityPeriod(parsed: ParsedTrialBalanceFileName): Promise<number>;
/**
 * Backfill entity_code / period on FIN.TrialBalance from distinct TB file names in the table.
 */
export declare function repairTrialBalanceEntityPeriodFromData(): Promise<{
    filesProcessed: number;
    errors: string[];
}>;
//# sourceMappingURL=FISReportColumnSyncService.d.ts.map