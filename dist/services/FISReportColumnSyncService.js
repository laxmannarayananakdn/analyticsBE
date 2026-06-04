/**
 * Sync admin.fis_report_columns from trial balance upload file names.
 * Pattern: TB_YYYYMM_ENTY_Actual.xlsx | TB_YYYYMM_ENTY_Budget.xlsx
 * One column per YYYYMM per entity instance (Actual and Budget share the same column).
 */
import { executeQuery } from '../config/database.js';
import { isDbFlag } from '../utils/sqlUtils.js';
import { parseTrialBalanceFileName, } from '../utils/financeFileNameResolver.js';
const AUTO_INSTANCE_CREATED_BY = 'tb-file-sync';
function getAutoReportTypeCode() {
    return (process.env.FIS_AUTO_REPORT_TYPE_CODE || 'MPR').trim().toUpperCase();
}
function autoInstanceName(entityCode) {
    return `${getAutoReportTypeCode()} - ${entityCode} (auto)`;
}
async function getReportTypeId(reportTypeCode) {
    const result = await executeQuery(`SELECT report_type_id FROM admin.fis_report_types
     WHERE UPPER(report_type_code) = @code AND is_active = 1`, { code: reportTypeCode });
    if (result.error)
        throw new Error(result.error);
    return result.data?.[0]?.report_type_id ?? null;
}
async function findOrCreateAutoInstance(reportTypeId, entityCode, uploadedBy) {
    const name = autoInstanceName(entityCode);
    const existing = await executeQuery(`SELECT instance_id FROM admin.fis_report_instances
     WHERE report_type_id = @reportTypeId AND instance_name = @name AND is_active = 1`, { reportTypeId, name });
    if (existing.error)
        throw new Error(existing.error);
    if (existing.data?.[0]?.instance_id) {
        const instanceId = existing.data[0].instance_id;
        await ensureInstanceCountry(instanceId, entityCode);
        return instanceId;
    }
    const insert = await executeQuery(`INSERT INTO admin.fis_report_instances (
       report_type_id, instance_name, country_scope, created_by
     )
     OUTPUT INSERTED.instance_id
     VALUES (@reportTypeId, @name, 'SINGLE', @createdBy)`, {
        reportTypeId,
        name,
        createdBy: uploadedBy || AUTO_INSTANCE_CREATED_BY,
    });
    if (insert.error)
        throw new Error(insert.error);
    const instanceId = insert.data?.[0]?.instance_id;
    if (!instanceId)
        throw new Error('Failed to create FIS report instance');
    await ensureInstanceCountry(instanceId, entityCode);
    return instanceId;
}
async function ensureInstanceCountry(instanceId, entityCode) {
    const check = await executeQuery(`SELECT id FROM admin.fis_instance_countries
     WHERE instance_id = @instanceId AND entity_code = @entityCode`, { instanceId, entityCode });
    if (check.error)
        throw new Error(check.error);
    if (check.data?.length)
        return;
    const ins = await executeQuery(`INSERT INTO admin.fis_instance_countries (instance_id, entity_code)
     VALUES (@instanceId, @entityCode)`, { instanceId, entityCode });
    if (ins.error)
        throw new Error(ins.error);
}
/** Set entity_code / period on all rows for this upload file. */
export async function backfillTrialBalanceEntityPeriod(parsed) {
    const colCheck = await executeQuery(`SELECT
       CASE WHEN COL_LENGTH('FIN.TrialBalance', 'entity_code') IS NOT NULL THEN 1 ELSE 0 END AS has_entity,
       CASE WHEN COL_LENGTH('FIN.TrialBalance', 'period') IS NOT NULL THEN 1 ELSE 0 END AS has_period`);
    if (colCheck.error)
        throw new Error(colCheck.error);
    const hasEntity = isDbFlag(colCheck.data?.[0]?.has_entity);
    const hasPeriod = isDbFlag(colCheck.data?.[0]?.has_period);
    if (!hasEntity && !hasPeriod)
        return 0;
    const sets = [];
    const params = {
        fileName: parsed.sourceFileName,
        baseName: parsed.sourceFileName,
        entityCode: parsed.entityCode,
        period: parsed.periodYyyymm,
    };
    if (hasEntity)
        sets.push('entity_code = @entityCode');
    if (hasPeriod)
        sets.push('period = @period');
    const result = await executeQuery(`UPDATE FIN.TrialBalance SET ${sets.join(', ')}
     WHERE file_name = @fileName OR file_name = @baseName`, params);
    if (result.error)
        throw new Error(result.error);
    return result.data?.length ?? 0;
}
async function renumberColumnOrder(instanceId) {
    const result = await executeQuery(`WITH ordered AS (
       SELECT column_id,
              ROW_NUMBER() OVER (
                ORDER BY fiscal_year ASC, fiscal_month_from ASC
              ) AS new_order
       FROM admin.fis_report_columns
       WHERE instance_id = @instanceId
     )
     UPDATE c
     SET column_order = o.new_order
     FROM admin.fis_report_columns c
     INNER JOIN ordered o ON c.column_id = o.column_id`, { instanceId });
    if (result.error)
        throw new Error(result.error);
}
async function upsertColumn(instanceId, parsed) {
    const params = {
        instanceId,
        sourceFileName: parsed.sourceFileName,
        columnLabel: parsed.columnLabel,
        fiscalYear: parsed.fiscalYear,
        fiscalMonthFrom: parsed.fiscalMonth,
        fiscalMonthTo: parsed.fiscalMonth,
        isYtd: 0,
    };
    const existing = await executeQuery(`SELECT column_id FROM admin.fis_report_columns
     WHERE instance_id = @instanceId
       AND fiscal_year = @fiscalYear
       AND fiscal_month_from = @fiscalMonthFrom
       AND fiscal_month_to = @fiscalMonthTo`, params);
    if (existing.error)
        throw new Error(existing.error);
    const hasSourceCol = await executeQuery(`SELECT CASE WHEN COL_LENGTH('admin.fis_report_columns', 'source_file_name') IS NOT NULL THEN 1 ELSE 0 END AS has_col`);
    const useSourceFileName = isDbFlag(hasSourceCol.data?.[0]?.has_col);
    if (existing.data?.[0]?.column_id) {
        const sets = [
            'column_label = @columnLabel',
            'fiscal_year = @fiscalYear',
            'fiscal_month_from = @fiscalMonthFrom',
            'fiscal_month_to = @fiscalMonthTo',
            'is_ytd = @isYtd',
        ];
        if (useSourceFileName)
            sets.push('source_file_name = @sourceFileName');
        const upd = await executeQuery(`UPDATE admin.fis_report_columns SET ${sets.join(', ')} WHERE column_id = @columnId`, { ...params, columnId: existing.data[0].column_id });
        if (upd.error)
            throw new Error(upd.error);
        await renumberColumnOrder(instanceId);
        return 'updated';
    }
    const maxOrder = await executeQuery(`SELECT MAX(column_order) AS max_order FROM admin.fis_report_columns WHERE instance_id = @instanceId`, { instanceId });
    const columnOrder = (maxOrder.data?.[0]?.max_order ?? 0) + 1;
    const columnList = useSourceFileName
        ? `instance_id, column_order, column_label, fiscal_year, fiscal_month_from, fiscal_month_to, is_ytd, source_file_name`
        : `instance_id, column_order, column_label, fiscal_year, fiscal_month_from, fiscal_month_to, is_ytd`;
    const valueList = useSourceFileName
        ? `@instanceId, @columnOrder, @columnLabel, @fiscalYear, @fiscalMonthFrom, @fiscalMonthTo, @isYtd, @sourceFileName`
        : `@instanceId, @columnOrder, @columnLabel, @fiscalYear, @fiscalMonthFrom, @fiscalMonthTo, @isYtd`;
    const ins = await executeQuery(`INSERT INTO admin.fis_report_columns (${columnList}) VALUES (${valueList})`, { ...params, columnOrder });
    if (ins.error)
        throw new Error(ins.error);
    await renumberColumnOrder(instanceId);
    return 'inserted';
}
/**
 * After a TB file is loaded, ensure a report instance and column exist for that entity/period.
 */
