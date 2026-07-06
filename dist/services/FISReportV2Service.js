/**
 * FIS V2 report generation — parallel NF/BS/PL, staging slot tables, publish to rp.fis_report_output_new.
 * Additive pipeline; does not modify V1 procedures or rp.fis_report_output.
 */
import { randomUUID } from 'crypto';
import sql from 'mssql';
import { executeQuery, executeProcedure, getConnection } from '../config/database.js';
import { FISService, FISServiceError, sortReportTypesForGeneration, } from './FISService.js';
import { completeReportRun, isFisPhase4Enabled, resolveFileStatusForPeriod, resolveRunLoggingContext, startReportRun, } from './FISRunTrackingService.js';
export function isFisPipelineV2Enabled() {
    return String(process.env.FIS_PIPELINE_V2 ?? '').toLowerCase() === 'true';
}
function v2MaxConcurrentReports() {
    const raw = parseInt(process.env.FIS_V2_MAX_CONCURRENT_REPORTS ?? '6', 10);
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 6;
}
/**
 * Max reports allowed to run the (log-heavy) normalize phase at once.
 * Default 20 = effectively unlimited (each report has its own stage table, so there is
 * no table contention). Lower this only if the Azure SQL tier is being saturated.
 */
function v2MaxConcurrentNormalize() {
    const raw = parseInt(process.env.FIS_V2_MAX_CONCURRENT_NORMALIZE ?? '20', 10);
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 20;
}
function v2UpdateStatsEnabled() {
    const raw = String(process.env.FIS_V2_UPDATE_STATS ?? 'false').toLowerCase();
    return raw === 'true' || raw === '1';
}
function v2BulkPublishEnabled() {
    const raw = String(process.env.FIS_V2_BULK_PUBLISH ?? 'true').toLowerCase();
    return raw !== 'false' && raw !== '0';
}
class Semaphore {
    max;
    active = 0;
    queue = [];
    constructor(max) {
        this.max = max;
    }
    async acquire() {
        if (this.active < this.max) {
            this.active += 1;
            return;
        }
        await new Promise((resolve) => this.queue.push(resolve));
        this.active += 1;
    }
    release() {
        this.active = Math.max(0, this.active - 1);
        const next = this.queue.shift();
        if (next)
            next();
    }
}
export class FISReportV2Service {
    fisService = new FISService();
    semaphore = new Semaphore(v2MaxConcurrentReports());
    /** Normalize is log-heavy; default 1 avoids NF/PL starving when BS runs in parallel. */
    normalizeSemaphore = new Semaphore(v2MaxConcurrentNormalize());
    /** Serializes bulk index drop/recreate across overlapping batch jobs. */
    bulkPublishSemaphore = new Semaphore(1);
    bulkPublishRefCount = 0;
    async leaseStageSlot(runKey, leasedBy) {
        const connection = await getConnection();
        const request = connection.request();
        request.input('run_key', sql.UniqueIdentifier, runKey);
        request.input('leased_by', sql.NVarChar, leasedBy ?? null);
        request.output('stage_slot_id', sql.TinyInt);
        const result = await request.execute('rp.usp_LeaseFISReportOutputStageSlot_new');
        const slot = result.output?.stage_slot_id;
        if (slot == null || slot === undefined) {
            throw new FISServiceError('No free FIS V2 stage slot available', 503);
        }
        return Number(slot);
    }
    async generateReportsByRunKeyV2(reportTypeCodes, entityCode, asOfPeriod, triggeredBy, onProgress) {
        const ordered = sortReportTypesForGeneration(reportTypeCodes);
        if (!ordered.length) {
            throw new FISServiceError('Select at least one report type (NF, BS, PL, CF)', 400);
        }
        const phase1 = ordered.filter((c) => c !== 'CF');
        const phase2 = ordered.filter((c) => c === 'CF');
        const reportProgress = {};
        for (const code of ordered)
            reportProgress[code] = null;
        const emit = (reportTypeCode, inner, extra) => {
            if (reportTypeCode && inner) {
                reportProgress[reportTypeCode] = inner;
            }
            onProgress?.({
                reports: { ...reportProgress },
                activeReportTypeCode: reportTypeCode,
                ...extra,
            });
        };
        if (v2UpdateStatsEnabled()) {
            emit(undefined, undefined, { publishPhase: 'stats' });
            console.log('[FIS V2] Updating live table statistics (sampled, not fullscan)...');
            await this.updateLiveTableStats();
        }
        if (v2BulkPublishEnabled()) {
            emit(undefined, undefined, { publishPhase: 'bulk_prep' });
            console.log('[FIS V2] Dropping secondary indexes for bulk publish...');
            await this.prepareBulkPublishIndexes();
        }
        const reports = [];
        let fileStatus;
        let isTbLocked = false;
        const runOne = async (reportType) => {
            await this.semaphore.acquire();
            try {
                const result = await this.generateReportByRunKeyV2(reportType, entityCode, asOfPeriod, triggeredBy, (inner) => emit(reportType, inner));
                if (result.fileStatus)
                    fileStatus = result.fileStatus;
                if (result.isTbLocked != null)
                    isTbLocked = result.isTbLocked;
                return result;
            }
            finally {
                this.semaphore.release();
            }
        };
        if (phase1.length) {
            const phase1Results = await Promise.all(phase1.map((reportType) => runOne(reportType)));
            for (const result of phase1Results) {
                reports.push({
                    reportTypeCode: result.reportTypeCode,
                    outputRowCount: result.outputRowCount,
                });
            }
        }
        for (const reportType of phase2) {
            emit(reportType, { phase: 'init', current: 0, total: 1, label: 'Waiting for NF/BS/PL publish' });
            const result = await runOne(reportType);
            reports.push({
                reportTypeCode: result.reportTypeCode,
                outputRowCount: result.outputRowCount,
            });
        }
        // All reports (including CF) are published — enrich descriptions once for the
        // whole entity-period so the dimension descriptions are populated in one pass.
        emit(undefined, undefined, { publishPhase: 'enrich' });
        await this.enrichDescriptionsForBatch(reports.map((r) => r.reportTypeCode), entityCode, asOfPeriod, fileStatus);
        emit(undefined, undefined, { publishPhase: 'complete' });
        if (v2BulkPublishEnabled()) {
            emit(undefined, undefined, { publishPhase: 'bulk_finalize' });
            await this.finalizeBulkPublishIndexes();
        }
        return {
            entityCode: entityCode.trim().toUpperCase(),
            asOfPeriod: asOfPeriod.trim(),
            reports,
            ...(fileStatus ? { fileStatus, isTbLocked } : {}),
        };
    }
    async generateReportByRunKeyV2(reportTypeCode, entityCode, asOfPeriod, triggeredBy, onProgress) {
        const runKey = randomUUID();
        const ctx = await this.prepareContext(reportTypeCode, entityCode, asOfPeriod, triggeredBy, true);
        let stageSlotId = null;
        try {
            onProgress?.({ phase: 'init', current: 0, total: 1, label: 'Leasing stage slot' });
            stageSlotId = await this.leaseStageSlot(runKey, triggeredBy);
            ctx.procParams.run_key = runKey;
            ctx.procParams.stage_slot_id = stageSlotId;
            if (ctx.reportType === 'CF') {
                onProgress?.({ phase: 'init', current: 0, total: 1, label: 'Building CF cross-report cache' });
                const cacheStartedAt = Date.now();
                await this.buildCfCrossReportCache(runKey, ctx);
                console.log(`[FIS V2 timing] CF BUILD_CACHE took ${((Date.now() - cacheStartedAt) / 1000).toFixed(1)}s`);
            }
            onProgress?.({ phase: 'init', current: 1, total: 1, label: 'Clearing stage' });
            await this.executeGenerateMode(ctx.procParams, 'INIT');
            await this.runSumColumnChunks(ctx, onProgress);
            await this.runFinalizeChunks(ctx, onProgress);
            onProgress?.({ phase: 'finalize', finalizeStep: 'publish', current: 1, total: 1, label: 'Publishing to live table' });
            const publishStartedAt = Date.now();
            await this.publishReport(runKey, stageSlotId, ctx);
            console.log(`[FIS V2 timing] ${ctx.reportType} PUBLISH took ${((Date.now() - publishStartedAt) / 1000).toFixed(1)}s`);
            const outputRowCount = await this.countNewLiveOutput(ctx);
            await completeReportRun(ctx.runId, true, outputRowCount);
            if (ctx.reportType === 'CF') {
                await executeProcedure('rp.usp_DropFISCFReportCache_new', { run_key: runKey });
            }
            stageSlotId = null;
            return {
                reportTypeCode: ctx.reportType,
                entityCode: ctx.entity,
                asOfPeriod: ctx.period,
                outputRowCount,
                ...(ctx.phase4 ? { fileStatus: ctx.fileStatus, isTbLocked: ctx.isTbLocked } : {}),
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await completeReportRun(ctx.runId, false, 0, message);
            if (stageSlotId != null) {
                await executeProcedure('rp.usp_ReleaseFISReportOutputStageSlot_new', {
                    run_key: runKey,
                    stage_slot_id: stageSlotId,
                });
            }
            if (ctx.reportType === 'CF') {
                await executeProcedure('rp.usp_DropFISCFReportCache_new', { run_key: runKey });
            }
            if (err instanceof FISServiceError)
                throw err;
            throw new FISServiceError(message);
        }
    }
    /**
     * Enrich dimension descriptions (region/funding source/operating unit/department/project)
     * and coalesce NULL data-row amounts to 0 on the V2 live table for the whole entity-period.
     * Runs after all reports (including CF) are published. Failures here are logged but do not
     * fail the batch, since the report data itself is already committed.
     */
    async enrichDescriptionsForBatch(reportTypeCodes, entityCode, asOfPeriod, fileStatus) {
        const entity = entityCode.trim().toUpperCase();
        const period = asOfPeriod.trim();
        for (const reportTypeCode of reportTypeCodes) {
            const startedAt = Date.now();
            try {
                const result = await executeProcedure('rp.usp_EnrichFISReportOutputDescriptions', {
                    report_type_code: reportTypeCode,
                    entity_code: entity,
                    as_of_period: period,
                    target: 'V2',
                    ...(fileStatus ? { file_status: fileStatus } : {}),
                });
                if (result.error) {
                    console.warn(`[FIS V2] Description enrichment failed for ${reportTypeCode} ${entity} ${period}: ${result.error}`);
                }
                else {
                    console.log(`[FIS V2 timing] ${reportTypeCode} ENRICH took ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`[FIS V2] Description enrichment error for ${reportTypeCode} ${entity} ${period}: ${message}`);
            }
        }
    }
    async publishReport(runKey, stageSlotId, ctx) {
        const result = await executeProcedure('rp.usp_PublishFISReportOutput_new', {
            run_key: runKey,
            stage_slot_id: stageSlotId,
            report_type_code: ctx.reportType,
            entity_code: ctx.entity,
            as_of_period: ctx.period,
            use_bulk_insert: v2BulkPublishEnabled() ? 1 : 0,
            ...(ctx.fileStatus ? { file_status: ctx.fileStatus } : {}),
        });
        if (result.error)
            throw new FISServiceError(result.error);
    }
    async updateLiveTableStats() {
        const startedAt = Date.now();
        const result = await executeProcedure('rp.usp_UpdateFISReportOutputNewStats_new', {});
        if (result.error) {
            console.warn(`[FIS V2] UPDATE STATS failed (non-fatal): ${result.error}`);
            return;
        }
        console.log(`[FIS V2 timing] UPDATE_STATS took ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    }
    async prepareBulkPublishIndexes() {
        await this.bulkPublishSemaphore.acquire();
        try {
            if (this.bulkPublishRefCount > 0) {
                this.bulkPublishRefCount += 1;
                return;
            }
            const startedAt = Date.now();
            const result = await executeProcedure('rp.usp_PrepareFISReportOutputNewBulkPublish_new', {});
            if (result.error)
                throw new FISServiceError(result.error);
            this.bulkPublishRefCount = 1;
            console.log(`[FIS V2 timing] BULK_PUBLISH_PREP took ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        }
        finally {
            this.bulkPublishSemaphore.release();
        }
    }
    async finalizeBulkPublishIndexes() {
        await this.bulkPublishSemaphore.acquire();
        try {
            if (this.bulkPublishRefCount <= 0)
                return;
            this.bulkPublishRefCount -= 1;
            if (this.bulkPublishRefCount > 0)
                return;
            const startedAt = Date.now();
            const result = await executeProcedure('rp.usp_FinalizeFISReportOutputNewBulkPublish_new', {});
            if (result.error)
                throw new FISServiceError(result.error);
            console.log(`[FIS V2 timing] BULK_PUBLISH_FINALIZE took ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        }
        finally {
            this.bulkPublishSemaphore.release();
        }
    }
    async buildCfCrossReportCache(runKey, ctx) {
        const result = await executeProcedure('rp.usp_BuildFISCFReportCache_new', {
            run_key: runKey,
            entity_code: ctx.entity,
            as_of_period: ctx.period,
            ...(ctx.fileStatus ? { file_status: ctx.fileStatus } : {}),
        });
        if (result.error)
            throw new FISServiceError(result.error);
    }
    async prepareContext(reportTypeCode, entityCode, asOfPeriod, triggeredBy, startRun = false) {
        const reportType = reportTypeCode.trim().toUpperCase();
        const entity = entityCode.trim().toUpperCase();
        const period = asOfPeriod.trim();
        if (!reportType)
            throw new FISServiceError('reportTypeCode is required', 400);
        if (!entity)
            throw new FISServiceError('entityCode is required', 400);
        if (!/^\d{6}$/.test(period))
            throw new FISServiceError('asOfPeriod must be YYYYMM', 400);
        if (reportType === 'MPR')
            throw new FISServiceError('MPR reports use instance-based generation', 400);
        const allowed = new Set(['NF', 'PL', 'BS', 'CF']);
        if (!allowed.has(reportType)) {
            throw new FISServiceError(`Unsupported report type: ${reportType}`, 400);
        }
        const phase4 = isFisPhase4Enabled();
        let fileStatus;
        let isTbLocked = false;
        let runId = null;
        let runLoggingContext = null;
        if (phase4) {
            const resolved = await resolveFileStatusForPeriod(entity, period);
            fileStatus = resolved.fileStatus;
            isTbLocked = resolved.isTbLocked;
            runLoggingContext = {
                fileStatus: resolved.fileStatus,
                actualUploadId: resolved.actualUploadId,
                budgetUploadId: resolved.budgetUploadId,
                actualFileName: resolved.actualFileName,
                budgetFileName: resolved.budgetFileName,
                actualTbStatus: resolved.actualTbStatus,
                budgetTbStatus: resolved.budgetTbStatus,
            };
        }
        else if (startRun) {
            runLoggingContext = await resolveRunLoggingContext(entity, period);
            fileStatus = runLoggingContext.fileStatus;
        }
        if (startRun && runLoggingContext) {
            runId = await startReportRun({
                reportTypeCode: reportType,
                entityCode: entity,
                asOfPeriod: period,
                fileStatus: runLoggingContext.fileStatus,
                triggeredBy: triggeredBy ?? null,
                actualUploadId: runLoggingContext.actualUploadId,
                budgetUploadId: runLoggingContext.budgetUploadId,
                actualFileName: runLoggingContext.actualFileName,
                budgetFileName: runLoggingContext.budgetFileName,
                actualTbStatus: runLoggingContext.actualTbStatus,
                budgetTbStatus: runLoggingContext.budgetTbStatus,
            });
        }
        const procParams = {
            report_type_code: reportType,
            entity_code: entity,
            as_of_period: period,
        };
        if (!fileStatus) {
            const resolved = await resolveRunLoggingContext(entity, period);
            fileStatus = resolved.fileStatus;
        }
        if (fileStatus)
            procParams.file_status = fileStatus;
        const tbSumColumns = await this.fisService.getTbSumColumnsForRunKey(reportType, period);
        const varianceColumns = await this.fisService.getVarianceColumnsForRunKey(reportType);
        return {
            reportType,
            entity,
            period,
            procParams,
            phase4,
            fileStatus,
            isTbLocked,
            runId,
            tbSumColumns,
            varianceColumns,
        };
    }
    async executeGenerateMode(procParams, generationMode, targets) {
        const params = {
            ...procParams,
            generation_mode: generationMode,
            ...(targets?.targetRowId != null ? { target_row_id: targets.targetRowId } : {}),
            ...(targets?.targetColumnKey != null ? { target_column_key: targets.targetColumnKey } : {}),
        };
        const label = `${procParams.report_type_code ?? '?'} ${generationMode}${targets?.targetColumnKey != null ? ` col=${targets.targetColumnKey}` : ''}`;
        const startedAt = Date.now();
        const result = await executeProcedure('rp.usp_GenerateFISReport_new', params);
        const elapsedMs = Date.now() - startedAt;
        console.log(`[FIS V2 timing] ${label} took ${(elapsedMs / 1000).toFixed(1)}s`);
        if (result.error)
            throw new FISServiceError(result.error);
    }
    async runSumColumnChunks(ctx, onProgress) {
        const total = ctx.tbSumColumns.length;
        if (total === 0) {
            onProgress?.({ phase: 'sum', current: 0, total: 1, label: 'Aggregating trial balance' });
            await this.executeGenerateMode(ctx.procParams, 'SUM_ALL');
            return;
        }
        for (let i = 0; i < ctx.tbSumColumns.length; i++) {
            const column = ctx.tbSumColumns[i];
            onProgress?.({
                phase: 'sum',
                sumStep: 'column',
                current: i + 1,
                total,
                label: column.columnLabel,
            });
            await this.executeGenerateMode(ctx.procParams, 'SUM_COLUMN', {
                targetColumnKey: column.columnKey,
            });
        }
    }
    async runFinalizeChunks(ctx, onProgress) {
        const total = 1 + ctx.varianceColumns.length + 2;
        let current = 0;
        onProgress?.({
            phase: 'finalize',
            finalizeStep: 'pit',
            current: ++current,
            total,
            label: 'Point-in-time columns',
        });
        await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_PIT');
        for (const column of ctx.varianceColumns) {
            onProgress?.({
                phase: 'finalize',
                finalizeStep: 'variance',
                current: ++current,
                total,
                label: column.columnLabel,
            });
            await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_VARIANCE', {
                targetColumnKey: column.columnKey,
            });
        }
        onProgress?.({
            phase: 'finalize',
            finalizeStep: 'expression',
            current: ++current,
            total,
            label: 'Expression rows',
        });
        await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_EXPRESSION');
        onProgress?.({
            phase: 'finalize',
            finalizeStep: 'normalize',
            current: total,
            total,
            label: 'Normalizing output',
        });
        // Each report normalizes into its OWN stage slot table, so they run in parallel.
        // The semaphore is a safety valve for DB-tier saturation; default is unlimited.
        await this.normalizeSemaphore.acquire();
        try {
            await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_NORMALIZE');
        }
        finally {
            this.normalizeSemaphore.release();
        }
    }
    async countNewLiveOutput(ctx) {
        const countSql = ctx.phase4 && ctx.fileStatus
            ? `SELECT COUNT(*) AS total FROM rp.fis_report_output_new
           WHERE report_type_code = @reportType
             AND entity_code = @entity
             AND as_of_period = @period
             AND file_status = @fileStatus`
            : `SELECT COUNT(*) AS total FROM rp.fis_report_output_new
           WHERE report_type_code = @reportType
             AND entity_code = @entity
             AND as_of_period = @period`;
        const countParams = {
            reportType: ctx.reportType,
            entity: ctx.entity,
            period: ctx.period,
        };
        if (ctx.phase4 && ctx.fileStatus)
            countParams.fileStatus = ctx.fileStatus;
        const countResult = await executeQuery(countSql, countParams);
        if (countResult.error)
            throw new FISServiceError(countResult.error);
        return Number(countResult.data?.[0]?.total) || 0;
    }
}
export const fisReportV2Service = new FISReportV2Service();
//# sourceMappingURL=FISReportV2Service.js.map