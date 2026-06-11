/**
 * Trial balance discovery and FIS column sync from FIN.TrialBalance.
 */
import { executeQuery } from '../config/database.js';
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
function toIsoDate(value) {
    return value instanceof Date ? value.toISOString() : String(value);
}
function groupLatestByEntityPeriod(rows) {
    const map = new Map();
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
        }
        else if (tbType === 'BUDGET') {
            entry.budgetUploadId = row.upload_id;
            entry.budgetFileName = row.file_name;
            entry.budgetUploadedAt = uploadedAt;
            entry.budgetRowCount = row.row_count;
        }
    }
    return Array.from(map.values()).sort((a, b) => {
        const entityCmp = a.entityCode.localeCompare(b.entityCode);
        if (entityCmp !== 0)
            return entityCmp;
        return b.period.localeCompare(a.period);
    });
}
async function fetchLatestTrialBalanceUploads() {
    const result = await executeQuery(TB_UPLOAD_SUMMARY_SQL);
    if (result.error)
        throw new Error(result.error);
    return result.data || [];
}
export async function listTrialBalanceEntityPeriods() {
    const rows = await fetchLatestTrialBalanceUploads();
    return groupLatestByEntityPeriod(rows);
}
export async function getLatestTrialBalanceUploads(entityCode, period) {
    const entity = entityCode.trim().toUpperCase();
    const periodNorm = period.trim();
    const rows = await fetchLatestTrialBalanceUploads();
    let actual = null;
    let budget = null;
    for (const row of rows) {
        if (row.entity_code !== entity || row.period !== periodNorm)
            continue;
        const info = {
            uploadId: row.upload_id,
            fileName: row.file_name,
            typeCode: row.tb_type.toUpperCase() === 'BUDGET' ? 'FIN_TB_BUDGET' : 'FIN_TB_ACTUAL',
            uploadedAt: toIsoDate(row.uploaded_at),
            uploadedBy: row.uploaded_by,
            rowCount: row.row_count,
        };
        if (row.tb_type.toUpperCase() === 'ACTUAL' && !actual)
            actual = info;
        if (row.tb_type.toUpperCase() === 'BUDGET' && !budget)
            budget = info;
        if (actual && budget)
            break;
    }
    return { actual, budget };
}
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
function parsePeriod(period) {
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
/** Six columns per processed month: Actual, Budget, YTD Actual, YTD Budget, YTD Variance, YTD Var %. */
export function buildMonthColumnSet(period, startOrder = 1) {
    const { fiscalYear, fiscalMonth, monthName } = parsePeriod(period);
    let order = startOrder;
    const col = (columnLabel, monthFrom, monthTo, isYtd, tbType, columnKind) => ({
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
        col(`${monthName} Actual`, fiscalMonth, fiscalMonth, false, 'ACTUAL', 'TB_SUM'),
        col(`${monthName} Budget`, fiscalMonth, fiscalMonth, false, 'BUDGET', 'TB_SUM'),
        col('YTD Actual', 1, fiscalMonth, true, 'ACTUAL', 'TB_SUM'),
        col('YTD Budget', 1, fiscalMonth, true, 'BUDGET', 'TB_SUM'),
        col('YTD Variance', 1, fiscalMonth, true, null, 'YTD_VARIANCE'),
        col('YTD Var %', 1, fiscalMonth, true, null, 'YTD_VAR_PCT'),
    ];
}
export async function buildColumnsFromEntityTrialBalance(entityCode, period) {
    const entity = entityCode.trim().toUpperCase();
    const periodFilter = period?.trim();
    const params = { entity };
    let periodClause = '';
    if (periodFilter) {
        periodClause = ' AND tb.period = @period';
        params.period = periodFilter;
    }
    const result = await executeQuery(`SELECT DISTINCT tb.period
     FROM FIN.TrialBalance tb
     WHERE UPPER(LTRIM(RTRIM(tb.entity_code))) = @entity
       AND tb.period IS NOT NULL
       AND LEN(tb.period) = 6
       ${periodClause}
     ORDER BY tb.period`, params);
    if (result.error)
        throw new Error(result.error);
    const periods = (result.data || []).map((row) => row.period);
    const columns = [];
    let order = 1;
    for (const p of periods) {
        const monthCols = buildMonthColumnSet(p, order);
        columns.push(...monthCols);
        order += monthCols.length;
    }
    return columns;
}
/** Verify both Actual and Budget TB rows exist for entity + period. */
export async function assertTrialBalanceDataForPeriod(entityCode, period) {
    const entity = entityCode.trim().toUpperCase();
    const periodNorm = period.trim();
    const result = await executeQuery(`SELECT
       SUM(CASE WHEN UPPER(tb.tb_type) = 'ACTUAL' THEN 1 ELSE 0 END) AS actual_cnt,
       SUM(CASE WHEN UPPER(tb.tb_type) = 'BUDGET' THEN 1 ELSE 0 END) AS budget_cnt
     FROM FIN.TrialBalance tb
     WHERE UPPER(LTRIM(RTRIM(tb.entity_code))) = @entity AND tb.period = @period`, { entity, period: periodNorm });
    if (result.error)
        throw new Error(result.error);
    const row = result.data?.[0];
    if (!row?.actual_cnt) {
        throw new Error(`No Actual trial balance data for ${entity} period ${periodNorm}`);
    }
    if (!row?.budget_cnt) {
        throw new Error(`No Budget trial balance data for ${entity} period ${periodNorm}`);
    }
}
export async function getReportOutputPreview(instanceId, limit = 100) {
    const countResult = await executeQuery(`SELECT COUNT(*) AS total FROM rp.fis_report_output WHERE instance_id = @instanceId`, { instanceId });
    if (countResult.error)
        throw new Error(countResult.error);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const rowsResult = await executeQuery(`SELECT TOP (@limit)
       output_id, instance_id, column_id, column_label,
       line_item_code, line_item_label, display_order, amount, format_type
     FROM rp.fis_report_output
     WHERE instance_id = @instanceId
     ORDER BY display_order, column_id`, { instanceId, limit: safeLimit });
    if (rowsResult.error)
        throw new Error(rowsResult.error);
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
//# sourceMappingURL=FISTrialBalanceProcessService.js.map