export async function syncFisReportColumnsFromTrialBalanceFile(fileName, uploadedBy) {
    const parsed = parseTrialBalanceFileName(fileName);
    if (!parsed) {
        return {
            synced: false,
            message: `File name does not match TB_YYYYMM_ENTY_Actual|Budget pattern: ${fileName}`,
        };
    }
    const reportTypeCode = getAutoReportTypeCode();
    const reportTypeId = await getReportTypeId(reportTypeCode);
    if (!reportTypeId) {
        return {
            synced: false,
            message: `Report type "${reportTypeCode}" not found or inactive in admin.fis_report_types.`,
        };
    }
    const instanceId = await findOrCreateAutoInstance(reportTypeId, parsed.entityCode, uploadedBy);
    const columnAction = await upsertColumn(instanceId, parsed);
    await backfillTrialBalanceEntityPeriod(parsed);
    console.log(`[FIS] Synced column ${parsed.periodYyyymm} for ${parsed.entityCode} → instance ${instanceId} (${columnAction}, "${parsed.columnLabel}")`);
    return { synced: true, instanceId, columnAction };
}
/**
 * Repair TB rows and FIS columns from completed EF uploads (e.g. after a deploy gap).
 */
export async function repairFisFromCompletedTbUploads() {
    const uploads = await executeQuery(`SELECT u.file_name, u.uploaded_by
     FROM EF.Uploads u
     INNER JOIN EF.FileTypes ft ON u.file_type_id = ft.id
     WHERE u.status = 'COMPLETED'
       AND ft.type_code IN ('FIN_TB_ACTUAL', 'FIN_TB_BUDGET')
       AND u.file_name LIKE 'TB[_]%'
     ORDER BY u.uploaded_at ASC`);
    if (uploads.error)
        throw new Error(uploads.error);
    let columnsSynced = 0;
    const errors = [];
    for (const row of uploads.data || []) {
        const parsed = parseTrialBalanceFileName(row.file_name);
        if (!parsed)
            continue;
        try {
            await backfillTrialBalanceEntityPeriod(parsed);
            const sync = await syncFisReportColumnsFromTrialBalanceFile(row.file_name, row.uploaded_by || AUTO_INSTANCE_CREATED_BY);
            if (sync.synced)
                columnsSynced += 1;
            else if (sync.message)
                errors.push(`${row.file_name}: ${sync.message}`);
        }
        catch (e) {
            errors.push(`${row.file_name}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return {
        uploadsProcessed: uploads.data?.length ?? 0,
        columnsSynced,
        errors,
    };
}
//# sourceMappingURL=FISReportColumnSyncService.js.map