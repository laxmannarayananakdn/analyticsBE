/**
 * Sync admin.fis_report_columns from trial balance upload file names.
 * Pattern: TB_YYYYMM_ENTY_Actual.xlsx | TB_YYYYMM_ENTY_Budget.xlsx
 * One column per YYYYMM per entity instance (Actual and Budget share the same column).
 */
import { type ParsedTrialBalanceFileName } from '../utils/financeFileNameResolver.js';
/** Set entity_code / period on all rows for this upload file. */
export declare function backfillTrialBalanceEntityPeriod(parsed: ParsedTrialBalanceFileName): Promise<number>;
export interface SyncFisReportColumnsResult {
    synced: boolean;
    instanceId?: number;
    columnAction?: 'inserted' | 'updated';
    message?: string;
}
/**
 * After a TB file is loaded, ensure a report instance and column exist for that entity/period.
 */
export declare function syncFisReportColumnsFromTrialBalanceFile(fileName: string, uploadedBy: string): Promise<SyncFisReportColumnsResult>;
/**
 * Repair TB rows and FIS columns from completed EF uploads (e.g. after a deploy gap).
 */
export declare function repairFisFromCompletedTbUploads(): Promise<{
    uploadsProcessed: number;
    columnsSynced: number;
    errors: string[];
}>;
//# sourceMappingURL=FISReportColumnSyncService.d.ts.map