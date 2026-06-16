/**
 * Phase 4: FIS run tracking, TB period coverage, entity-period locks.
 */
import { executeQuery } from '../config/database.js';
import { getLatestTrialBalanceUploads } from './FISTrialBalanceProcessService.js';
export function isFisPhase4Enabled() {
    return process.env.FIS_PHASE4_ENABLED === 'true' || process.env.FIS_PHASE4_ENABLED === '1';
}
export function normalizeTbFileStatus(raw) {
    if (!raw?.trim())
        return null;
    const upper = raw.trim().toLowerCase();
    if (upper === 'final')
        return 'Final';
    if (upper === 'preliminary' || upper === 'prelim')
        return 'Preliminary';
    return null;
}
export function assertHomogeneousTbStatus(records) {
    const statuses = new Set();
    for (const row of records) {
        const norm = normalizeTbFileStatus(row.status);
        if (!norm) {
            throw new Error(`Trial balance row has missing or invalid status "${row.status ?? ''}". ` +
                'All rows must be Preliminary or Final.');
        }
        statuses.add(norm);
    }
    if (statuses.size === 0) {
        throw new Error('Trial balance file has no rows with a valid status (Preliminary or Final).');
    }
    if (statuses.size > 1) {
        throw new Error('Trial balance file mixes Preliminary and Final status values. Use one status per file.');
    }
    return [...statuses][0];
}
export async function assertTbUploadAllowed(entityCode, period) {
    if (!isFisPhase4Enabled())
        return;
    const entity = entityCode.trim().toUpperCase();
    const periodNorm = period.trim();
    const result = await executeQuery(`SELECT entity_code FROM admin.fis_entity_period_lock
     WHERE entity_code = @entity AND period = @period`, { entity, period: periodNorm });
    if (result.error)
        throw new Error(result.error);
    if (result.data?.length) {
        throw new Error(`Trial balance for ${entity} period ${periodNorm} is locked (Final Actual + Final Budget). ` +
            'Further TB uploads are not allowed. FIS report regeneration is still permitted.');
    }
}
export async function upsertTbPeriodCoverage(params) {
    if (!isFisPhase4Enabled())
        return;
    const entity = params.entityCode.trim().toUpperCase();
    const period = params.period.trim();
    const isActual = params.tbType === 'ACTUAL';
    const sql = isActual
        ? `MERGE admin.fis_tb_period_coverage AS tgt
       USING (SELECT @entity AS entity_code, @period AS period) AS src
       ON tgt.entity_code = src.entity_code AND tgt.period = src.period
       WHEN MATCHED THEN UPDATE SET
         actual_upload_id = @uploadId,
         actual_file_name = @fileName,
         actual_file_status = @fileStatus,
         actual_row_count = @rowCount,
         actual_uploaded_at = SYSDATETIME(),
         updated_at = SYSDATETIME()
       WHEN NOT MATCHED THEN INSERT (
         entity_code, period,
         actual_upload_id, actual_file_name, actual_file_status, actual_row_count, actual_uploaded_at
       ) VALUES (
         @entity, @period,
         @uploadId, @fileName, @fileStatus, @rowCount, SYSDATETIME()
       );`
        : `MERGE admin.fis_tb_period_coverage AS tgt
       USING (SELECT @entity AS entity_code, @period AS period) AS src
       ON tgt.entity_code = src.entity_code AND tgt.period = src.period
       WHEN MATCHED THEN UPDATE SET
         budget_upload_id = @uploadId,
         budget_file_name = @fileName,
         budget_file_status = @fileStatus,
         budget_row_count = @rowCount,
         budget_uploaded_at = SYSDATETIME(),
         updated_at = SYSDATETIME()
       WHEN NOT MATCHED THEN INSERT (
         entity_code, period,
         budget_upload_id, budget_file_name, budget_file_status, budget_row_count, budget_uploaded_at
       ) VALUES (
         @entity, @period,
         @uploadId, @fileName, @fileStatus, @rowCount, SYSDATETIME()
       );`;
    const result = await executeQuery(sql, {
        entity,
        period,
        uploadId: params.uploadId,
        fileName: params.fileName,
        fileStatus: params.fileStatus,
        rowCount: params.rowCount,
    });
    if (result.error)
        throw new Error(result.error);
}
export async function maybeLockEntityPeriod(entityCode, period, lockedBy) {
    if (!isFisPhase4Enabled())
        return false;
    const entity = entityCode.trim().toUpperCase();
    const periodNorm = period.trim();
    const cov = await executeQuery(`SELECT actual_file_status, budget_file_status, actual_upload_id, budget_upload_id
     FROM admin.fis_tb_period_coverage
     WHERE entity_code = @entity AND period = @period`, { entity, period: periodNorm });
    if (cov.error)
        throw new Error(cov.error);
    const row = cov.data?.[0];
    if (!row)
        return false;
    if (row.actual_file_status !== 'Final' || row.budget_file_status !== 'Final') {
        return false;
    }
    const lock = await executeQuery(`IF NOT EXISTS (
       SELECT 1 FROM admin.fis_entity_period_lock WHERE entity_code = @entity AND period = @period
     )
     INSERT INTO admin.fis_entity_period_lock (
       entity_code, period, locked_by, actual_upload_id, budget_upload_id, notes
     ) VALUES (
       @entity, @period, @lockedBy, @actualUploadId, @budgetUploadId,
       'Both Final Actual and Final Budget present'
     )`, {
        entity,
        period: periodNorm,
        lockedBy,
        actualUploadId: row.actual_upload_id,
        budgetUploadId: row.budget_upload_id,
    });
    if (lock.error)
        throw new Error(lock.error);
    return true;
}
export async function resolveFileStatusForPeriod(entityCode, period) {
    const entity = entityCode.trim().toUpperCase();
    const periodNorm = period.trim();
    const uploads = await getLatestTrialBalanceUploads(entity, periodNorm);
    if (!uploads.actual) {
        throw new Error(`No Actual trial balance for ${entity} period ${periodNorm}`);
    }
    if (!uploads.budget) {
        throw new Error(`No Budget trial balance for ${entity} fiscal year ${periodNorm.slice(0, 4)}`);
    }
    const actualStatus = await queryDominantTbStatus(entity, periodNorm, 'ACTUAL');
    const budgetPeriod = uploads.budgetUsesFallback
        ? uploads.budgetSourcePeriod ?? periodNorm
        : periodNorm;
    const budgetStatus = await queryDominantTbStatus(entity, budgetPeriod, 'BUDGET');
    if (!actualStatus || !budgetStatus) {
        throw new Error(`Cannot resolve TB file status for ${entity} ${periodNorm}. ` +
            'Upload files with homogeneous Preliminary or Final status on every row.');
    }
    if (actualStatus !== budgetStatus) {
        throw new Error(`Actual TB status (${actualStatus}) does not match Budget TB status (${budgetStatus}) ` +
            `for ${entity} period ${periodNorm}. Upload matching status on both files before generating FIS reports.`);
    }
    const lockResult = await executeQuery(`SELECT entity_code FROM admin.fis_entity_period_lock
     WHERE entity_code = @entity AND period = @period`, { entity, period: periodNorm });
    if (lockResult.error)
        throw new Error(lockResult.error);
    return {
        fileStatus: actualStatus,
        actualUploadId: uploads.actual.uploadId,
        budgetUploadId: uploads.budget.uploadId,
        actualFileName: uploads.actual.fileName,
        budgetFileName: uploads.budget.fileName,
        actualTbStatus: actualStatus,
        budgetTbStatus: budgetStatus,
        isTbLocked: Boolean(lockResult.data?.length),
    };
}
async function queryDominantTbStatus(entity, period, tbType) {
    const result = await executeQuery(`SELECT TOP 1
       CASE
         WHEN UPPER(LTRIM(RTRIM(ISNULL(tb.status, '')))) IN ('FINAL') THEN 'Final'
         WHEN UPPER(LTRIM(RTRIM(ISNULL(tb.status, '')))) IN ('PRELIMINARY', 'PRELIM') THEN 'Preliminary'
         ELSE NULL
       END AS file_status
     FROM FIN.TrialBalance tb
     WHERE UPPER(LTRIM(RTRIM(tb.entity_code))) = @entity
       AND tb.period = @period
       AND UPPER(tb.tb_type) = @tbType
     GROUP BY
       CASE
         WHEN UPPER(LTRIM(RTRIM(ISNULL(tb.status, '')))) IN ('FINAL') THEN 'Final'
         WHEN UPPER(LTRIM(RTRIM(ISNULL(tb.status, '')))) IN ('PRELIMINARY', 'PRELIM') THEN 'Preliminary'
         ELSE NULL
       END
     ORDER BY COUNT(*) DESC`, { entity, period, tbType });
    if (result.error)
        throw new Error(result.error);
    const status = result.data?.[0]?.file_status;
    return status === 'Final' || status === 'Preliminary' ? status : null;
}
export async function startReportRun(params) {
    if (!isFisPhase4Enabled())
        return null;
    const result = await executeQuery(`INSERT INTO admin.fis_report_runs (
       report_type_code, entity_code, as_of_period, file_status, run_status, triggered_by,
       actual_upload_id, budget_upload_id, actual_file_name, budget_file_name,
       actual_tb_status, budget_tb_status
     )
     OUTPUT INSERTED.run_id
     VALUES (
       @reportTypeCode, @entityCode, @asOfPeriod, @fileStatus, 'RUNNING', @triggeredBy,
       @actualUploadId, @budgetUploadId, @actualFileName, @budgetFileName,
       @actualTbStatus, @budgetTbStatus
     )`, {
        reportTypeCode: params.reportTypeCode,
        entityCode: params.entityCode,
        asOfPeriod: params.asOfPeriod,
        fileStatus: params.fileStatus,
        triggeredBy: params.triggeredBy,
        actualUploadId: params.actualUploadId,
        budgetUploadId: params.budgetUploadId,
        actualFileName: params.actualFileName,
        budgetFileName: params.budgetFileName,
        actualTbStatus: params.actualTbStatus,
        budgetTbStatus: params.budgetTbStatus,
    });
    if (result.error)
        throw new Error(result.error);
    return result.data?.[0]?.run_id ?? null;
}
export async function completeReportRun(runId, success, outputRowCount, errorMessage) {
    if (!isFisPhase4Enabled() || runId == null)
        return;
    const result = await executeQuery(`UPDATE admin.fis_report_runs
     SET run_status = @runStatus,
         completed_at = SYSDATETIME(),
         duration_ms = DATEDIFF(MILLISECOND, started_at, SYSDATETIME()),
         output_row_count = @outputRowCount,
         error_message = @errorMessage
     WHERE run_id = @runId`, {
        runId,
        runStatus: success ? 'SUCCESS' : 'FAILED',
        outputRowCount,
        errorMessage: errorMessage ?? null,
    });
    if (result.error)
        throw new Error(result.error);
}
export async function getRunCalendar(entityCode, year) {
    let query = `SELECT
      entity_code, period, report_year, report_month,
      actual_upload_id, actual_file_name, actual_file_status,
      budget_upload_id, budget_file_name, budget_file_status,
      is_tb_locked, tb_locked_at,
      nf_last_run_at, nf_output_rows, nf_file_status,
      pl_last_run_at, pl_output_rows, pl_file_status,
      bs_last_run_at, bs_output_rows, bs_file_status,
      cf_last_run_at, cf_output_rows, cf_file_status
    FROM admin.vw_fis_report_run_calendar
    WHERE 1=1`;
    const params = {};
    if (entityCode?.trim()) {
        query += ` AND entity_code = @entity`;
        params.entity = entityCode.trim().toUpperCase();
    }
    if (year?.trim()) {
        query += ` AND LEFT(period, 4) = @year`;
        params.year = year.trim();
    }
    query += ` ORDER BY entity_code, period DESC`;
    const result = await executeQuery(query, params);
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map((r) => ({
        entityCode: r.entity_code,
        period: r.period,
        reportYear: r.report_year,
        reportMonth: r.report_month,
        actualUploadId: r.actual_upload_id,
        actualFileName: r.actual_file_name,
        actualFileStatus: r.actual_file_status,
        budgetUploadId: r.budget_upload_id,
        budgetFileName: r.budget_file_name,
        budgetFileStatus: r.budget_file_status,
        isTbLocked: r.is_tb_locked === 1,
        tbLockedAt: r.tb_locked_at ? r.tb_locked_at.toISOString() : null,
        nfLastRunAt: r.nf_last_run_at ? r.nf_last_run_at.toISOString() : null,
        nfOutputRows: r.nf_output_rows,
        nfFileStatus: r.nf_file_status,
        plLastRunAt: r.pl_last_run_at ? r.pl_last_run_at.toISOString() : null,
        plOutputRows: r.pl_output_rows,
        plFileStatus: r.pl_file_status,
        bsLastRunAt: r.bs_last_run_at ? r.bs_last_run_at.toISOString() : null,
        bsOutputRows: r.bs_output_rows,
        bsFileStatus: r.bs_file_status,
        cfLastRunAt: r.cf_last_run_at ? r.cf_last_run_at.toISOString() : null,
        cfOutputRows: r.cf_output_rows,
        cfFileStatus: r.cf_file_status,
    }));
}
export async function getPeriodCoverage(entityCode, period) {
    if (!isFisPhase4Enabled())
        return null;
    const entity = entityCode.trim().toUpperCase();
    const periodNorm = period.trim();
    const result = await executeQuery(`SELECT
       c.entity_code, c.period, c.actual_file_status, c.budget_file_status,
       CASE WHEN l.entity_code IS NOT NULL THEN 1 ELSE 0 END AS is_tb_locked
     FROM admin.fis_tb_period_coverage c
     LEFT JOIN admin.fis_entity_period_lock l
       ON l.entity_code = c.entity_code AND l.period = c.period
     WHERE c.entity_code = @entity AND c.period = @period`, { entity, period: periodNorm });
    if (result.error)
        throw new Error(result.error);
    if (!result.data?.[0])
        return null;
    const r = result.data[0];
    return {
        entityCode: r.entity_code,
        period: r.period,
        actualFileStatus: r.actual_file_status,
        budgetFileStatus: r.budget_file_status,
        isTbLocked: r.is_tb_locked === 1,
    };
}
//# sourceMappingURL=FISRunTrackingService.js.map