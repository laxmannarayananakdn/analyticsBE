/**
 * FIS V2 report generation — parallel NF/BS/PL, staging slot tables, publish to rp.fis_report_output_new.
 * Additive pipeline; does not modify V1 procedures or rp.fis_report_output.
 */
import { type FisFileStatus } from './FISRunTrackingService.js';
import type { FisGenerationJobProgress, FisV2GenerationJobProgress } from './FISReportGenerationJobService.js';
export declare function isFisPipelineV2Enabled(): boolean;
export declare class FISReportV2Service {
    private readonly fisService;
    private readonly semaphore;
    /** Normalize is log-heavy; default 1 avoids NF/PL starving when BS runs in parallel. */
    private readonly normalizeSemaphore;
    /** Serializes bulk index drop/recreate across overlapping batch jobs. */
    private readonly bulkPublishSemaphore;
    private bulkPublishRefCount;
    leaseStageSlot(runKey: string, leasedBy?: string | null): Promise<number>;
    generateReportsByRunKeyV2(reportTypeCodes: string[], entityCode: string, asOfPeriod: string, triggeredBy?: string | null, onProgress?: (progress: FisV2GenerationJobProgress) => void): Promise<{
        entityCode: string;
        asOfPeriod: string;
        reports: Array<{
            reportTypeCode: string;
            outputRowCount: number;
        }>;
        fileStatus?: FisFileStatus;
        isTbLocked?: boolean;
    }>;
    generateReportByRunKeyV2(reportTypeCode: string, entityCode: string, asOfPeriod: string, triggeredBy?: string | null, onProgress?: (progress: FisGenerationJobProgress) => void): Promise<{
        reportTypeCode: string;
        entityCode: string;
        asOfPeriod: string;
        outputRowCount: number;
        fileStatus?: FisFileStatus;
        isTbLocked?: boolean;
    }>;
    private publishReport;
    private updateLiveTableStats;
    private prepareBulkPublishIndexes;
    private finalizeBulkPublishIndexes;
    private buildCfCrossReportCache;
    private prepareContext;
    private executeGenerateMode;
    private runSumColumnChunks;
    private runFinalizeChunks;
    private countNewLiveOutput;
}
export declare const fisReportV2Service: FISReportV2Service;
//# sourceMappingURL=FISReportV2Service.d.ts.map