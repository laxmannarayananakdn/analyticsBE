/**
 * FIS (Financial Information System) Reporting Service
 */
import { executeQuery, executeProcedure, getConnection, sql } from '../config/database.js';
import { assertTrialBalanceDataForPeriod, buildMonthColumnSet, compareFisReportColumns, } from './FISTrialBalanceProcessService.js';
import { completeReportRun, isFisPhase4Enabled, resolveFileStatusForPeriod, startReportRun, } from './FISRunTrackingService.js';
export class FISServiceError extends Error {
    statusCode;
    constructor(message, statusCode = 500) {
        super(message);
        this.name = 'FISServiceError';
        this.statusCode = statusCode;
    }
}
function throwOnError(error, notFoundMessage) {
    if (!error)
        return;
    if (notFoundMessage && error.toLowerCase().includes('not found')) {
        throw new FISServiceError(notFoundMessage, 404);
    }
    throw new FISServiceError(error);
}
function toInt(value, field) {
    const n = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (Number.isNaN(n)) {
        throw new FISServiceError(`Invalid ${field}`, 400);
    }
    return n;
}
function toBit(value, defaultValue = 0) {
    if (value === undefined || value === null)
        return defaultValue;
    if (typeof value === 'boolean')
        return value ? 1 : 0;
    if (value === 1 || value === '1' || value === 'true')
        return 1;
    return 0;
}
function normalizeHexColor(value) {
    if (value === undefined || value === null)
        return null;
    const color = String(value).trim();
    if (!color)
        return null;
    if (!/^#([A-Fa-f0-9]{6})$/.test(color)) {
        throw new FISServiceError('Color values must be valid hex codes in #RRGGBB format', 400);
    }
    return color.toUpperCase();
}
function pickField(obj, camel, snake) {
    if (obj[camel] !== undefined)
        return obj[camel];
    if (obj[snake] !== undefined)
        return obj[snake];
    return undefined;
}
function criterionFromInput(c) {
    const raw = c;
    return {
        dimension: String(pickField(raw, 'dimension', 'dimension') ?? ''),
        filterType: String(pickField(raw, 'filterType', 'filter_type') ?? ''),
        valueSingle: (pickField(raw, 'valueSingle', 'value_single') ?? null),
        valueList: (pickField(raw, 'valueList', 'value_list') ?? null),
        valueRangeFrom: (pickField(raw, 'valueRangeFrom', 'value_range_from') ?? null),
        valueRangeTo: (pickField(raw, 'valueRangeTo', 'value_range_to') ?? null),
    };
}
function columnFromInput(col) {
    const raw = col;
    const tbType = pickField(raw, 'tbType', 'tb_type');
    const columnKind = pickField(raw, 'columnKind', 'column_kind');
    return {
        columnOrder: toInt(pickField(raw, 'columnOrder', 'column_order'), 'columnOrder'),
        columnLabel: String(pickField(raw, 'columnLabel', 'column_label') ?? ''),
        fiscalYear: toInt(pickField(raw, 'fiscalYear', 'fiscal_year'), 'fiscalYear'),
        fiscalMonthFrom: toInt(pickField(raw, 'fiscalMonthFrom', 'fiscal_month_from'), 'fiscalMonthFrom'),
        fiscalMonthTo: toInt(pickField(raw, 'fiscalMonthTo', 'fiscal_month_to'), 'fiscalMonthTo'),
        isYtd: toBit(pickField(raw, 'isYtd', 'is_ytd')),
        tbType: tbType != null && String(tbType).trim() !== '' ? String(tbType).trim().toUpperCase() : null,
        columnKind: columnKind ? String(columnKind).trim().toUpperCase() : 'TB_SUM',
    };
}
export class FISService {
    // ---------------------------------------------------------------------------
    // Report types
    // ---------------------------------------------------------------------------
    async getReportTypes() {
        const result = await executeQuery(`SELECT report_type_id, report_type_code, report_type_name, description, chart_id, is_active, created_at, created_by
       FROM admin.fis_report_types
       WHERE is_active = 1
       ORDER BY report_type_name`);
        throwOnError(result.error);
        return (result.data || []).map((r) => ({
            reportTypeId: r.report_type_id,
            reportTypeCode: r.report_type_code,
            reportTypeName: r.report_type_name,
            description: r.description,
            chartId: r.chart_id,
            isActive: r.is_active === true || r.is_active === 1,
            createdAt: r.created_at,
            createdBy: r.created_by,
        }));
    }
    async createReportType(data) {
        const reportTypeCode = String(data.reportTypeCode ?? data.report_type_code ?? '')
            .trim()
            .toUpperCase();
        const reportTypeName = String(data.reportTypeName ?? data.report_type_name ?? '').trim();
        const description = String(data.description ?? '').trim() || null;
        const chartId = String(data.chartId ?? data.chart_id ?? '').trim() || null;
        const createdBy = (data.createdBy ?? data.created_by ?? null);
        if (!reportTypeCode) {
            throw new FISServiceError('reportTypeCode is required', 400);
        }
        if (!reportTypeName) {
            throw new FISServiceError('reportTypeName is required', 400);
        }
        if (!/^[A-Z0-9_-]+$/.test(reportTypeCode)) {
            throw new FISServiceError('reportTypeCode may only contain letters, numbers, underscores, and hyphens', 400);
        }
        const existing = await executeQuery(`SELECT report_type_id
       FROM admin.fis_report_types
       WHERE UPPER(report_type_code) = @reportTypeCode`, { reportTypeCode });
        throwOnError(existing.error);
        if (existing.data?.length) {
            throw new FISServiceError('A report type with this code already exists', 409);
        }
        const result = await executeQuery(`INSERT INTO admin.fis_report_types (
         report_type_code, report_type_name, description, chart_id, created_by
       )
       OUTPUT INSERTED.report_type_id
       VALUES (@reportTypeCode, @reportTypeName, @description, @chartId, @createdBy)`, { reportTypeCode, reportTypeName, description, chartId, createdBy });
        throwOnError(result.error);
        if (!result.data?.[0]?.report_type_id) {
            throw new FISServiceError('Failed to create report type');
        }
        return result.data[0].report_type_id;
    }
    async updateReportType(reportTypeId, data) {
        const sets = [];
        const params = { reportTypeId };
        if (data.reportTypeName !== undefined || data.report_type_name !== undefined) {
            const reportTypeName = String(data.reportTypeName ?? data.report_type_name ?? '').trim();
            if (!reportTypeName) {
                throw new FISServiceError('reportTypeName cannot be empty', 400);
            }
            sets.push('report_type_name = @reportTypeName');
            params.reportTypeName = reportTypeName;
        }
        if (data.description !== undefined) {
            sets.push('description = @description');
            params.description = String(data.description ?? '').trim() || null;
        }
        if (data.chartId !== undefined || data.chart_id !== undefined) {
            sets.push('chart_id = @chartId');
            params.chartId = String(data.chartId ?? data.chart_id ?? '').trim() || null;
        }
        if (sets.length === 0) {
            throw new FISServiceError('No fields to update', 400);
        }
        const update = await executeQuery(`UPDATE admin.fis_report_types SET ${sets.join(', ')} WHERE report_type_id = @reportTypeId`, params);
        throwOnError(update.error);
        const result = await executeQuery(`SELECT report_type_id, report_type_code, report_type_name, description, chart_id, is_active, created_at, created_by
       FROM admin.fis_report_types
       WHERE report_type_id = @reportTypeId`, { reportTypeId });
        throwOnError(result.error);
        if (!result.data?.length) {
            throw new FISServiceError('Report type not found', 404);
        }
        const r = result.data[0];
        return {
            reportTypeId: r.report_type_id,
            reportTypeCode: r.report_type_code,
            reportTypeName: r.report_type_name,
            description: r.description,
            chartId: r.chart_id,
            isActive: r.is_active === true || r.is_active === 1,
            createdAt: r.created_at,
            createdBy: r.created_by,
        };
    }
    // ---------------------------------------------------------------------------
    // Rows
    // ---------------------------------------------------------------------------
    rowSelectSql = `SELECT rr.row_id, rr.report_type_id, rt.report_type_code,
              rr.line_item_code, rr.line_item_label, rr.display_order, rr.indent_level,
              rr.is_header, rr.is_total, rr.is_spacer, rr.is_title, rr.is_bold, rr.row_color, rr.font_color,
              rr.aggregation_type, rr.expression, rr.sign_convention, rr.format_type,
              rr.pct_numerator_code, rr.pct_denominator_code,
              rr.is_active, rr.notes, rr.created_at, rr.updated_at
       FROM admin.fis_report_rows rr
       INNER JOIN admin.fis_report_types rt ON rr.report_type_id = rt.report_type_id`;
    async getRowById(rowId) {
        const result = await executeQuery(`${this.rowSelectSql} WHERE rr.row_id = @rowId`, { rowId });
        throwOnError(result.error);
        if (!result.data?.[0])
            return null;
        return this.mapRow(result.data[0]);
    }
    async getRowsByReportType(reportTypeId) {
        const result = await executeQuery(`${this.rowSelectSql}
       WHERE rr.report_type_id = @reportTypeId AND rr.is_active = 1
       ORDER BY rr.display_order`, { reportTypeId });
        throwOnError(result.error);
        return (result.data || []).map((r) => this.mapRow(r));
    }
    async createRow(reportTypeId, data) {
        const lineItemCode = String(data.lineItemCode ?? data.line_item_code ?? '').trim();
        const lineItemLabel = String(data.lineItemLabel ?? data.line_item_label ?? '').trim();
        if (!lineItemCode || !lineItemLabel) {
            throw new FISServiceError('lineItemCode and lineItemLabel are required', 400);
        }
        const result = await executeQuery(`INSERT INTO admin.fis_report_rows (
         report_type_id, line_item_code, line_item_label, display_order, indent_level,
         is_header, is_total, is_spacer, is_title, aggregation_type, expression,
         sign_convention, format_type, pct_numerator_code, pct_denominator_code, is_bold, row_color, font_color, notes
       )
       OUTPUT INSERTED.row_id
       VALUES (
         @reportTypeId, @lineItemCode, @lineItemLabel, @displayOrder, @indentLevel,
         @isHeader, @isTotal, @isSpacer, @isTitle, @aggregationType, @expression,
         @signConvention, @formatType, @pctNumeratorCode, @pctDenominatorCode, @isBold, @rowColor, @fontColor, @notes
       )`, {
            reportTypeId,
            lineItemCode,
            lineItemLabel,
            displayOrder: toInt(data.displayOrder ?? data.display_order ?? 0, 'displayOrder'),
            indentLevel: toInt(data.indentLevel ?? data.indent_level ?? 0, 'indentLevel'),
            isHeader: toBit(data.isHeader ?? data.is_header),
            isTotal: toBit(data.isTotal ?? data.is_total),
            isSpacer: toBit(data.isSpacer ?? data.is_spacer),
            isTitle: toBit(data.isTitle ?? data.is_title),
            aggregationType: String(data.aggregationType ?? data.aggregation_type ?? 'SUM'),
            expression: data.expression != null ? String(data.expression) : null,
            signConvention: toInt(data.signConvention ?? data.sign_convention ?? 1, 'signConvention'),
            formatType: data.formatType != null ? String(data.formatType) : data.format_type != null ? String(data.format_type) : 'NUMBER',
            pctNumeratorCode: data.pctNumeratorCode != null
                ? String(data.pctNumeratorCode)
                : data.pct_numerator_code != null
                    ? String(data.pct_numerator_code)
                    : null,
            pctDenominatorCode: data.pctDenominatorCode != null
                ? String(data.pctDenominatorCode)
                : data.pct_denominator_code != null
                    ? String(data.pct_denominator_code)
                    : null,
            isBold: toBit(data.isBold ?? data.is_bold),
            rowColor: normalizeHexColor(data.rowColor ?? data.row_color),
            fontColor: normalizeHexColor(data.fontColor ?? data.font_color),
            notes: data.notes != null ? String(data.notes) : null,
        });
        throwOnError(result.error);
        if (!result.data?.[0]?.row_id)
            throw new FISServiceError('Failed to create row');
        return result.data[0].row_id;
    }
    async updateRow(rowId, data) {
        const sets = [];
        const params = { rowId };
        const fields = [
            { key: 'lineItemCode', snake: 'line_item_code' },
            { key: 'lineItemLabel', snake: 'line_item_label' },
            { key: 'displayOrder', snake: 'display_order', transform: (v) => toInt(v, 'displayOrder') },
            { key: 'indentLevel', snake: 'indent_level', transform: (v) => toInt(v, 'indentLevel') },
            { key: 'isHeader', snake: 'is_header', transform: (v) => toBit(v) },
            { key: 'isTotal', snake: 'is_total', transform: (v) => toBit(v) },
            { key: 'isSpacer', snake: 'is_spacer', transform: (v) => toBit(v) },
            { key: 'isTitle', snake: 'is_title', transform: (v) => toBit(v) },
            { key: 'isBold', snake: 'is_bold', transform: (v) => toBit(v) },
            { key: 'rowColor', snake: 'row_color', transform: (v) => normalizeHexColor(v) },
            { key: 'fontColor', snake: 'font_color', transform: (v) => normalizeHexColor(v) },
            { key: 'aggregationType', snake: 'aggregation_type' },
            { key: 'expression', snake: 'expression' },
            { key: 'signConvention', snake: 'sign_convention', transform: (v) => toInt(v, 'signConvention') },
            { key: 'formatType', snake: 'format_type' },
            { key: 'pctNumeratorCode', snake: 'pct_numerator_code' },
            { key: 'pctDenominatorCode', snake: 'pct_denominator_code' },
            { key: 'notes', snake: 'notes' },
            { key: 'isActive', snake: 'is_active', transform: (v) => toBit(v) },
        ];
        for (const f of fields) {
            const val = pickField(data, f.key, f.snake);
            if (val !== undefined) {
                const param = f.key;
                sets.push(`${f.snake} = @${param}`);
                const transformed = f.transform ? f.transform(val) : val;
                params[param] = transformed === '' && (f.key === 'pctNumeratorCode' || f.key === 'pctDenominatorCode')
                    ? null
                    : transformed;
            }
        }
        if (sets.length === 0) {
            throw new FISServiceError('No fields to update', 400);
        }
        sets.push('updated_at = GETDATE()');
        const result = await executeQuery(`UPDATE admin.fis_report_rows SET ${sets.join(', ')} WHERE row_id = @rowId`, params);
        throwOnError(result.error);
        const row = await this.getRowById(rowId);
        if (!row) {
            throw new FISServiceError(`Row ${rowId} not found after update`, 404);
        }
        return row;
    }
    async softDeleteRow(rowId) {
        const result = await executeQuery(`UPDATE admin.fis_report_rows SET is_active = 0, updated_at = GETDATE() WHERE row_id = @rowId`, { rowId });
        throwOnError(result.error);
    }
    async reorderRows(updates) {
        if (!updates.length)
            return;
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        await transaction.begin();
        try {
            // Phase 1: temporary negative orders avoid UQ (report_type_id, display_order) conflicts
            for (const u of updates) {
                const request = new sql.Request(transaction);
                request.input('rowId', sql.Int, u.rowId);
                await request.query(`UPDATE admin.fis_report_rows
           SET display_order = -row_id, updated_at = GETDATE()
           WHERE row_id = @rowId AND is_active = 1`);
            }
            // Phase 2: apply final display_order values
            for (const u of updates) {
                const request = new sql.Request(transaction);
                request.input('rowId', sql.Int, u.rowId);
                request.input('displayOrder', sql.Int, u.displayOrder);
                await request.query(`UPDATE admin.fis_report_rows
           SET display_order = @displayOrder, updated_at = GETDATE()
           WHERE row_id = @rowId AND is_active = 1`);
            }
            await transaction.commit();
        }
        catch (err) {
            await transaction.rollback();
            const message = err instanceof Error ? err.message : 'Failed to reorder rows';
            throw new FISServiceError(message);
        }
    }
    // ---------------------------------------------------------------------------
    // Column definitions (Phase 3)
    // ---------------------------------------------------------------------------
    static CALCULATED_COLUMN_KINDS = new Set([
        'YTD_VARIANCE',
        'YTD_VAR_PCT',
        'CM_VARIANCE',
        'CM_VAR_PCT',
        'PERF_PCT',
        'AUDITED_PLACEHOLDER',
    ]);
    columnDefSelectSql = `SELECT cd.column_def_id, cd.report_type_id, rt.report_type_code,
              cd.column_code, cd.column_label, cd.display_order, cd.column_kind, cd.period_scope,
              cd.tb_type, cd.reference_month, cd.fiscal_year_offset, cd.source_column_codes,
              cd.format_type, cd.is_active, cd.notes, cd.created_at, cd.updated_at
       FROM admin.fis_report_column_defs cd
       INNER JOIN admin.fis_report_types rt ON cd.report_type_id = rt.report_type_id`;
    mapColumnDef(r) {
        return {
            columnDefId: r.column_def_id,
            reportTypeId: r.report_type_id,
            reportTypeCode: r.report_type_code,
            columnCode: r.column_code,
            columnLabel: r.column_label,
            displayOrder: r.display_order,
            columnKind: r.column_kind,
            periodScope: r.period_scope,
            tbType: r.tb_type,
            referenceMonth: r.reference_month,
            fiscalYearOffset: r.fiscal_year_offset,
            sourceColumnCodes: r.source_column_codes,
            formatType: r.format_type,
            isActive: r.is_active === true || r.is_active === 1,
            notes: r.notes,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
    async assertColumnDefDependencies(reportTypeId, columnCode) {
        const result = await executeQuery(`SELECT column_code
       FROM admin.fis_report_column_defs
       WHERE report_type_id = @reportTypeId
         AND is_active = 1
         AND source_column_codes IS NOT NULL
         AND (
           source_column_codes = @columnCode
           OR source_column_codes LIKE @columnCodePrefix
           OR source_column_codes LIKE @columnCodeMiddle
           OR source_column_codes LIKE @columnCodeSuffix
         )`, {
            reportTypeId,
            columnCode,
            columnCodePrefix: `${columnCode},%`,
            columnCodeMiddle: `%,${columnCode},%`,
            columnCodeSuffix: `%,${columnCode}`,
        });
        throwOnError(result.error);
        if (result.data?.length) {
            const dependents = result.data.map((r) => r.column_code).join(', ');
            throw new FISServiceError(`Cannot deactivate column ${columnCode}: required by calculated column(s): ${dependents}`, 409);
        }
    }
    resolveColumnDefPeriods(def, asOfPeriod) {
        const period = asOfPeriod.trim();
        const reportYear = parseInt(period.slice(0, 4), 10);
        const reportMonth = parseInt(period.slice(4, 6), 10);
        const fiscalYear = reportYear + (def.fiscalYearOffset ?? 0);
        let fiscalMonthFrom = 1;
        let fiscalMonthTo = reportMonth;
        switch (def.periodScope) {
            case 'YTD':
                fiscalMonthFrom = 1;
                fiscalMonthTo = reportMonth;
                break;
            case 'CM':
                fiscalMonthFrom = reportMonth;
                fiscalMonthTo = reportMonth;
                break;
            case 'MONTH':
                fiscalMonthFrom = def.referenceMonth ?? 1;
                fiscalMonthTo = def.referenceMonth ?? 1;
                break;
            case 'APPROVED':
                fiscalMonthFrom = 1;
                fiscalMonthTo = 1;
                break;
            case 'PY':
                fiscalMonthFrom = def.referenceMonth ?? 12;
                fiscalMonthTo = def.referenceMonth ?? 12;
                break;
            default:
                fiscalMonthFrom = 1;
                fiscalMonthTo = reportMonth;
        }
        const isYtd = def.periodScope === 'YTD';
        const periodFrom = String(fiscalYear * 100 + fiscalMonthFrom);
        const periodTo = String(fiscalYear * 100 + fiscalMonthTo);
        const calculated = FISService.CALCULATED_COLUMN_KINDS.has(def.columnKind);
        const skipTbQuery = calculated ||
            (def.columnKind === 'POINT_IN_TIME' &&
                def.periodScope === 'MONTH' &&
                (def.referenceMonth ?? 0) > reportMonth);
        return {
            fiscalYear,
            fiscalMonthFrom,
            fiscalMonthTo,
            isYtd,
            periodFrom,
            periodTo,
            skipTbQuery,
            effectiveTbType: def.columnKind === 'APPROVED_BUDGET' ? 'BUDGET' : def.tbType,
        };
    }
    async getColumnDefsByReportType(reportTypeId, activeOnly = false) {
        const result = await executeQuery(`${this.columnDefSelectSql}
       WHERE cd.report_type_id = @reportTypeId
         ${activeOnly ? 'AND cd.is_active = 1' : ''}
       ORDER BY cd.display_order`, { reportTypeId });
        throwOnError(result.error);
        return (result.data || []).map((r) => this.mapColumnDef(r));
    }
    async getColumnDefPreview(reportTypeId, asOfPeriod) {
        const period = asOfPeriod.trim();
        if (!/^\d{6}$/.test(period)) {
            throw new FISServiceError('asOfPeriod must be YYYYMM', 400);
        }
        const defs = await this.getColumnDefsByReportType(reportTypeId, true);
        return defs.map((def) => ({
            ...def,
            resolution: this.resolveColumnDefPeriods(def, period),
        }));
    }
    async createColumnDef(reportTypeId, data) {
        const columnCode = String(data.columnCode ?? data.column_code ?? '')
            .trim()
            .toUpperCase();
        const columnLabel = String(data.columnLabel ?? data.column_label ?? '').trim();
        const columnKind = String(data.columnKind ?? data.column_kind ?? 'TB_SUM')
            .trim()
            .toUpperCase();
        const periodScope = String(data.periodScope ?? data.period_scope ?? 'YTD')
            .trim()
            .toUpperCase();
        if (!columnCode || !columnLabel) {
            throw new FISServiceError('columnCode and columnLabel are required', 400);
        }
        if (!/^[A-Z0-9_]+$/.test(columnCode)) {
            throw new FISServiceError('columnCode may only contain letters, numbers, and underscores', 400);
        }
        const maxOrder = await executeQuery(`SELECT MAX(display_order) AS max_order
       FROM admin.fis_report_column_defs
       WHERE report_type_id = @reportTypeId`, { reportTypeId });
        throwOnError(maxOrder.error);
        const displayOrder = data.displayOrder !== undefined || data.display_order !== undefined
            ? toInt(data.displayOrder ?? data.display_order, 'displayOrder')
            : (Number(maxOrder.data?.[0]?.max_order) || 0) + 1;
        const tbTypeRaw = data.tbType ?? data.tb_type;
        const tbType = tbTypeRaw != null && String(tbTypeRaw).trim() !== ''
            ? String(tbTypeRaw).trim().toUpperCase()
            : null;
        const result = await executeQuery(`INSERT INTO admin.fis_report_column_defs (
         report_type_id, column_code, column_label, display_order,
         column_kind, period_scope, tb_type, reference_month, fiscal_year_offset,
         source_column_codes, format_type, notes
       )
       OUTPUT INSERTED.column_def_id
       VALUES (
         @reportTypeId, @columnCode, @columnLabel, @displayOrder,
         @columnKind, @periodScope, @tbType, @referenceMonth, @fiscalYearOffset,
         @sourceColumnCodes, @formatType, @notes
       )`, {
            reportTypeId,
            columnCode,
            columnLabel,
            displayOrder,
            columnKind,
            periodScope,
            tbType,
            referenceMonth: data.referenceMonth != null
                ? toInt(data.referenceMonth, 'referenceMonth')
                : data.reference_month != null
                    ? toInt(data.reference_month, 'referenceMonth')
                    : null,
            fiscalYearOffset: toInt(data.fiscalYearOffset ?? data.fiscal_year_offset ?? 0, 'fiscalYearOffset'),
            sourceColumnCodes: data.sourceColumnCodes != null
                ? String(data.sourceColumnCodes)
                : data.source_column_codes != null
                    ? String(data.source_column_codes)
                    : null,
            formatType: String(data.formatType ?? data.format_type ?? 'NUMBER'),
            notes: data.notes != null ? String(data.notes) : null,
        });
        throwOnError(result.error);
        if (!result.data?.[0]?.column_def_id) {
            throw new FISServiceError('Failed to create column definition');
        }
        return result.data[0].column_def_id;
    }
    async updateColumnDef(columnDefId, data) {
        const existing = await executeQuery(`SELECT column_def_id, report_type_id, column_code, column_kind
       FROM admin.fis_report_column_defs
       WHERE column_def_id = @columnDefId`, { columnDefId });
        throwOnError(existing.error);
        if (!existing.data?.length) {
            throw new FISServiceError('Column definition not found', 404);
        }
        const current = existing.data[0];
        const isCalculated = FISService.CALCULATED_COLUMN_KINDS.has(current.column_kind);
        if (data.isActive === false || data.is_active === 0 || data.is_active === false) {
            await this.assertColumnDefDependencies(current.report_type_id, current.column_code);
        }
        const sets = [];
        const params = { columnDefId };
        const editableFields = [
            { key: 'columnLabel', snake: 'column_label' },
            { key: 'notes', snake: 'notes' },
            { key: 'formatType', snake: 'format_type' },
            { key: 'isActive', snake: 'is_active', transform: (v) => toBit(v) },
        ];
        if (!isCalculated) {
            editableFields.push({ key: 'columnKind', snake: 'column_kind', transform: (v) => String(v).trim().toUpperCase() }, { key: 'periodScope', snake: 'period_scope', transform: (v) => String(v).trim().toUpperCase() }, { key: 'tbType', snake: 'tb_type', transform: (v) => (v == null || v === '' ? null : String(v).trim().toUpperCase()) }, {
                key: 'referenceMonth',
                snake: 'reference_month',
                transform: (v) => (v == null || v === '' ? null : toInt(v, 'referenceMonth')),
            }, { key: 'fiscalYearOffset', snake: 'fiscal_year_offset', transform: (v) => toInt(v, 'fiscalYearOffset') }, { key: 'sourceColumnCodes', snake: 'source_column_codes' });
        }
        for (const f of editableFields) {
            const val = pickField(data, f.key, f.snake);
            if (val !== undefined) {
                sets.push(`${f.snake} = @${f.key}`);
                params[f.key] = f.transform ? f.transform(val) : val === '' ? null : val;
            }
        }
        if (sets.length === 0) {
            throw new FISServiceError('No fields to update', 400);
        }
        sets.push('updated_at = GETDATE()');
        const update = await executeQuery(`UPDATE admin.fis_report_column_defs SET ${sets.join(', ')} WHERE column_def_id = @columnDefId`, params);
        throwOnError(update.error);
        const result = await executeQuery(`${this.columnDefSelectSql} WHERE cd.column_def_id = @columnDefId`, { columnDefId });
        throwOnError(result.error);
        if (!result.data?.length) {
            throw new FISServiceError('Column definition not found after update', 404);
        }
        return this.mapColumnDef(result.data[0]);
    }
    async softDeleteColumnDef(columnDefId) {
        const existing = await executeQuery(`SELECT report_type_id, column_code FROM admin.fis_report_column_defs WHERE column_def_id = @columnDefId`, { columnDefId });
        throwOnError(existing.error);
        if (!existing.data?.length) {
            throw new FISServiceError('Column definition not found', 404);
        }
        await this.assertColumnDefDependencies(existing.data[0].report_type_id, existing.data[0].column_code);
        const result = await executeQuery(`UPDATE admin.fis_report_column_defs SET is_active = 0, updated_at = GETDATE() WHERE column_def_id = @columnDefId`, { columnDefId });
        throwOnError(result.error);
    }
    async reorderColumnDefs(updates) {
        if (!updates.length)
            return;
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        await transaction.begin();
        try {
            for (const u of updates) {
                const request = new sql.Request(transaction);
                request.input('columnDefId', sql.Int, u.columnDefId);
                await request.query(`UPDATE admin.fis_report_column_defs
           SET display_order = -column_def_id, updated_at = GETDATE()
           WHERE column_def_id = @columnDefId AND is_active = 1`);
            }
            for (const u of updates) {
                const request = new sql.Request(transaction);
                request.input('columnDefId', sql.Int, u.columnDefId);
                request.input('displayOrder', sql.Int, u.displayOrder);
                await request.query(`UPDATE admin.fis_report_column_defs
           SET display_order = @displayOrder, updated_at = GETDATE()
           WHERE column_def_id = @columnDefId AND is_active = 1`);
            }
            await transaction.commit();
        }
        catch (err) {
            await transaction.rollback();
            const message = err instanceof Error ? err.message : 'Failed to reorder column definitions';
            throw new FISServiceError(message);
        }
    }
    // ---------------------------------------------------------------------------
    // Filter rules and criteria
    // ---------------------------------------------------------------------------
    async getRulesForRow(rowId) {
        const rulesResult = await executeQuery(`SELECT rule_id, row_id, rule_order, rule_label, tb_type_filter, amount_source,
              sign_override, is_active, notes, created_at, updated_at
       FROM admin.fis_row_filter_rules
       WHERE row_id = @rowId AND is_active = 1
       ORDER BY rule_order`, { rowId });
        throwOnError(rulesResult.error);
        const criteriaResult = await executeQuery(`SELECT rc.criterion_id, rc.rule_id, rc.dimension, rc.filter_type,
              rc.value_single, rc.value_list, rc.value_range_from, rc.value_range_to, rc.is_active
       FROM admin.fis_rule_criteria rc
       INNER JOIN admin.fis_row_filter_rules rfr ON rc.rule_id = rfr.rule_id
       WHERE rfr.row_id = @rowId AND rfr.is_active = 1 AND rc.is_active = 1
       ORDER BY rc.rule_id, rc.criterion_id`, { rowId });
        throwOnError(criteriaResult.error);
        const criteriaByRule = new Map();
        for (const c of criteriaResult.data || []) {
            const list = criteriaByRule.get(c.rule_id) || [];
            list.push({
                criterionId: c.criterion_id,
                ruleId: c.rule_id,
                dimension: c.dimension,
                filterType: c.filter_type,
                valueSingle: c.value_single,
                valueList: c.value_list,
                valueRangeFrom: c.value_range_from,
                valueRangeTo: c.value_range_to,
                isActive: c.is_active === true || c.is_active === 1,
            });
            criteriaByRule.set(c.rule_id, list);
        }
        return (rulesResult.data || []).map((r) => ({
            ruleId: r.rule_id,
            rowId: r.row_id,
            ruleOrder: r.rule_order,
            ruleLabel: r.rule_label,
            tbTypeFilter: r.tb_type_filter,
            amountSource: r.amount_source,
            signOverride: r.sign_override,
            isActive: r.is_active === true || r.is_active === 1,
            notes: r.notes,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            criteria: criteriaByRule.get(r.rule_id) || [],
        }));
    }
    async createRule(rowId, data) {
        const criteria = data.criteria || [];
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        await transaction.begin();
        try {
            const insertRule = new sql.Request(transaction);
            insertRule.input('rowId', sql.Int, rowId);
            insertRule.input('ruleOrder', sql.Int, toInt(data.ruleOrder ?? data.rule_order ?? 1, 'ruleOrder'));
            insertRule.input('ruleLabel', sql.NVarChar(255), data.ruleLabel ?? data.rule_label ?? null);
            insertRule.input('tbTypeFilter', sql.NVarChar(20), data.tbTypeFilter ?? data.tb_type_filter ?? null);
            insertRule.input('amountSource', sql.NVarChar(20), String(data.amountSource ?? data.amount_source ?? 'net'));
            insertRule.input('signOverride', sql.Int, data.signOverride != null ? toInt(data.signOverride, 'signOverride') : data.sign_override != null ? toInt(data.sign_override, 'signOverride') : null);
            insertRule.input('notes', sql.NVarChar(500), data.notes ?? null);
            const ruleResult = await insertRule.query(`INSERT INTO admin.fis_row_filter_rules (
           row_id, rule_order, rule_label, tb_type_filter, amount_source, sign_override, notes
         )
         OUTPUT INSERTED.rule_id
         VALUES (@rowId, @ruleOrder, @ruleLabel, @tbTypeFilter, @amountSource, @signOverride, @notes)`);
            const ruleId = ruleResult.recordset?.[0]?.rule_id;
            if (!ruleId)
                throw new FISServiceError('Failed to create rule');
            for (const c of criteria) {
                const parsed = criterionFromInput(c);
                const req = new sql.Request(transaction);
                req.input('ruleId', sql.Int, ruleId);
                req.input('dimension', sql.NVarChar(30), parsed.dimension);
                req.input('filterType', sql.NVarChar(20), parsed.filterType);
                req.input('valueSingle', sql.NVarChar(200), parsed.valueSingle);
                req.input('valueList', sql.NVarChar(2000), parsed.valueList);
                req.input('valueRangeFrom', sql.NVarChar(200), parsed.valueRangeFrom);
                req.input('valueRangeTo', sql.NVarChar(200), parsed.valueRangeTo);
                await req.query(`INSERT INTO admin.fis_rule_criteria (
             rule_id, dimension, filter_type, value_single, value_list, value_range_from, value_range_to
           ) VALUES (@ruleId, @dimension, @filterType, @valueSingle, @valueList, @valueRangeFrom, @valueRangeTo)`);
            }
            await transaction.commit();
            return ruleId;
        }
        catch (err) {
            await transaction.rollback();
            if (err instanceof FISServiceError)
                throw err;
            throw new FISServiceError(err instanceof Error ? err.message : 'Failed to create rule');
        }
    }
    async updateRule(ruleId, data) {
        const sets = [];
        const params = { ruleId };
        const fields = [
            { key: 'ruleOrder', snake: 'rule_order', transform: (v) => toInt(v, 'ruleOrder') },
            { key: 'ruleLabel', snake: 'rule_label' },
            { key: 'tbTypeFilter', snake: 'tb_type_filter' },
            { key: 'amountSource', snake: 'amount_source' },
            { key: 'signOverride', snake: 'sign_override', transform: (v) => (v == null ? null : toInt(v, 'signOverride')) },
            { key: 'notes', snake: 'notes' },
            { key: 'isActive', snake: 'is_active', transform: (v) => toBit(v) },
        ];
        for (const f of fields) {
            const val = data[f.key] ?? data[f.snake];
            if (val !== undefined) {
                sets.push(`${f.snake} = @${f.key}`);
                params[f.key] = f.transform ? f.transform(val) : val;
            }
        }
        if (sets.length === 0) {
            throw new FISServiceError('No fields to update', 400);
        }
        sets.push('updated_at = GETDATE()');
        const result = await executeQuery(`UPDATE admin.fis_row_filter_rules SET ${sets.join(', ')} WHERE rule_id = @ruleId`, params);
        throwOnError(result.error);
    }
    async softDeleteRule(ruleId) {
        const result = await executeQuery(`UPDATE admin.fis_row_filter_rules SET is_active = 0, updated_at = GETDATE() WHERE rule_id = @ruleId`, { ruleId });
        throwOnError(result.error);
    }
    async replaceRuleCriteria(ruleId, criteria) {
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        await transaction.begin();
        try {
            const delReq = new sql.Request(transaction);
            delReq.input('ruleId', sql.Int, ruleId);
            await delReq.query(`DELETE FROM admin.fis_rule_criteria WHERE rule_id = @ruleId`);
            for (const c of criteria) {
                const parsed = criterionFromInput(c);
                const req = new sql.Request(transaction);
                req.input('ruleId', sql.Int, ruleId);
                req.input('dimension', sql.NVarChar(30), parsed.dimension);
                req.input('filterType', sql.NVarChar(20), parsed.filterType);
                req.input('valueSingle', sql.NVarChar(200), parsed.valueSingle);
                req.input('valueList', sql.NVarChar(2000), parsed.valueList);
                req.input('valueRangeFrom', sql.NVarChar(200), parsed.valueRangeFrom);
                req.input('valueRangeTo', sql.NVarChar(200), parsed.valueRangeTo);
                await req.query(`INSERT INTO admin.fis_rule_criteria (
             rule_id, dimension, filter_type, value_single, value_list, value_range_from, value_range_to
           ) VALUES (@ruleId, @dimension, @filterType, @valueSingle, @valueList, @valueRangeFrom, @valueRangeTo)`);
            }
            const touch = new sql.Request(transaction);
            touch.input('ruleId', sql.Int, ruleId);
            await touch.query(`UPDATE admin.fis_row_filter_rules SET updated_at = GETDATE() WHERE rule_id = @ruleId`);
            await transaction.commit();
        }
        catch (err) {
            await transaction.rollback();
            throw new FISServiceError(err instanceof Error ? err.message : 'Failed to replace criteria');
        }
    }
    // ---------------------------------------------------------------------------
    // Instances
    // ---------------------------------------------------------------------------
    async getInstances() {
        const result = await executeQuery(`SELECT i.instance_id, i.report_type_id, i.instance_name, i.country_scope, i.base_currency,
              i.is_active, i.created_at, i.created_by,
              (
                SELECT STRING_AGG(ic.entity_code, ', ') WITHIN GROUP (ORDER BY ic.entity_code)
                FROM admin.fis_instance_countries ic
                WHERE ic.instance_id = i.instance_id
              ) AS entity_codes,
              (
                SELECT COUNT(*) FROM admin.fis_report_columns c WHERE c.instance_id = i.instance_id
              ) AS column_count
       FROM admin.fis_report_instances i
       WHERE i.is_active = 1
       ORDER BY i.instance_name`);
        throwOnError(result.error);
        return (result.data || []).map((r) => ({
            instanceId: r.instance_id,
            reportTypeId: r.report_type_id,
            instanceName: r.instance_name,
            countryScope: r.country_scope,
            baseCurrency: r.base_currency,
            isActive: r.is_active === true || r.is_active === 1,
            createdAt: r.created_at,
            createdBy: r.created_by,
            entityCodes: r.entity_codes || '',
            columnCount: Number(r.column_count) || 0,
        }));
    }
    async getInstance(instanceId) {
        const instResult = await executeQuery(`SELECT instance_id, report_type_id, instance_name, country_scope, base_currency,
              is_active, created_at, created_by
       FROM admin.fis_report_instances
       WHERE instance_id = @instanceId AND is_active = 1`, { instanceId });
        throwOnError(instResult.error);
        if (!instResult.data?.length) {
            throw new FISServiceError('Report instance not found', 404);
        }
        const inst = instResult.data[0];
        const countriesResult = await executeQuery(`SELECT entity_code FROM admin.fis_instance_countries WHERE instance_id = @instanceId ORDER BY entity_code`, { instanceId });
        throwOnError(countriesResult.error);
        const columnsResult = await executeQuery(`SELECT column_id, instance_id, column_order, column_label,
              fiscal_year, fiscal_month_from, fiscal_month_to, is_ytd,
              tb_type, ISNULL(column_kind, 'TB_SUM') AS column_kind
       FROM admin.fis_report_columns
       WHERE instance_id = @instanceId
       ORDER BY column_order`, { instanceId });
        throwOnError(columnsResult.error);
        return {
            instanceId: inst.instance_id,
            reportTypeId: inst.report_type_id,
            instanceName: inst.instance_name,
            countryScope: inst.country_scope,
            baseCurrency: inst.base_currency,
            isActive: inst.is_active === true || inst.is_active === 1,
            createdAt: inst.created_at,
            createdBy: inst.created_by,
            entityCodes: (countriesResult.data || []).map((c) => c.entity_code),
            columns: (columnsResult.data || []).map((c) => ({
                columnId: c.column_id,
                instanceId: c.instance_id,
                columnOrder: c.column_order,
                columnLabel: c.column_label,
                fiscalYear: c.fiscal_year,
                fiscalMonthFrom: c.fiscal_month_from,
                fiscalMonthTo: c.fiscal_month_to,
                isYtd: c.is_ytd === true || c.is_ytd === 1,
                tbType: c.tb_type,
                columnKind: (c.column_kind || 'TB_SUM'),
            })),
        };
    }
    async insertReportColumn(transaction, instanceId, col) {
        const parsed = columnFromInput(col);
        const req = new sql.Request(transaction);
        req.input('instanceId', sql.Int, instanceId);
        req.input('columnOrder', sql.Int, parsed.columnOrder);
        req.input('columnLabel', sql.NVarChar(100), parsed.columnLabel);
        req.input('fiscalYear', sql.Int, parsed.fiscalYear);
        req.input('fiscalMonthFrom', sql.Int, parsed.fiscalMonthFrom);
        req.input('fiscalMonthTo', sql.Int, parsed.fiscalMonthTo);
        req.input('isYtd', sql.Bit, parsed.isYtd);
        req.input('tbType', sql.NVarChar(20), parsed.tbType);
        req.input('columnKind', sql.NVarChar(20), parsed.columnKind);
        await req.query(`INSERT INTO admin.fis_report_columns (
         instance_id, column_order, column_label, fiscal_year,
         fiscal_month_from, fiscal_month_to, is_ytd, tb_type, column_kind
       ) VALUES (
         @instanceId, @columnOrder, @columnLabel, @fiscalYear,
         @fiscalMonthFrom, @fiscalMonthTo, @isYtd, @tbType, @columnKind
       )`);
    }
    /**
     * Normalize column_order: Budget before Actual within each month block.
     * Runs after inserts and before generate so upload/file order never affects display.
     */
    async reorderInstanceColumns(instanceId) {
        const result = await executeQuery(`SELECT column_id, fiscal_year, fiscal_month_to, is_ytd, tb_type,
              ISNULL(column_kind, 'TB_SUM') AS column_kind, column_label
       FROM admin.fis_report_columns
       WHERE instance_id = @instanceId`, { instanceId });
        throwOnError(result.error);
        const rows = result.data || [];
        if (rows.length <= 1)
            return;
        const toSortInput = (row) => ({
            fiscalYear: row.fiscal_year,
            fiscalMonthTo: row.fiscal_month_to,
            isYtd: row.is_ytd === true || row.is_ytd === 1,
            tbType: row.tb_type,
            columnKind: (row.column_kind || 'TB_SUM'),
            columnLabel: row.column_label,
        });
        const sorted = [...rows].sort((a, b) => compareFisReportColumns(toSortInput(a), toSortInput(b)));
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        await transaction.begin();
        try {
            const resetReq = new sql.Request(transaction);
            resetReq.input('instanceId', sql.Int, instanceId);
            await resetReq.query(`UPDATE admin.fis_report_columns
         SET column_order = -column_id
         WHERE instance_id = @instanceId`);
            let order = 1;
            for (const row of sorted) {
                const req = new sql.Request(transaction);
                req.input('columnId', sql.Int, row.column_id);
                req.input('columnOrder', sql.Int, order++);
                await req.query(`UPDATE admin.fis_report_columns SET column_order = @columnOrder WHERE column_id = @columnId`);
            }
            await transaction.commit();
        }
        catch (err) {
            await transaction.rollback();
            if (err instanceof FISServiceError)
                throw err;
            throw new FISServiceError(err instanceof Error ? err.message : 'Failed to reorder report columns');
        }
    }
    /** Append six month columns if this period is not already on the instance. */
    async appendMonthColumnsForPeriod(instanceId, period) {
        const periodNorm = period.trim();
        const fiscalYear = parseInt(periodNorm.slice(0, 4), 10);
        const fiscalMonth = parseInt(periodNorm.slice(4, 6), 10);
        const existing = await executeQuery(`SELECT COUNT(*) AS cnt
       FROM admin.fis_report_columns
       WHERE instance_id = @instanceId
         AND fiscal_year = @fiscalYear
         AND fiscal_month_from = @fiscalMonth
         AND fiscal_month_to = @fiscalMonth
         AND is_ytd = 0
         AND tb_type = 'ACTUAL'
         AND ISNULL(column_kind, 'TB_SUM') = 'TB_SUM'`, { instanceId, fiscalYear, fiscalMonth });
        throwOnError(existing.error);
        if (existing.data?.[0]?.cnt) {
            return 0;
        }
        const maxOrderResult = await executeQuery(`SELECT MAX(column_order) AS max_order FROM admin.fis_report_columns WHERE instance_id = @instanceId`, { instanceId });
        throwOnError(maxOrderResult.error);
        const startOrder = (Number(maxOrderResult.data?.[0]?.max_order) || 0) + 1;
        const columns = buildMonthColumnSet(periodNorm, startOrder);
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        await transaction.begin();
        try {
            for (const col of columns) {
                await this.insertReportColumn(transaction, instanceId, col);
            }
            await transaction.commit();
            await this.reorderInstanceColumns(instanceId);
            return columns.length;
        }
        catch (err) {
            await transaction.rollback();
            if (err instanceof FISServiceError)
                throw err;
            throw new FISServiceError(err instanceof Error ? err.message : 'Failed to append report columns');
        }
    }
    async ensureInstanceEntity(instanceId, entityCode) {
        const entity = entityCode.trim().toUpperCase();
        const result = await executeQuery(`IF NOT EXISTS (
         SELECT 1 FROM admin.fis_instance_countries
         WHERE instance_id = @instanceId AND entity_code = @entity
       )
       INSERT INTO admin.fis_instance_countries (instance_id, entity_code)
       VALUES (@instanceId, @entity)`, { instanceId, entity });
        throwOnError(result.error);
    }
    async createInstance(data) {
        const entityCodes = (data.entityCodes ?? data.entity_codes);
        const columns = data.columns || [];
        if (!data.instanceName && !data.instance_name) {
            throw new FISServiceError('instanceName is required', 400);
        }
        if (!data.reportTypeId && !data.report_type_id) {
            throw new FISServiceError('reportTypeId is required', 400);
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        await transaction.begin();
        try {
            const insReq = new sql.Request(transaction);
            insReq.input('reportTypeId', sql.Int, toInt(data.reportTypeId ?? data.report_type_id, 'reportTypeId'));
            insReq.input('instanceName', sql.NVarChar(255), String(data.instanceName ?? data.instance_name));
            insReq.input('countryScope', sql.NVarChar(20), String(data.countryScope ?? data.country_scope ?? 'SINGLE'));
            insReq.input('baseCurrency', sql.NVarChar(10), data.baseCurrency ?? data.base_currency ?? null);
            insReq.input('createdBy', sql.NVarChar(255), data.createdBy ?? data.created_by ?? null);
            const instResult = await insReq.query(`INSERT INTO admin.fis_report_instances (
           report_type_id, instance_name, country_scope, base_currency, created_by
         )
         OUTPUT INSERTED.instance_id
         VALUES (@reportTypeId, @instanceName, @countryScope, @baseCurrency, @createdBy)`);
            const instanceId = instResult.recordset?.[0]?.instance_id;
            if (!instanceId)
                throw new FISServiceError('Failed to create instance');
            for (const code of entityCodes || []) {
                const req = new sql.Request(transaction);
                req.input('instanceId', sql.Int, instanceId);
                req.input('entityCode', sql.NVarChar(4), String(code).trim());
                await req.query(`INSERT INTO admin.fis_instance_countries (instance_id, entity_code) VALUES (@instanceId, @entityCode)`);
            }
            for (const col of columns) {
                await this.insertReportColumn(transaction, instanceId, col);
            }
            await transaction.commit();
            if (columns.length > 0) {
                await this.reorderInstanceColumns(instanceId);
            }
            return instanceId;
        }
        catch (err) {
            await transaction.rollback();
            if (err instanceof FISServiceError)
                throw err;
            throw new FISServiceError(err instanceof Error ? err.message : 'Failed to create instance');
        }
    }
    async updateInstance(instanceId, data) {
        const entityCodes = data.entityCodes ?? data.entity_codes;
        const columns = data.columns;
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        await transaction.begin();
        try {
            const sets = [];
            const params = { instanceId };
            if (data.instanceName !== undefined || data.instance_name !== undefined) {
                sets.push('instance_name = @instanceName');
                params.instanceName = String(data.instanceName ?? data.instance_name);
            }
            if (data.countryScope !== undefined || data.country_scope !== undefined) {
                sets.push('country_scope = @countryScope');
                params.countryScope = String(data.countryScope ?? data.country_scope);
            }
            if (data.baseCurrency !== undefined || data.base_currency !== undefined) {
                sets.push('base_currency = @baseCurrency');
                params.baseCurrency = data.baseCurrency ?? data.base_currency;
            }
            if (data.reportTypeId !== undefined || data.report_type_id !== undefined) {
                sets.push('report_type_id = @reportTypeId');
                params.reportTypeId = toInt(data.reportTypeId ?? data.report_type_id, 'reportTypeId');
            }
            if (sets.length > 0) {
                const updReq = new sql.Request(transaction);
                Object.entries(params).forEach(([k, v]) => {
                    if (k === 'instanceId')
                        updReq.input(k, sql.Int, v);
                    else if (typeof v === 'number')
                        updReq.input(k, sql.Int, v);
                    else
                        updReq.input(k, sql.NVarChar(sql.MAX), v);
                });
                await updReq.query(`UPDATE admin.fis_report_instances SET ${sets.join(', ')} WHERE instance_id = @instanceId AND is_active = 1`);
            }
            if (entityCodes !== undefined) {
                const delC = new sql.Request(transaction);
                delC.input('instanceId', sql.Int, instanceId);
                await delC.query(`DELETE FROM admin.fis_instance_countries WHERE instance_id = @instanceId`);
                for (const code of entityCodes) {
                    const req = new sql.Request(transaction);
                    req.input('instanceId', sql.Int, instanceId);
                    req.input('entityCode', sql.NVarChar(4), String(code).trim());
                    await req.query(`INSERT INTO admin.fis_instance_countries (instance_id, entity_code) VALUES (@instanceId, @entityCode)`);
                }
            }
            if (columns !== undefined) {
                const delCol = new sql.Request(transaction);
                delCol.input('instanceId', sql.Int, instanceId);
                await delCol.query(`DELETE FROM admin.fis_report_columns WHERE instance_id = @instanceId`);
                for (const col of columns) {
                    await this.insertReportColumn(transaction, instanceId, col);
                }
            }
            await transaction.commit();
            if (columns !== undefined) {
                await this.reorderInstanceColumns(instanceId);
            }
        }
        catch (err) {
            await transaction.rollback();
            if (err instanceof FISServiceError)
                throw err;
            throw new FISServiceError(err instanceof Error ? err.message : 'Failed to update instance');
        }
    }
    async softDeleteInstance(instanceId) {
        const result = await executeQuery(`UPDATE admin.fis_report_instances SET is_active = 0 WHERE instance_id = @instanceId`, { instanceId });
        throwOnError(result.error);
    }
    async generateReport(instanceId, scope) {
        const check = await executeQuery(`SELECT instance_id FROM admin.fis_report_instances WHERE instance_id = @instanceId AND is_active = 1`, { instanceId });
        throwOnError(check.error);
        if (!check.data?.length) {
            throw new FISServiceError('Report instance not found', 404);
        }
        if (scope) {
            const entity = scope.entityCode.trim().toUpperCase();
            const period = scope.period.trim();
            if (!entity || !period) {
                throw new FISServiceError('entityCode and period are required for scoped generation', 400);
            }
            try {
                await assertTrialBalanceDataForPeriod(entity, period);
            }
            catch (err) {
                throw new FISServiceError(err instanceof Error ? err.message : 'No trial balance data for scope', 400);
            }
            await this.ensureInstanceEntity(instanceId, entity);
            const appended = await this.appendMonthColumnsForPeriod(instanceId, period);
            if (appended === 0) {
                const hasColumns = await executeQuery(`SELECT COUNT(*) AS cnt FROM admin.fis_report_columns WHERE instance_id = @instanceId`, { instanceId });
                throwOnError(hasColumns.error);
                if (!hasColumns.data?.[0]?.cnt) {
                    throw new FISServiceError(`No report columns on instance ${instanceId}. Create the instance for ${period} first.`, 400);
                }
            }
        }
        await this.reorderInstanceColumns(instanceId);
        const result = await executeProcedure('rp.usp_GenerateFISReportByInstance', { instance_id: instanceId });
        throwOnError(result.error);
        const countResult = await executeQuery(`SELECT COUNT(*) AS total FROM rp.fis_report_output WHERE instance_id = @instanceId`, { instanceId });
        throwOnError(countResult.error);
        return {
            instanceId,
            outputRowCount: Number(countResult.data?.[0]?.total) || 0,
            entityCode: scope?.entityCode.trim().toUpperCase(),
            period: scope?.period.trim(),
        };
    }
    /** Run-key generation for NF / PL / BS / CF (no instances). Uses chunked SP calls internally. */
    async generateReportByRunKey(reportTypeCode, entityCode, asOfPeriod, triggeredBy) {
        const ctx = await this.prepareRunKeyGeneration(reportTypeCode, entityCode, asOfPeriod, triggeredBy);
        try {
            await this.executeGenerateMode(ctx.procParams, 'INIT');
            for (const row of ctx.sumRows) {
                await this.executeGenerateMode(ctx.procParams, 'SUM_ROW', row.rowId);
            }
            await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS');
            const outputRowCount = await this.countRunKeyOutput(ctx);
            await completeReportRun(ctx.runId, true, outputRowCount);
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
            if (err instanceof FISServiceError)
                throw err;
            throw new FISServiceError(message);
        }
    }
    /** SUM rows from report row config — used for chunked generation progress. */
    async getSumRowsForRunKey(reportTypeCode) {
        const reportType = reportTypeCode.trim().toUpperCase();
        if (!reportType) {
            throw new FISServiceError('reportTypeCode is required', 400);
        }
        const result = await executeQuery(`SELECT rr.row_id, rr.line_item_code, rr.line_item_label, rr.display_order
       FROM admin.fis_report_rows rr
       INNER JOIN admin.fis_report_types rt ON rr.report_type_id = rt.report_type_id
       WHERE rt.report_type_code = @reportType
         AND rt.is_active = 1
         AND rr.is_active = 1
         AND rr.aggregation_type = 'SUM'
       ORDER BY rr.display_order`, { reportType });
        throwOnError(result.error);
        return (result.data || []).map((r) => ({
            rowId: r.row_id,
            lineItemCode: r.line_item_code,
            lineItemLabel: r.line_item_label,
            displayOrder: r.display_order,
        }));
    }
    /** Single chunk of run-key generation (init / one SUM row / finalize). */
    async generateReportRunKeyChunk(params) {
        const phase = params.phase;
        const ctx = await this.prepareRunKeyGeneration(params.reportTypeCode, params.entityCode, params.asOfPeriod, params.triggeredBy, phase === 'init');
        const runId = phase === 'init' ? ctx.runId : params.runId ?? null;
        try {
            if (phase === 'init') {
                await this.executeGenerateMode(ctx.procParams, 'INIT');
                return {
                    reportTypeCode: ctx.reportType,
                    entityCode: ctx.entity,
                    asOfPeriod: ctx.period,
                    phase,
                    runId,
                    sumRows: ctx.sumRows,
                    ...(ctx.phase4 ? { fileStatus: ctx.fileStatus, isTbLocked: ctx.isTbLocked } : {}),
                };
            }
            if (phase === 'row') {
                if (params.rowId == null) {
                    throw new FISServiceError('rowId is required for row phase', 400);
                }
                await this.executeGenerateMode(ctx.procParams, 'SUM_ROW', params.rowId);
                return {
                    reportTypeCode: ctx.reportType,
                    entityCode: ctx.entity,
                    asOfPeriod: ctx.period,
                    phase,
                    runId,
                };
            }
            await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS');
            const outputRowCount = await this.countRunKeyOutput(ctx);
            await completeReportRun(runId, true, outputRowCount);
            return {
                reportTypeCode: ctx.reportType,
                entityCode: ctx.entity,
                asOfPeriod: ctx.period,
                phase,
                runId,
                outputRowCount,
                ...(ctx.phase4 ? { fileStatus: ctx.fileStatus, isTbLocked: ctx.isTbLocked } : {}),
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (phase === 'finalize') {
                await completeReportRun(runId, false, 0, message);
            }
            if (err instanceof FISServiceError)
                throw err;
            throw new FISServiceError(message);
        }
    }
    async prepareRunKeyGeneration(reportTypeCode, entityCode, asOfPeriod, triggeredBy, startRun = false) {
        const reportType = reportTypeCode.trim().toUpperCase();
        const entity = entityCode.trim().toUpperCase();
        const period = asOfPeriod.trim();
        if (!reportType) {
            throw new FISServiceError('reportTypeCode is required', 400);
        }
        if (!entity) {
            throw new FISServiceError('entityCode is required', 400);
        }
        if (!/^\d{6}$/.test(period)) {
            throw new FISServiceError('asOfPeriod must be YYYYMM', 400);
        }
        if (reportType === 'MPR') {
            throw new FISServiceError('MPR reports use instance-based generation', 400);
        }
        const allowed = new Set(['NF', 'PL', 'BS', 'CF']);
        if (!allowed.has(reportType)) {
            throw new FISServiceError(`Unsupported report type: ${reportType}`, 400);
        }
        const typeCheck = await executeQuery(`SELECT report_type_id FROM admin.fis_report_types
       WHERE report_type_code = @reportType AND is_active = 1`, { reportType });
        throwOnError(typeCheck.error);
        if (!typeCheck.data?.length) {
            throw new FISServiceError(`Report type ${reportType} not found`, 404);
        }
        try {
            await assertTrialBalanceDataForPeriod(entity, period);
        }
        catch (err) {
            throw new FISServiceError(err instanceof Error ? err.message : 'No trial balance data for scope', 400);
        }
        const phase4 = isFisPhase4Enabled();
        let fileStatus;
        let isTbLocked = false;
        let runId = null;
        if (phase4) {
            const resolved = await resolveFileStatusForPeriod(entity, period);
            fileStatus = resolved.fileStatus;
            isTbLocked = resolved.isTbLocked;
            if (startRun) {
                runId = await startReportRun({
                    reportTypeCode: reportType,
                    entityCode: entity,
                    asOfPeriod: period,
                    fileStatus: resolved.fileStatus,
                    triggeredBy: triggeredBy ?? null,
                    actualUploadId: resolved.actualUploadId,
                    budgetUploadId: resolved.budgetUploadId,
                    actualFileName: resolved.actualFileName,
                    budgetFileName: resolved.budgetFileName,
                    actualTbStatus: resolved.actualTbStatus,
                    budgetTbStatus: resolved.budgetTbStatus,
                });
            }
        }
        const procParams = {
            report_type_code: reportType,
            entity_code: entity,
            as_of_period: period,
        };
        if (phase4 && fileStatus) {
            procParams.file_status = fileStatus;
        }
        const sumRows = await this.getSumRowsForRunKey(reportType);
        return {
            reportType,
            entity,
            period,
            procParams,
            phase4,
            fileStatus,
            isTbLocked,
            runId,
            sumRows,
        };
    }
    async executeGenerateMode(procParams, generationMode, targetRowId) {
        const params = {
            ...procParams,
            generation_mode: generationMode,
            ...(targetRowId != null ? { target_row_id: targetRowId } : {}),
        };
        const result = await executeProcedure('rp.usp_GenerateFISReport', params);
        throwOnError(result.error);
    }
    async countRunKeyOutput(ctx) {
        const countSql = ctx.phase4 && ctx.fileStatus
            ? `SELECT COUNT(*) AS total FROM rp.fis_report_output
         WHERE report_type_code = @reportType
           AND entity_code = @entity
           AND as_of_period = @period
           AND file_status = @fileStatus`
            : `SELECT COUNT(*) AS total FROM rp.fis_report_output
         WHERE report_type_code = @reportType
           AND entity_code = @entity
           AND as_of_period = @period`;
        const countParams = {
            reportType: ctx.reportType,
            entity: ctx.entity,
            period: ctx.period,
        };
        if (ctx.phase4 && ctx.fileStatus) {
            countParams.fileStatus = ctx.fileStatus;
        }
        const countResult = await executeQuery(countSql, countParams);
        throwOnError(countResult.error);
        return Number(countResult.data?.[0]?.total) || 0;
    }
    // ---------------------------------------------------------------------------
    // Dictionary autocomplete
    // ---------------------------------------------------------------------------
    async getDictionaryCodes(dictionaryType, entity, search) {
        let query = `
      SELECT TOP 100 code, description
      FROM FIN.DictionaryData
      WHERE dictionary_type = @dictionaryType
        AND (suspended IS NULL OR LTRIM(RTRIM(suspended)) = '')
    `;
        const params = { dictionaryType };
        if (entity) {
            query += ` AND entity = @entity`;
            params.entity = entity;
        }
        if (search && search.trim()) {
            query += ` AND (code LIKE @search OR description LIKE @search)`;
            params.search = `%${search.trim()}%`;
        }
        query += ` ORDER BY code`;
        const result = await executeQuery(query, params);
        throwOnError(result.error);
        return (result.data || []).map((r) => ({ code: r.code, description: r.description }));
    }
    mapRow(r) {
        return {
            rowId: r.row_id,
            reportTypeId: r.report_type_id,
            reportTypeCode: r.report_type_code,
            lineItemCode: r.line_item_code,
            lineItemLabel: r.line_item_label,
            displayOrder: r.display_order,
            indentLevel: r.indent_level,
            isHeader: r.is_header === true || r.is_header === 1,
            isTotal: r.is_total === true || r.is_total === 1,
            isSpacer: r.is_spacer === true || r.is_spacer === 1,
            isTitle: r.is_title === true || r.is_title === 1,
            isBold: r.is_bold === true || r.is_bold === 1,
            rowColor: r.row_color,
            fontColor: r.font_color,
            aggregationType: r.aggregation_type,
            expression: r.expression,
            signConvention: r.sign_convention,
            formatType: r.format_type,
            pctNumeratorCode: r.pct_numerator_code ?? null,
            pctDenominatorCode: r.pct_denominator_code ?? null,
            isActive: r.is_active === true || r.is_active === 1,
            notes: r.notes,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
}
export const fisService = new FISService();
//# sourceMappingURL=FISService.js.map