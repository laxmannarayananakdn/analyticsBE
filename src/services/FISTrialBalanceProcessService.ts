/**
 * Trial balance discovery and FIS column sync from FIN.TrialBalance.
 */

import { executeQuery } from '../config/database.js';
import { isFisPhase4Enabled } from './FISRunTrackingService.js';

export interface TbEntityPeriod {
  entityCode: string;
  period: string;
  actualUploadId: number | null;
  budgetUploadId: number | null;
  actualFileName: string | null;
  budgetFileName: string | null;
  actualUploadedAt: string | null;
  budgetUploadedAt: string | null;
  actualRowCount: number | null;
  budgetRowCount: number | null;
  actualFileStatus?: string | null;
  budgetFileStatus?: string | null;
  isTbLocked?: boolean;
}

export interface TbUploadInfo {
  uploadId: number;
  fileName: string;
  typeCode: 'FIN_TB_ACTUAL' | 'FIN_TB_BUDGET';
  uploadedAt: string;
  uploadedBy: string;
  rowCount: number | null;
}

export interface FisReportOutputRow {
  outputId: number;
  instanceId: number | null;
  columnId: number;
  columnCode?: string | null;
  columnLabel: string;
  lineItemCode: string;
  lineItemLabel: string;
  displayOrder: number;
  amount: number | null;
  formatType: string | null;
  status?: string | null;
}

interface LatestTbUploadRow {
  entity_code: string;
  period: string;
  tb_type: string;
  upload_id: number;
  file_name: string;
  uploaded_at: Date;
  uploaded_by: string;
  row_count: number;
}

