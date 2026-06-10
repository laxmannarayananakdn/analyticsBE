/**
 * FIS (Financial Information System) Reporting Service
 */
import { executeQuery, executeProcedure, getConnection, sql } from '../config/database.js';
import { assertTrialBalanceDataForPeriod, buildColumnsFromEntityTrialBalance, } from './FISTrialBalanceProcessService.js';
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
    return {
        columnOrder: toInt(pickField(raw, 'columnOrder', 'column_order'), 'columnOrder'),
        columnLabel: String(pickField(raw, 'columnLabel', 'column_label') ?? ''),
        fiscalYear: toInt(pickField(raw, 'fiscalYear', 'fiscal_year'), 'fiscalYear'),
        fiscalMonthFrom: toInt(pickField(raw, 'fiscalMonthFrom', 'fiscal_month_from'), 'fiscalMonthFrom'),
        fiscalMonthTo: toInt(pickField(raw, 'fiscalMonthTo', 'fiscal_month_to'), 'fiscalMonthTo'),
        isYtd: toBit(pickField(raw, 'isYtd', 'is_ytd')),
    };
}
export class FISService {
    // ---------------------------------------------------------------------------
    // Report types
    // ---------------------------------------------------------------------------
    async getReportTypes() {
        const result = await executeQuery(`SELECT report_type_id, report_type_code, report_type_name, description, is_active, created_at, created_by
       FROM admin.fis_report_types
       WHERE is_active = 1
       ORDER BY report_type_name`);
        throwOnError(result.error);
        return (result.data || []).map((r) => ({
            reportTypeId: r.report_type_id,
            reportTypeCode: r.report_type_code,
            reportTypeName: r.report_type_name,
            description: r.description,
            isActive: r.is_active === true || r.is_active === 1,
            createdAt: r.created_at,
            createdBy: r.created_by,
        }));
    }
    // ---------------------------------------------------------------------------
    // Rows
    // ---------------------------------------------------------------------------
    async getRowsByReportType(reportTypeId) {
        const result = await executeQuery(`SELECT rr.row_id, rr.report_type_id, rt.report_type_code,
              rr.line_item_code, rr.line_item_label, rr.display_order, rr.indent_level,
              rr.is_header, rr.is_total, rr.is_spacer, rr.is_title,
              rr.aggregation_type, rr.expression, rr.sign_convention, rr.format_type,
              rr.is_active, rr.notes, rr.created_at, rr.updated_at
       FROM admin.fis_report_rows rr
       INNER JOIN admin.fis_report_types rt ON rr.report_type_id = rt.report_type_id
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
         sign_convention, format_type, notes
       )
       OUTPUT INSERTED.row_id
       VALUES (
         @reportTypeId, @lineItemCode, @lineItemLabel, @displayOrder, @indentLevel,
         @isHeader, @isTotal, @isSpacer, @isTitle, @aggregationType, @expression,
         @signConvention, @formatType, @notes
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
            { key: 'aggregationType', snake: 'aggregation_type' },
            { key: 'expression', snake: 'expression' },
            { key: 'signConvention', snake: 'sign_convention', transform: (v) => toInt(v, 'signConvention') },
            { key: 'formatType', snake: 'format_type' },
            { key: 'notes', snake: 'notes' },
            { key: 'isActive', snake: 'is_active', transform: (v) => toBit(v) },
        ];
        for (const f of fields) {
            const val = data[f.key] ?? data[f.snake];
            if (val !== undefined) {
                const param = f.key;
                sets.push(`${f.snake} = @${param}`);
                params[param] = f.transform ? f.transform(val) : val;
            }
        }
        if (sets.length === 0) {
            throw new FISServiceError('No fields to update', 400);
        }
        sets.push('updated_at = GETDATE()');
        const result = await executeQuery(`UPDATE admin.fis_report_rows SET ${sets.join(', ')} WHERE row_id = @rowId`, params);
        throwOnError(result.error);
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
              fiscal_year, fiscal_month_from, fiscal_month_to, is_ytd
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
            })),
        };
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
                const parsed = columnFromInput(col);
                const req = new sql.Request(transaction);
                req.input('instanceId', sql.Int, instanceId);
                req.input('columnOrder', sql.Int, parsed.columnOrder);
                req.input('columnLabel', sql.NVarChar(100), parsed.columnLabel);
                req.input('fiscalYear', sql.Int, parsed.fiscalYear);
                req.input('fiscalMonthFrom', sql.Int, parsed.fiscalMonthFrom);
                req.input('fiscalMonthTo', sql.Int, parsed.fiscalMonthTo);
                req.input('isYtd', sql.Bit, parsed.isYtd);
                await req.query(`INSERT INTO admin.fis_report_columns (
             instance_id, column_order, column_label, fiscal_year, fiscal_month_from, fiscal_month_to, is_ytd
           ) VALUES (@instanceId, @columnOrder, @columnLabel, @fiscalYear, @fiscalMonthFrom, @fiscalMonthTo, @isYtd)`);
            }
            await transaction.commit();
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
                    const parsed = columnFromInput(col);
                    const req = new sql.Request(transaction);
                    req.input('instanceId', sql.Int, instanceId);
                    req.input('columnOrder', sql.Int, parsed.columnOrder);
                    req.input('columnLabel', sql.NVarChar(100), parsed.columnLabel);
                    req.input('fiscalYear', sql.Int, parsed.fiscalYear);
                    req.input('fiscalMonthFrom', sql.Int, parsed.fiscalMonthFrom);
                    req.input('fiscalMonthTo', sql.Int, parsed.fiscalMonthTo);
                    req.input('isYtd', sql.Bit, parsed.isYtd);
                    await req.query(`INSERT INTO admin.fis_report_columns (
               instance_id, column_order, column_label, fiscal_year, fiscal_month_from, fiscal_month_to, is_ytd
             ) VALUES (@instanceId, @columnOrder, @columnLabel, @fiscalYear, @fiscalMonthFrom, @fiscalMonthTo, @isYtd)`);
                }
            }
            await transaction.commit();
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
            const columns = await buildColumnsFromEntityTrialBalance(entity, period);
            if (!columns.length) {
                throw new FISServiceError(`No trial balance periods found for ${entity} / ${period}`, 400);
            }
            await this.updateInstance(instanceId, {
                entityCodes: [entity],
                columns,
            });
        }
        const result = await executeProcedure('rp.usp_GenerateFISReport', { instance_id: instanceId });
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
            aggregationType: r.aggregation_type,
            expression: r.expression,
            signConvention: r.sign_convention,
            formatType: r.format_type,
            isActive: r.is_active === true || r.is_active === 1,
            notes: r.notes,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
}
export const fisService = new FISService();
//# sourceMappingURL=FISService.js.map