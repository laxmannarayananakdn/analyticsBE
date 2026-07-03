/**
 * FIS V2 report generation — parallel NF/BS/PL, staging slot tables, publish to rp.fis_report_output_new.
 * Additive pipeline; does not modify V1 procedures or rp.fis_report_output.
 */

import { randomUUID } from 'crypto';
import sql from 'mssql';
import { executeQuery, executeProcedure, getConnection } from '../config/database.js';
import {
  FISService,
  FISServiceError,
  sortReportTypesForGeneration,
} from './FISService.js';
import {
  completeReportRun,
  isFisPhase4Enabled,
  resolveFileStatusForPeriod,
  resolveRunLoggingContext,
  startReportRun,
  type FisFileStatus,
} from './FISRunTrackingService.js';
import type {
  FisGenerationJobProgress,
  FisV2GenerationJobProgress,
} from './FISReportGenerationJobService.js';

export function isFisPipelineV2Enabled(): boolean {
  return String(process.env.FIS_PIPELINE_V2 ?? '').toLowerCase() === 'true';
}

function v2MaxConcurrentReports(): number {
  const raw = parseInt(process.env.FIS_V2_MAX_CONCURRENT_REPORTS ?? '6', 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 6;
}

/**
 * Max reports allowed to run the (log-heavy) normalize phase at once.
 * Default 20 = effectively unlimited (each report has its own stage table, so there is
 * no table contention). Lower this only if the Azure SQL tier is being saturated.
 */
function v2MaxConcurrentNormalize(): number {
  const raw = parseInt(process.env.FIS_V2_MAX_CONCURRENT_NORMALIZE ?? '20', 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 20;
}

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

type RunKeyContext = {
  reportType: string;
  entity: string;
  period: string;
  procParams: Record<string, unknown>;
  phase4: boolean;
  fileStatus?: FisFileStatus;
  isTbLocked: boolean;
  runId: number | null;
  tbSumColumns: Array<{ columnKey: number; columnLabel: string }>;
  varianceColumns: Array<{ columnKey: number; columnLabel: string }>;
};

export class FISReportV2Service {
  private readonly fisService = new FISService();
  private readonly semaphore = new Semaphore(v2MaxConcurrentReports());
  /** Normalize is log-heavy; default 1 avoids NF/PL starving when BS runs in parallel. */
  private readonly normalizeSemaphore = new Semaphore(v2MaxConcurrentNormalize());

  async leaseStageSlot(runKey: string, leasedBy?: string | null): Promise<number> {
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

  async generateReportsByRunKeyV2(
    reportTypeCodes: string[],
    entityCode: string,
    asOfPeriod: string,
    triggeredBy?: string | null,
    onProgress?: (progress: FisV2GenerationJobProgress) => void
  ): Promise<{
    entityCode: string;
    asOfPeriod: string;
    reports: Array<{ reportTypeCode: string; outputRowCount: number }>;
    fileStatus?: FisFileStatus;
    isTbLocked?: boolean;
  }> {
    const ordered = sortReportTypesForGeneration(reportTypeCodes);
    if (!ordered.length) {
      throw new FISServiceError('Select at least one report type (NF, BS, PL, CF)', 400);
    }

    const phase1 = ordered.filter((c) => c !== 'CF');
    const phase2 = ordered.filter((c) => c === 'CF');
    const reportProgress: Record<string, FisGenerationJobProgress | null> = {};
    for (const code of ordered) reportProgress[code] = null;

    const emit = (reportTypeCode?: string, inner?: FisGenerationJobProgress, extra?: Partial<FisV2GenerationJobProgress>) => {
      if (reportTypeCode && inner) {
        reportProgress[reportTypeCode] = inner;
      }
      onProgress?.({
        reports: { ...reportProgress },
        activeReportTypeCode: reportTypeCode,
        ...extra,
      });
    };

    const reports: Array<{ reportTypeCode: string; outputRowCount: number }> = [];
    let fileStatus: FisFileStatus | undefined;
    let isTbLocked = false;

    const runOne = async (reportType: string) => {
      await this.semaphore.acquire();
      try {
        const result = await this.generateReportByRunKeyV2(
          reportType,
          entityCode,
          asOfPeriod,
          triggeredBy,
          (inner) => emit(reportType, inner)
        );
        if (result.fileStatus) fileStatus = result.fileStatus;
        if (result.isTbLocked != null) isTbLocked = result.isTbLocked;
        return result;
      } finally {
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

    emit(undefined, undefined, { publishPhase: 'complete' });

    return {
      entityCode: entityCode.trim().toUpperCase(),
      asOfPeriod: asOfPeriod.trim(),
      reports,
      ...(fileStatus ? { fileStatus, isTbLocked } : {}),
    };
  }

  async generateReportByRunKeyV2(
    reportTypeCode: string,
    entityCode: string,
    asOfPeriod: string,
    triggeredBy?: string | null,
    onProgress?: (progress: FisGenerationJobProgress) => void
  ): Promise<{
    reportTypeCode: string;
    entityCode: string;
    asOfPeriod: string;
    outputRowCount: number;
    fileStatus?: FisFileStatus;
    isTbLocked?: boolean;
  }> {
    const runKey = randomUUID();
    const ctx = await this.prepareContext(reportTypeCode, entityCode, asOfPeriod, triggeredBy, true);
    let stageSlotId: number | null = null;

    try {
      onProgress?.({ phase: 'init', current: 0, total: 1, label: 'Leasing stage slot' });
      stageSlotId = await this.leaseStageSlot(runKey, triggeredBy);
      ctx.procParams.run_key = runKey;
      ctx.procParams.stage_slot_id = stageSlotId;

      onProgress?.({ phase: 'init', current: 1, total: 1, label: 'Clearing stage' });
      await this.executeGenerateMode(ctx.procParams, 'INIT');

      await this.runSumColumnChunks(ctx, onProgress);
      await this.runFinalizeChunks(ctx, onProgress);

      onProgress?.({ phase: 'finalize', finalizeStep: 'publish', current: 1, total: 1, label: 'Publishing to live table' });
      const publishStartedAt = Date.now();
      await this.publishReport(runKey, stageSlotId, ctx);
      console.log(
        `[FIS V2 timing] ${ctx.reportType} PUBLISH took ${((Date.now() - publishStartedAt) / 1000).toFixed(1)}s`
      );

      const outputRowCount = await this.countNewLiveOutput(ctx);
      await completeReportRun(ctx.runId, true, outputRowCount);
      stageSlotId = null;

      return {
        reportTypeCode: ctx.reportType,
        entityCode: ctx.entity,
        asOfPeriod: ctx.period,
        outputRowCount,
        ...(ctx.phase4 ? { fileStatus: ctx.fileStatus, isTbLocked: ctx.isTbLocked } : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await completeReportRun(ctx.runId, false, 0, message);
      if (stageSlotId != null) {
        await executeProcedure('rp.usp_ReleaseFISReportOutputStageSlot_new', {
          run_key: runKey,
          stage_slot_id: stageSlotId,
        });
      }
      if (err instanceof FISServiceError) throw err;
      throw new FISServiceError(message);
    }
  }

  private async publishReport(runKey: string, stageSlotId: number, ctx: RunKeyContext): Promise<void> {
    const result = await executeProcedure('rp.usp_PublishFISReportOutput_new', {
      run_key: runKey,
      stage_slot_id: stageSlotId,
      report_type_code: ctx.reportType,
      entity_code: ctx.entity,
      as_of_period: ctx.period,
      ...(ctx.fileStatus ? { file_status: ctx.fileStatus } : {}),
    });
    if (result.error) throw new FISServiceError(result.error);
  }

  private async prepareContext(
    reportTypeCode: string,
    entityCode: string,
    asOfPeriod: string,
    triggeredBy?: string | null,
    startRun = false
  ): Promise<RunKeyContext> {
    const reportType = reportTypeCode.trim().toUpperCase();
    const entity = entityCode.trim().toUpperCase();
    const period = asOfPeriod.trim();

    if (!reportType) throw new FISServiceError('reportTypeCode is required', 400);
    if (!entity) throw new FISServiceError('entityCode is required', 400);
    if (!/^\d{6}$/.test(period)) throw new FISServiceError('asOfPeriod must be YYYYMM', 400);
    if (reportType === 'MPR') throw new FISServiceError('MPR reports use instance-based generation', 400);

    const allowed = new Set(['NF', 'PL', 'BS', 'CF']);
    if (!allowed.has(reportType)) {
      throw new FISServiceError(`Unsupported report type: ${reportType}`, 400);
    }

    const phase4 = isFisPhase4Enabled();
    let fileStatus: FisFileStatus | undefined;
    let isTbLocked = false;
    let runId: number | null = null;

    let runLoggingContext: {
      fileStatus: FisFileStatus;
      actualUploadId: number | null;
      budgetUploadId: number | null;
      actualFileName: string | null;
      budgetFileName: string | null;
      actualTbStatus: FisFileStatus;
      budgetTbStatus: FisFileStatus | null;
    } | null = null;

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
    } else if (startRun) {
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

    const procParams: Record<string, unknown> = {
      report_type_code: reportType,
      entity_code: entity,
      as_of_period: period,
    };

    if (!fileStatus) {
      const resolved = await resolveRunLoggingContext(entity, period);
      fileStatus = resolved.fileStatus;
    }
    if (fileStatus) procParams.file_status = fileStatus;

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

  private async executeGenerateMode(
    procParams: Record<string, unknown>,
    generationMode: string,
    targets?: { targetRowId?: number; targetColumnKey?: number }
  ): Promise<void> {
    const params = {
      ...procParams,
      generation_mode: generationMode,
      ...(targets?.targetRowId != null ? { target_row_id: targets.targetRowId } : {}),
      ...(targets?.targetColumnKey != null ? { target_column_key: targets.targetColumnKey } : {}),
    };
    const label = `${procParams.report_type_code ?? '?'} ${generationMode}${
      targets?.targetColumnKey != null ? ` col=${targets.targetColumnKey}` : ''
    }`;
    const startedAt = Date.now();
    const result = await executeProcedure('rp.usp_GenerateFISReport_new', params);
    const elapsedMs = Date.now() - startedAt;
    console.log(`[FIS V2 timing] ${label} took ${(elapsedMs / 1000).toFixed(1)}s`);
    if (result.error) throw new FISServiceError(result.error);
  }

  private async runSumColumnChunks(
    ctx: RunKeyContext,
    onProgress?: (progress: FisGenerationJobProgress) => void
  ): Promise<void> {
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

  private async runFinalizeChunks(
    ctx: RunKeyContext,
    onProgress?: (progress: FisGenerationJobProgress) => void
  ): Promise<void> {
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
    } finally {
      this.normalizeSemaphore.release();
    }
  }

  private async countNewLiveOutput(ctx: RunKeyContext): Promise<number> {
    const countSql =
      ctx.phase4 && ctx.fileStatus
        ? `SELECT COUNT(*) AS total FROM rp.fis_report_output_new
           WHERE report_type_code = @reportType
             AND entity_code = @entity
             AND as_of_period = @period
             AND file_status = @fileStatus`
        : `SELECT COUNT(*) AS total FROM rp.fis_report_output_new
           WHERE report_type_code = @reportType
             AND entity_code = @entity
             AND as_of_period = @period`;

    const countParams: Record<string, unknown> = {
      reportType: ctx.reportType,
      entity: ctx.entity,
      period: ctx.period,
    };
    if (ctx.phase4 && ctx.fileStatus) countParams.fileStatus = ctx.fileStatus;

    const countResult = await executeQuery<{ total: number }>(countSql, countParams);
    if (countResult.error) throw new FISServiceError(countResult.error);
    return Number(countResult.data?.[0]?.total) || 0;
  }
}

export const fisReportV2Service = new FISReportV2Service();
