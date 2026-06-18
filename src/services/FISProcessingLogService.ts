/**
 * FIS processing logs: SFTP pulls (EF uploads) and report generation run history.
 */

import { executeQuery } from '../config/database.js';
import { getFisSftpUploadedBy } from '../config/fisSftp.js';
import { parseTrialBalanceFileName } from '../utils/financeFileNameResolver.js';

export interface FisSftpPullLogRow {
  uploadId: number;
  fileName: string;
  fileTypeCode: string;
  category: 'TB' | 'DIC' | 'OTHER';
  entityCode: string | null;
  period: string | null;
  tbKind: 'ACTUAL' | 'BUDGET' | null;
  pullStatus: string;
  rowCount: number | null;
  uploadedBy: string;
  uploadedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
}

/** One row per report generation attempt (admin.fis_report_runs). */
export interface FisReportProcessingAttemptRow {
  runId: number;
  reportTypeCode: string;
  entityCode: string;
  period: string;
  outputFileStatus: string;
  runStatus: string;
  triggeredBy: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  outputRowCount: number | null;
  errorMessage: string | null;
  actualFileStatus: string | null;
  budgetFileStatus: string | null;
  actualFileName: string | null;
  budgetFileName: string | null;
}

function mapUploadStatus(status: string): string {
  switch (status?.toUpperCase()) {
    case 'COMPLETED':
      return 'Success';
    case 'FAILED':
      return 'Failed';
    case 'PROCESSING':
      return 'In progress';
    case 'PENDING':
      return 'Pending';
    default:
      return status || 'Unknown';
  }
}

function mapRunStatus(status: string | null): string {
  if (!status) return 'Unknown';
  switch (status.toUpperCase()) {
    case 'SUCCESS':
      return 'Success';
    case 'RUNNING':
      return 'In progress';
    case 'FAILED':
      return 'Failed';
    case 'SKIPPED':
      return 'Skipped';
    case 'BLOCKED':
      return 'Blocked';
    default:
      return status;
  }
}

export async function listSftpPullLog(params: {
  limit?: number;
  entityCode?: string;
  period?: string;
}): Promise<FisSftpPullLogRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);
  const sftpUser = getFisSftpUploadedBy();

  let query = `
    SELECT
      u.id,
      u.file_name,
      u.status,
      u.row_count,
      u.uploaded_by,
      u.uploaded_at,
      u.processed_at,
      u.error_message,
      ft.type_code AS file_type_code
    FROM EF.Uploads u
    INNER JOIN EF.FileTypes ft ON u.file_type_id = ft.id
    WHERE ft.type_code LIKE 'FIN[_]%'
      AND (
        u.uploaded_by = @sftpUser
        OR u.uploaded_by LIKE '%sftp%'
      )
  `;
  const sqlParams: Record<string, unknown> = { limit, sftpUser };

  query += ` ORDER BY u.uploaded_at DESC OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`;

  const result = await executeQuery<{
    id: number;
    file_name: string;
    status: string;
    row_count: number | null;
    uploaded_by: string;
    uploaded_at: Date;
    processed_at: Date | null;
    error_message: string | null;
    file_type_code: string;
  }>(query, sqlParams);

  if (result.error) throw new Error(result.error);

  const entityFilter = params.entityCode?.trim().toUpperCase();
  const periodFilter = params.period?.trim();

  return (result.data || [])
    .map((row) => {
      const parsed = parseTrialBalanceFileName(row.file_name);
      const isDic = row.file_type_code.startsWith('FIN_DIC_');
      const isTb =
        row.file_type_code === 'FIN_TB_ACTUAL' || row.file_type_code === 'FIN_TB_BUDGET';

      return {
        uploadId: row.id,
        fileName: row.file_name,
        fileTypeCode: row.file_type_code,
        category: isTb ? 'TB' as const : isDic ? 'DIC' as const : 'OTHER' as const,
        entityCode: parsed?.entityCode ?? null,
        period: parsed?.periodYyyymm ?? null,
        tbKind: parsed?.tbKind ?? (row.file_type_code === 'FIN_TB_BUDGET' ? 'BUDGET' : row.file_type_code === 'FIN_TB_ACTUAL' ? 'ACTUAL' : null),
        pullStatus: mapUploadStatus(row.status),
        rowCount: row.row_count,
        uploadedBy: row.uploaded_by,
        uploadedAt: row.uploaded_at.toISOString(),
        processedAt: row.processed_at ? row.processed_at.toISOString() : null,
        errorMessage: row.error_message,
      };
    })
    .filter((row) => {
      if (entityFilter && row.entityCode !== entityFilter) return false;
      if (periodFilter && row.period !== periodFilter) return false;
      return true;
    });
}

export async function listReportProcessingAttempts(params: {
  limit?: number;
  entityCode?: string;
  period?: string;
}): Promise<FisReportProcessingAttemptRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);
  const entityFilter = params.entityCode?.trim().toUpperCase();
  const periodFilter = params.period?.trim();

  let query = `
    SELECT
      r.run_id,
      r.report_type_code,
      r.entity_code,
      r.as_of_period,
      r.file_status,
      r.run_status,
      r.triggered_by,
      r.started_at,
      r.completed_at,
      r.duration_ms,
      r.output_row_count,
      r.error_message,
      r.actual_tb_status,
      r.budget_tb_status,
      r.actual_file_name,
      r.budget_file_name
    FROM admin.fis_report_runs r
    WHERE 1 = 1
  `;
  const sqlParams: Record<string, unknown> = { limit };

  if (entityFilter) {
    query += ` AND r.entity_code = @entity`;
    sqlParams.entity = entityFilter;
  }
  if (periodFilter) {
    query += ` AND r.as_of_period = @period`;
    sqlParams.period = periodFilter;
  }

  query += `
    ORDER BY r.started_at DESC, r.run_id DESC
    OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY
  `;

  const result = await executeQuery<{
    run_id: number;
    report_type_code: string;
    entity_code: string;
    as_of_period: string;
    file_status: string;
    run_status: string;
    triggered_by: string | null;
    started_at: Date;
    completed_at: Date | null;
    duration_ms: number | null;
    output_row_count: number | null;
    error_message: string | null;
    actual_tb_status: string | null;
    budget_tb_status: string | null;
    actual_file_name: string | null;
    budget_file_name: string | null;
  }>(query, sqlParams);

  if (result.error) throw new Error(result.error);

  return (result.data || []).map((r) => ({
    runId: r.run_id,
    reportTypeCode: r.report_type_code,
    entityCode: r.entity_code,
    period: r.as_of_period,
    outputFileStatus: r.file_status,
    runStatus: mapRunStatus(r.run_status),
    triggeredBy: r.triggered_by,
    startedAt: r.started_at.toISOString(),
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    durationMs: r.duration_ms,
    outputRowCount: r.output_row_count,
    errorMessage: r.error_message,
    actualFileStatus: r.actual_tb_status,
    budgetFileStatus: r.budget_tb_status,
    actualFileName: r.actual_file_name,
    budgetFileName: r.budget_file_name,
  }));
}

/** @deprecated Use listReportProcessingAttempts */
export async function listReportProcessingLog(params: {
  limit?: number;
  entityCode?: string;
  period?: string;
}): Promise<FisReportProcessingAttemptRow[]> {
  return listReportProcessingAttempts(params);
}