const TB_UPLOAD_SUMMARY_SQL = `
  WITH upload_summary AS (
    SELECT
      UPPER(LTRIM(RTRIM(tb.entity_code))) AS entity_code,
      tb.period,
      tb.tb_type,
      tb.upload_id,
      MAX(tb.file_name) AS file_name,
      MAX(tb.uploaded_at) AS uploaded_at,
      MAX(tb.uploaded_by) AS uploaded_by,
      COUNT(*) AS row_count
    FROM FIN.TrialBalance tb
    WHERE tb.entity_code IS NOT NULL
      AND LTRIM(RTRIM(tb.entity_code)) <> ''
      AND tb.period IS NOT NULL
      AND LEN(tb.period) = 6
    GROUP BY
      UPPER(LTRIM(RTRIM(tb.entity_code))),
      tb.period,
      tb.tb_type,
      tb.upload_id
  ),
  latest AS (
    SELECT
      entity_code,
      period,
      tb_type,
      upload_id,
      file_name,
      uploaded_at,
      uploaded_by,
      row_count,
      ROW_NUMBER() OVER (
        PARTITION BY entity_code, period, tb_type
        ORDER BY uploaded_at DESC, upload_id DESC
      ) AS rn
    FROM upload_summary
  )
  SELECT entity_code, period, tb_type, upload_id, file_name, uploaded_at, uploaded_by, row_count
  FROM latest
  WHERE rn = 1
`;

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function groupLatestByEntityPeriod(rows: LatestTbUploadRow[]): TbEntityPeriod[] {
  const map = new Map<string, TbEntityPeriod>();

  for (const row of rows) {
    const key = `${row.entity_code}|${row.period}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        entityCode: row.entity_code,
        period: row.period,
        actualUploadId: null,
        budgetUploadId: null,
        actualFileName: null,
        budgetFileName: null,
        actualUploadedAt: null,
        budgetUploadedAt: null,
        actualRowCount: null,
        budgetRowCount: null,
      };
      map.set(key, entry);
    }

    const uploadedAt = toIsoDate(row.uploaded_at);
    const tbType = row.tb_type.toUpperCase();

    if (tbType === 'ACTUAL') {
      entry.actualUploadId = row.upload_id;
      entry.actualFileName = row.file_name;
      entry.actualUploadedAt = uploadedAt;
      entry.actualRowCount = row.row_count;
    } else if (tbType === 'BUDGET') {
      entry.budgetUploadId = row.upload_id;
      entry.budgetFileName = row.file_name;
      entry.budgetUploadedAt = uploadedAt;
      entry.budgetRowCount = row.row_count;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const entityCmp = a.entityCode.localeCompare(b.entityCode);
    if (entityCmp !== 0) return entityCmp;
    return b.period.localeCompare(a.period);
  });
}

async function fetchLatestTrialBalanceUploads(): Promise<LatestTbUploadRow[]> {
  const result = await executeQuery<LatestTbUploadRow>(TB_UPLOAD_SUMMARY_SQL);
  if (result.error) throw new Error(result.error);
  return result.data || [];
}

export async function listTrialBalanceEntityPeriods(): Promise<TbEntityPeriod[]> {
  const rows = await fetchLatestTrialBalanceUploads();
  const periods = groupLatestByEntityPeriod(rows);

  if (!isFisPhase4Enabled() || periods.length === 0) {
    return periods;
  }

  const coverageResult = await executeQuery<{
    entity_code: string;
    period: string;
    actual_file_status: string | null;
    budget_file_status: string | null;
    is_tb_locked: number;
  }>(
    `SELECT
       c.entity_code, c.period, c.actual_file_status, c.budget_file_status,
       CASE WHEN l.entity_code IS NOT NULL THEN 1 ELSE 0 END AS is_tb_locked
     FROM admin.fis_tb_period_coverage c
     LEFT JOIN admin.fis_entity_period_lock l
       ON l.entity_code = c.entity_code AND l.period = c.period`
  );
  if (coverageResult.error) throw new Error(coverageResult.error);

  type CoverageRow = {
    entity_code: string;
    period: string;
    actual_file_status: string | null;
    budget_file_status: string | null;
    is_tb_locked: number;
  };

  const coverageMap = new Map<string, CoverageRow>();
  for (const row of coverageResult.data || []) {
    coverageMap.set(`${row.entity_code}|${row.period}`, row);
  }

  return periods.map((entry) => {
    const cov = coverageMap.get(`${entry.entityCode}|${entry.period}`);
    if (!cov) return entry;
    return {
      ...entry,
      actualFileStatus: cov.actual_file_status,
      budgetFileStatus: cov.budget_file_status,
      isTbLocked: cov.is_tb_locked === 1,
    };
  });
}

/** Latest budget period on or before target (same fiscal year); null if none. */
export async function resolveBudgetSourcePeriod(
  entityCode: string,
  period: string
): Promise<string | null> {
  const entity = entityCode.trim().toUpperCase();
  const periodNorm = period.trim();
  const fiscalYear = periodNorm.slice(0, 4);
  const result = await executeQuery<{ source_period: string | null }>(
    `SELECT MAX(tb.period) AS source_period
     FROM FIN.TrialBalance tb
     WHERE UPPER(LTRIM(RTRIM(tb.entity_code))) = @entity
       AND UPPER(tb.tb_type) = 'BUDGET'
       AND tb.period IS NOT NULL
       AND LEN(tb.period) = 6
       AND LEFT(tb.period, 4) = @fiscalYear
       AND tb.period <= @period`,
    { entity, period: periodNorm, fiscalYear }
  );
  if (result.error) throw new Error(result.error);
  return result.data?.[0]?.source_period ?? null;
}

function uploadInfoFromRow(row: LatestTbUploadRow): TbUploadInfo {
  return {
    uploadId: row.upload_id,
    fileName: row.file_name,
    typeCode: row.tb_type.toUpperCase() === 'BUDGET' ? 'FIN_TB_BUDGET' : 'FIN_TB_ACTUAL',
    uploadedAt: toIsoDate(row.uploaded_at),
    uploadedBy: row.uploaded_by,
    rowCount: row.row_count,
  };
}

export async function getLatestTrialBalanceUploads(
  entityCode: string,
  period: string
): Promise<{
  actual: TbUploadInfo | null;
  budget: TbUploadInfo | null;
  budgetSourcePeriod: string | null;
  budgetUsesFallback: boolean;
}> {
  const entity = entityCode.trim().toUpperCase();
  const periodNorm = period.trim();

  const rows = await fetchLatestTrialBalanceUploads();
  let actual: TbUploadInfo | null = null;
  let budgetForPeriod: TbUploadInfo | null = null;

  for (const row of rows) {
    if (row.entity_code !== entity || row.period !== periodNorm) continue;

    const info = uploadInfoFromRow(row);
    if (row.tb_type.toUpperCase() === 'ACTUAL' && !actual) actual = info;
    if (row.tb_type.toUpperCase() === 'BUDGET' && !budgetForPeriod) budgetForPeriod = info;
    if (actual && budgetForPeriod) break;
  }

  const budgetSourcePeriod = await resolveBudgetSourcePeriod(entity, periodNorm);
  let budget = budgetForPeriod;
  if (!budget && budgetSourcePeriod) {
    for (const row of rows) {
      if (
        row.entity_code === entity &&
        row.period === budgetSourcePeriod &&
        row.tb_type.toUpperCase() === 'BUDGET'
      ) {
        budget = uploadInfoFromRow(row);
        break;
      }
    }
  }

  return {
    actual,
    budget,
    budgetSourcePeriod,
    budgetUsesFallback: Boolean(budgetSourcePeriod && budgetSourcePeriod !== periodNorm),
  };
}

export type FisColumnKind =
  | 'TB_SUM'
  | 'APPROVED_BUDGET'
  | 'YTD_VARIANCE'
  | 'YTD_VAR_PCT'
  | 'CM_VARIANCE'
  | 'CM_VAR_PCT'
  | 'PERF_PCT'
  | 'POINT_IN_TIME'
  | 'AUDITED_PLACEHOLDER';
export type FisColumnTbType = 'ACTUAL' | 'BUDGET';

export interface FisMonthColumnDef {
  columnOrder: number;
  columnLabel: string;
  fiscalYear: number;
  fiscalMonthFrom: number;
  fiscalMonthTo: number;
  isYtd: boolean;
  tbType: FisColumnTbType | null;
  columnKind: FisColumnKind;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parsePeriod(period: string): { fiscalYear: number; fiscalMonth: number; monthName: string } {
  const periodNorm = period.trim();
  if (periodNorm.length !== 6) {
    throw new Error(`Invalid period (expected YYYYMM): ${period}`);
  }
  const fiscalYear = parseInt(periodNorm.slice(0, 4), 10);
  const fiscalMonth = parseInt(periodNorm.slice(4, 6), 10);
  if (!Number.isFinite(fiscalYear) || !Number.isFinite(fiscalMonth) || fiscalMonth < 1 || fiscalMonth > 12) {
    throw new Error(`Invalid period (expected YYYYMM): ${period}`);
  }
  const monthName = `${MONTH_NAMES[fiscalMonth - 1]} ${fiscalYear}`;
  return { fiscalYear, fiscalMonth, monthName };
}

export type FisColumnSortInput = {
  fiscalYear: number;
  fiscalMonthTo: number;
  isYtd: boolean;
  tbType: FisColumnTbType | null;
  columnKind: FisColumnKind;
  columnLabel?: string;
};

function normalizeTbType(tbType: string | null | undefined): FisColumnTbType | null {
  if (!tbType?.trim()) return null;
  const upper = tbType.trim().toUpperCase();
  return upper === 'BUDGET' || upper === 'ACTUAL' ? upper : null;
}

/** Within each month block: Budget before Actual; YTD Budget before YTD Actual. */
export function fisColumnBlockSortKey(col: FisColumnSortInput): number {
  const kind = col.columnKind || 'TB_SUM';
  if (kind === 'YTD_VARIANCE') return 5;
  if (kind === 'YTD_VAR_PCT') return 6;

  const tbType = normalizeTbType(col.tbType);
  if (tbType === 'BUDGET' && !col.isYtd) return 1;
  if (tbType === 'ACTUAL' && !col.isYtd) return 2;
  if (tbType === 'BUDGET' && col.isYtd) return 3;
  if (tbType === 'ACTUAL' && col.isYtd) return 4;

  const label = col.columnLabel?.trim() ?? '';
  if (label.includes('Var %')) return 6;
  if (label.includes('Variance')) return 5;
  if (label.includes('YTD Budget')) return 3;
  if (label.includes('YTD Actual')) return 4;
  if (label.endsWith('Budget')) return 1;
  if (label.endsWith('Actual')) return 2;

  return 99;
}

export function compareFisReportColumns(a: FisColumnSortInput, b: FisColumnSortInput): number {
  if (a.fiscalYear !== b.fiscalYear) return a.fiscalYear - b.fiscalYear;
  if (a.fiscalMonthTo !== b.fiscalMonthTo) return a.fiscalMonthTo - b.fiscalMonthTo;
  const keyDiff = fisColumnBlockSortKey(a) - fisColumnBlockSortKey(b);
  if (keyDiff !== 0) return keyDiff;
  return (a.columnLabel ?? '').localeCompare(b.columnLabel ?? '');
}

/** Six columns per month: Budget, Actual, YTD Budget, YTD Actual, YTD Variance, YTD Var %. */
export function buildMonthColumnSet(period: string, startOrder = 1): FisMonthColumnDef[] {
  const { fiscalYear, fiscalMonth, monthName } = parsePeriod(period);
  let order = startOrder;

  const col = (
    columnLabel: string,
    monthFrom: number,
    monthTo: number,
    isYtd: boolean,
    tbType: FisColumnTbType | null,
    columnKind: FisColumnKind
  ): FisMonthColumnDef => ({
    columnOrder: order++,
    columnLabel,
    fiscalYear,
    fiscalMonthFrom: monthFrom,
    fiscalMonthTo: monthTo,
    isYtd,
    tbType,
    columnKind,
  });

  return [
    col(`${monthName} Budget`, fiscalMonth, fiscalMonth, false, 'BUDGET', 'TB_SUM'),
    col(`${monthName} Actual`, fiscalMonth, fiscalMonth, false, 'ACTUAL', 'TB_SUM'),
    col(`${monthName} YTD Budget`, 1, fiscalMonth, true, 'BUDGET', 'TB_SUM'),
    col(`${monthName} YTD Actual`, 1, fiscalMonth, true, 'ACTUAL', 'TB_SUM'),
    col(`${monthName} YTD Variance`, 1, fiscalMonth, true, null, 'YTD_VARIANCE'),
    col(`${monthName} YTD Var %`, 1, fiscalMonth, true, null, 'YTD_VAR_PCT'),
  ];
}

export async function buildColumnsFromEntityTrialBalance(
  entityCode: string,
  period?: string
): Promise<FisMonthColumnDef[]> {
  const entity = entityCode.trim().toUpperCase();
  const periodFilter = period?.trim();

  const params: Record<string, unknown> = { entity };
  let periodClause = '';
  if (periodFilter) {
    periodClause = ' AND tb.period = @period';
    params.period = periodFilter;
  }

  const result = await executeQuery<{ period: string }>(
    `SELECT DISTINCT tb.period
     FROM FIN.TrialBalance tb
     WHERE UPPER(LTRIM(RTRIM(tb.entity_code))) = @entity
       AND tb.period IS NOT NULL
       AND LEN(tb.period) = 6
       AND UPPER(tb.tb_type) IN ('ACTUAL', 'BUDGET')
       ${periodClause}
     ORDER BY tb.period`,
    params
  );
  if (result.error) throw new Error(result.error);

  const periods = (result.data || []).map((row) => row.period);
  const columns: FisMonthColumnDef[] = [];
  let order = 1;
  for (const p of periods) {
    const monthCols = buildMonthColumnSet(p, order);
    columns.push(...monthCols);
    order += monthCols.length;
  }
  return columns;
}

/**
 * Actual or Budget (or both) must exist for the period. Either side alone is enough:
 * missing-side columns are left as-is (the report procs tolerate empty Actual/Budget sets).
 */
export async function assertTrialBalanceDataForPeriod(
  entityCode: string,
  period: string
): Promise<void> {
  const entity = entityCode.trim().toUpperCase();
  const periodNorm = period.trim();
  const result = await executeQuery<{ tb_cnt: number }>(
    `SELECT COUNT(*) AS tb_cnt
     FROM FIN.TrialBalance tb
     WHERE UPPER(LTRIM(RTRIM(tb.entity_code))) = @entity
       AND tb.period = @period
       AND UPPER(tb.tb_type) IN ('ACTUAL', 'BUDGET')`,
    { entity, period: periodNorm }
  );
  if (result.error) throw new Error(result.error);
  if (!result.data?.[0]?.tb_cnt) {
    throw new Error(`No Actual or Budget trial balance data for ${entity} period ${periodNorm}`);
  }
}

export async function getReportOutputPreview(
  instanceId: number,
  limit = 100
): Promise<{ totalRows: number; rows: FisReportOutputRow[] }> {
  const countResult = await executeQuery<{ total: number }>(
    `SELECT COUNT(*) AS total FROM rp.fis_report_output WHERE instance_id = @instanceId`,
    { instanceId }
  );
  if (countResult.error) throw new Error(countResult.error);

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const rowsResult = await executeQuery<{
    output_id: number;
    instance_id: number | null;
    column_id: number;
    column_label: string;
    line_item_code: string;
    line_item_label: string;
    display_order: number;
    amount: number | null;
    format_type: string | null;
  }>(
    `SELECT TOP (@limit)
       output_id, instance_id, column_id, column_label,
       line_item_code, line_item_label, display_order, amount, format_type
     FROM rp.fis_report_output
     WHERE instance_id = @instanceId
     ORDER BY display_order, column_id`,
    { instanceId, limit: safeLimit }
  );
  if (rowsResult.error) throw new Error(rowsResult.error);

  return {
    totalRows: Number(countResult.data?.[0]?.total) || 0,
    rows: (rowsResult.data || []).map((r) => ({
      outputId: r.output_id,
      instanceId: r.instance_id,
      columnId: r.column_id,
      columnLabel: r.column_label,
      lineItemCode: r.line_item_code,
      lineItemLabel: r.line_item_label,
      displayOrder: r.display_order,
      amount: r.amount,
      formatType: r.format_type,
    })),
  };
}

export async function getReportOutputPreviewByRunKey(
  reportTypeCode: string,
  entityCode: string,
  asOfPeriod: string,
  limit = 100,
  fileStatus?: string | null,
  options?: { outputTable?: 'live' | 'new' }
): Promise<{ totalRows: number; rows: FisReportOutputRow[] }> {
  const reportType = reportTypeCode.trim().toUpperCase();
  const entity = entityCode.trim().toUpperCase();
  const period = asOfPeriod.trim();
  const statusFilter = fileStatus?.trim() || null;
  const tableName = options?.outputTable === 'new' ? 'rp.fis_report_output_new' : 'rp.fis_report_output';

  const countSql = statusFilter
    ? `SELECT COUNT(*) AS total FROM ${tableName}
       WHERE report_type_code = @reportType
         AND entity_code = @entity
         AND as_of_period = @period
         AND file_status = @fileStatus`
    : `SELECT COUNT(*) AS total FROM ${tableName}
       WHERE report_type_code = @reportType
         AND entity_code = @entity
         AND as_of_period = @period`;
  const countParams: Record<string, unknown> = { reportType, entity, period };
  if (statusFilter) countParams.fileStatus = statusFilter;

  const countResult = await executeQuery<{ total: number }>(countSql, countParams);
  if (countResult.error) throw new Error(countResult.error);

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const statusWhere = statusFilter ? ` AND o.file_status = @fileStatus` : '';
  const useNewTable = options?.outputTable === 'new';
  const rowsResult = await executeQuery<{
    output_id: number;
    instance_id?: number | null;
    column_id: number;
    column_code: string | null;
    column_label: string;
    line_item_code: string;
    line_item_label: string;
    display_order: number;
    amount: number | null;
    format_type: string | null;
    status?: string | null;
  }>(
    useNewTable
      ? `SELECT TOP (@limit)
           o.output_id, o.column_id, o.column_code, o.column_label,
           o.line_item_code, o.line_item_label, o.display_order, o.amount, o.format_type, o.status
         FROM ${tableName} o
         LEFT JOIN admin.fis_report_column_defs cd
           ON cd.column_code = o.column_code
          AND cd.report_type_id = (
            SELECT report_type_id FROM admin.fis_report_types
            WHERE report_type_code = @reportType
          )
         WHERE o.report_type_code = @reportType
           AND o.entity_code = @entity
           AND o.as_of_period = @period${statusWhere}
         ORDER BY o.display_order, COALESCE(cd.display_order, o.column_id)`
      : `SELECT TOP (@limit)
           o.output_id, o.instance_id, o.column_id, o.column_code, o.column_label,
           o.line_item_code, o.line_item_label, o.display_order, o.amount, o.format_type
         FROM ${tableName} o
         LEFT JOIN admin.fis_report_column_defs cd
           ON cd.column_code = o.column_code
          AND cd.report_type_id = (
            SELECT report_type_id FROM admin.fis_report_types
            WHERE report_type_code = @reportType
          )
         WHERE o.report_type_code = @reportType
           AND o.entity_code = @entity
           AND o.as_of_period = @period${statusWhere}
         ORDER BY o.display_order, COALESCE(cd.display_order, o.column_id)`,
    { reportType, entity, period, limit: safeLimit, ...(statusFilter ? { fileStatus: statusFilter } : {}) }
  );
  if (rowsResult.error) throw new Error(rowsResult.error);

  return {
    totalRows: Number(countResult.data?.[0]?.total) || 0,
    rows: (rowsResult.data || []).map((r) => ({
      outputId: r.output_id,
      instanceId: useNewTable ? null : (r.instance_id ?? null),
      columnId: r.column_id,
      columnCode: r.column_code,
      columnLabel: r.column_label,
      lineItemCode: r.line_item_code,
      lineItemLabel: r.line_item_label,
      displayOrder: r.display_order,
      amount: r.amount,
      formatType: r.format_type,
      status: r.status ?? null,
    })),
  };
}
