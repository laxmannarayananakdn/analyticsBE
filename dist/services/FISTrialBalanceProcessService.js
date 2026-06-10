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
export async function buildColumnsFromEntityTrialBalance(entityCode, period) {
    const entity = entityCode.trim().toUpperCase();
    const periodFilter = period?.trim();
    const params = { entity };
    let periodClause = '';
    if (periodFilter) {
        periodClause = ' AND tb.period = @period';
        params.period = periodFilter;
    }
    const result = await executeQuery(`SELECT DISTINCT
       tb.period,
       CAST(LEFT(tb.period, 4) AS INT) AS fiscal_year,
       CAST(RIGHT(tb.period, 2) AS INT) AS fiscal_month,
       DATENAME(MONTH, DATEFROMPARTS(CAST(LEFT(tb.period, 4) AS INT), CAST(RIGHT(tb.period, 2) AS INT), 1))
         + ' ' + LEFT(tb.period, 4) AS column_label
     FROM FIN.TrialBalance tb
     WHERE UPPER(LTRIM(RTRIM(tb.entity_code))) = @entity
       AND tb.period IS NOT NULL
       AND LEN(tb.period) = 6
       ${periodClause}
     ORDER BY fiscal_year, fiscal_month`, params);
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map((row, index) => ({
        columnOrder: index + 1,
        columnLabel: row.column_label,
        fiscalYear: row.fiscal_year,
        fiscalMonthFrom: row.fiscal_month,
        fiscalMonthTo: row.fiscal_month,
        isYtd: false,
    }));
}
/** Verify TB rows exist for entity + period before scoping an instance. */
export async function assertTrialBalanceDataForPeriod(entityCode, period) {
    const entity = entityCode.trim().toUpperCase();
    const periodNorm = period.trim();
    const result = await executeQuery(`SELECT COUNT(*) AS cnt
     FROM FIN.TrialBalance
     WHERE UPPER(LTRIM(RTRIM(entity_code))) = @entity AND period = @period`, { entity, period: periodNorm });
    if (result.error)
        throw new Error(result.error);
    if (!result.data?.[0]?.cnt) {
        throw new Error(`No trial balance data for ${entity} period ${periodNorm}`);
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