/**
 * FIS (Financial Information System) Reporting Service
 */

import { executeQuery, executeProcedure, getConnection, sql } from '../config/database.js';
import {
  assertTrialBalanceDataForPeriod,
  buildMonthColumnSet,
  compareFisReportColumns,
  type FisColumnKind,
  type FisColumnTbType,
  type FisMonthColumnDef,
} from './FISTrialBalanceProcessService.js';
import {
  completeReportRun,
  isFisPhase4Enabled,
  resolveFileStatusForPeriod,
  resolveRunLoggingContext,
  startReportRun,
  type FisFileStatus,
} from './FISRunTrackingService.js';
import type { FisGenerationJobProgress } from './FISReportGenerationJobService.js';
import { withFisProcessLog } from '../utils/fisProcessLog.js';
import { isFisPreviousYearPeriod } from '../utils/fisPreviousYearPeriod.js';
import {
  restoreBsPreviousYearAfterMonthlyRun,
  syncBsPreviousYearColumn,
} from './FISPreviousYearSyncService.js';

/** Fixed processing order when multiple report types are selected. */
export const FIS_REPORT_GENERATION_ORDER = ['NF', 'BS', 'PL', 'CF'] as const;

export function assertReportTypesAllowedForPeriod(
  reportTypeCodes: string[],
  asOfPeriod: string
): string[] {
  const ordered = sortReportTypesForGeneration(reportTypeCodes);
  if (!ordered.length) {
    throw new FISServiceError('Select at least one report type (NF, BS, PL, CF)', 400);
  }
  if (isFisPreviousYearPeriod(asOfPeriod)) {
    const disallowed = ordered.filter((rt) => rt !== 'BS');
    if (disallowed.length) {
      throw new FISServiceError(
        `Period ${asOfPeriod.trim()} (Previous Year) can only generate BS. Remove: ${disallowed.join(', ')}.`,
        400
      );
    }
  }
  return ordered;
}

export function sortReportTypesForGeneration(reportTypeCodes: string[]): string[] {
  const wanted = new Set(
    reportTypeCodes.map((c) => c.trim().toUpperCase()).filter(Boolean)
  );
  return FIS_REPORT_GENERATION_ORDER.filter((code) => wanted.has(code));
}

export class FISServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'FISServiceError';
    this.statusCode = statusCode;
  }
}

function throwOnError(error: string | null, notFoundMessage?: string): void {
  if (!error) return;
  if (notFoundMessage && error.toLowerCase().includes('not found')) {
    throw new FISServiceError(notFoundMessage, 404);
  }
  throw new FISServiceError(error);
}

function toInt(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (Number.isNaN(n)) {
    throw new FISServiceError(`Invalid ${field}`, 400);
  }
  return n;
}

function toBit(value: unknown, defaultValue = 0): number {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === 1 || value === '1' || value === 'true') return 1;
  return 0;
}

function normalizeHexColor(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const color = String(value).trim();
  if (!color) return null;
  if (!/^#([A-Fa-f0-9]{6})$/.test(color)) {
    throw new FISServiceError('Color values must be valid hex codes in #RRGGBB format', 400);
  }
  return color.toUpperCase();
}

function pickField<T>(obj: Record<string, unknown>, camel: string, snake: string): T | undefined {
  if (obj[camel] !== undefined) return obj[camel] as T;
  if (obj[snake] !== undefined) return obj[snake] as T;
  return undefined;
}

function criterionFromInput(c: FisRuleCriterion | Record<string, unknown>): {
  dimension: string;
  filterType: string;
  valueSingle: string | null;
  valueList: string | null;
  valueRangeFrom: string | null;
  valueRangeTo: string | null;
} {
  const raw = c as Record<string, unknown>;
  return {
    dimension: String(pickField(raw, 'dimension', 'dimension') ?? ''),
    filterType: String(pickField(raw, 'filterType', 'filter_type') ?? ''),
    valueSingle: (pickField<string | null>(raw, 'valueSingle', 'value_single') ?? null) as string | null,
    valueList: (pickField<string | null>(raw, 'valueList', 'value_list') ?? null) as string | null,
    valueRangeFrom: (pickField<string | null>(raw, 'valueRangeFrom', 'value_range_from') ?? null) as string | null,
    valueRangeTo: (pickField<string | null>(raw, 'valueRangeTo', 'value_range_to') ?? null) as string | null,
  };
}

function columnFromInput(col: FisReportColumn | Record<string, unknown>): {
  columnOrder: number;
  columnLabel: string;
  fiscalYear: number;
  fiscalMonthFrom: number;
  fiscalMonthTo: number;
  isYtd: number;
  tbType: string | null;
  columnKind: string;
} {
  const raw = col as Record<string, unknown>;
  const tbType = pickField<string | null>(raw, 'tbType', 'tb_type');
  const columnKind = pickField<string>(raw, 'columnKind', 'column_kind');
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

export interface FisReportType {
  reportTypeId: number;
  reportTypeCode: string;
  reportTypeName: string;
  description: string | null;
  chartId: string | null;
  additionalChartIds: string | null;
  summaryChartId: string | null;
  additionalSummaryChartIds: string | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: string | null;
}

export interface FisReportRow {
  rowId: number;
  reportTypeId: number;
  reportTypeCode?: string;
  lineItemCode: string;
  lineItemLabel: string;
  displayOrder: number;
  calculationOrder: number;
  indentLevel: number;
  isHeader: boolean;
  isTotal: boolean;
  isSpacer: boolean;
  isTitle: boolean;
  isBold: boolean;
  showOnSummary: boolean;
  rowColor: string | null;
  fontColor: string | null;
  aggregationType: string;
  expression: string | null;
  signConvention: number;
  formatType: string | null;
  pctNumeratorCode: string | null;
  pctDenominatorCode: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FisRuleCriterion {
  criterionId?: number;
  ruleId?: number;
  dimension: string;
  filterType: string;
  valueSingle: string | null;
  valueList: string | null;
  valueRangeFrom: string | null;
  valueRangeTo: string | null;
  isActive?: boolean;
}

export interface FisFilterRule {
  ruleId: number;
  rowId: number;
  ruleOrder: number;
  ruleLabel: string | null;
  tbTypeFilter: string | null;
  amountSource: string;
  signOverride: number | null;
  isActive: boolean;
  notes: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  criteria: FisRuleCriterion[];
}

export interface FisReportColumn {
  columnId?: number;
  instanceId?: number;
  columnOrder: number;
  columnLabel: string;
  fiscalYear: number;
  fiscalMonthFrom: number;
  fiscalMonthTo: number;
  isYtd: boolean;
  tbType?: FisColumnTbType | null;
  columnKind?: FisColumnKind;
}

export interface FisReportColumnDef {
  columnDefId: number;
  reportTypeId: number;
  reportTypeCode?: string;
  columnCode: string;
  columnLabel: string;
  displayOrder: number;
  columnKind: FisColumnKind;
  periodScope: string;
  tbType: FisColumnTbType | null;
  referenceMonth: number | null;
  fiscalYearOffset: number;
  sourceColumnCodes: string | null;
  formatType: string;
  headerBackgroundColor: string | null;
  headerFontColor: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FisColumnDefResolution {
  fiscalYear: number;
  fiscalMonthFrom: number;
  fiscalMonthTo: number;
  isYtd: boolean;
  periodFrom: string;
  periodTo: string;
  skipTbQuery: boolean;
  effectiveTbType: FisColumnTbType | null;
}

export interface FisColumnDefPreviewRow extends FisReportColumnDef {
  resolution: FisColumnDefResolution;
}

export interface FisReportInstanceSummary {
  instanceId: number;
  reportTypeId: number;
  instanceName: string;
  countryScope: string;
  baseCurrency: string | null;
  isActive: boolean;
  createdAt: Date;
  createdBy: string | null;
  entityCodes: string;
  columnCount: number;
}

export interface FisReportInstanceDetail extends Omit<FisReportInstanceSummary, 'entityCodes' | 'columnCount'> {
  entityCodes: string[];
  columns: FisReportColumn[];
}

export interface DictionaryCodeItem {
  dim_id?: number;
  code: string;
  description: string | null;
}

function normalizeAdditionalChartIds(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const ids = [...new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean))];
  return ids.length ? ids.join(', ') : null;
}

function mapReportTypeRow(r: {
  report_type_id: number;
  report_type_code: string;
  report_type_name: string;
  description: string | null;
  chart_id: string | null;
  additional_chart_ids?: string | null;
  summary_chart_id?: string | null;
  additional_summary_chart_ids?: string | null;
  is_active: boolean | number;
  created_at: Date;
  created_by: string | null;
}): FisReportType {
  return {
    reportTypeId: r.report_type_id,
    reportTypeCode: r.report_type_code,
    reportTypeName: r.report_type_name,
    description: r.description,
    chartId: r.chart_id,
    additionalChartIds: r.additional_chart_ids ?? null,
    summaryChartId: r.summary_chart_id ?? null,
    additionalSummaryChartIds: r.additional_summary_chart_ids ?? null,
    isActive: r.is_active === true || r.is_active === 1,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

export class FISService {
  // ---------------------------------------------------------------------------
  // Report types
  // ---------------------------------------------------------------------------

  async getReportTypes(): Promise<FisReportType[]> {
    const result = await executeQuery<{
      report_type_id: number;
      report_type_code: string;
      report_type_name: string;
      description: string | null;
      chart_id: string | null;
      additional_chart_ids: string | null;
      summary_chart_id: string | null;
      additional_summary_chart_ids: string | null;
      is_active: boolean | number;
      created_at: Date;
      created_by: string | null;
    }>(
      `SELECT report_type_id, report_type_code, report_type_name, description,
              chart_id, additional_chart_ids, summary_chart_id, additional_summary_chart_ids,
              is_active, created_at, created_by
       FROM admin.fis_report_types
       WHERE is_active = 1
       ORDER BY report_type_name`
    );
    throwOnError(result.error);
    return (result.data || []).map(mapReportTypeRow);
  }

  async createReportType(data: Record<string, unknown>): Promise<number> {
    const reportTypeCode = String(data.reportTypeCode ?? data.report_type_code ?? '')
      .trim()
      .toUpperCase();
    const reportTypeName = String(data.reportTypeName ?? data.report_type_name ?? '').trim();
    const description = String(data.description ?? '').trim() || null;
    const chartId = String(data.chartId ?? data.chart_id ?? '').trim() || null;
    const additionalChartIds = normalizeAdditionalChartIds(
      data.additionalChartIds ?? data.additional_chart_ids
    );
    const summaryChartId = String(data.summaryChartId ?? data.summary_chart_id ?? '').trim() || null;
    const additionalSummaryChartIds = normalizeAdditionalChartIds(
      data.additionalSummaryChartIds ?? data.additional_summary_chart_ids
    );
    const createdBy = (data.createdBy ?? data.created_by ?? null) as string | null;

    if (!reportTypeCode) {
      throw new FISServiceError('reportTypeCode is required', 400);
    }
    if (!reportTypeName) {
      throw new FISServiceError('reportTypeName is required', 400);
    }
    if (!/^[A-Z0-9_-]+$/.test(reportTypeCode)) {
      throw new FISServiceError(
        'reportTypeCode may only contain letters, numbers, underscores, and hyphens',
        400
      );
    }

    const existing = await executeQuery<{ report_type_id: number }>(
      `SELECT report_type_id
       FROM admin.fis_report_types
       WHERE UPPER(report_type_code) = @reportTypeCode`,
      { reportTypeCode }
    );
    throwOnError(existing.error);
    if (existing.data?.length) {
      throw new FISServiceError('A report type with this code already exists', 409);
    }

    const result = await executeQuery<{ report_type_id: number }>(
      `INSERT INTO admin.fis_report_types (
         report_type_code, report_type_name, description, chart_id, additional_chart_ids,
         summary_chart_id, additional_summary_chart_ids, created_by
       )
       OUTPUT INSERTED.report_type_id
       VALUES (@reportTypeCode, @reportTypeName, @description, @chartId, @additionalChartIds,
               @summaryChartId, @additionalSummaryChartIds, @createdBy)`,
      {
        reportTypeCode,
        reportTypeName,
        description,
        chartId,
        additionalChartIds,
        summaryChartId,
        additionalSummaryChartIds,
        createdBy,
      }
    );
    throwOnError(result.error);
    if (!result.data?.[0]?.report_type_id) {
      throw new FISServiceError('Failed to create report type');
    }
    return result.data[0].report_type_id;
  }

  async updateReportType(reportTypeId: number, data: Record<string, unknown>): Promise<FisReportType> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { reportTypeId };

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

    if (data.additionalChartIds !== undefined || data.additional_chart_ids !== undefined) {
      sets.push('additional_chart_ids = @additionalChartIds');
      params.additionalChartIds = normalizeAdditionalChartIds(
        data.additionalChartIds ?? data.additional_chart_ids
      );
    }
    if (data.summaryChartId !== undefined || data.summary_chart_id !== undefined) {
      sets.push('summary_chart_id = @summaryChartId');
      params.summaryChartId = String(data.summaryChartId ?? data.summary_chart_id ?? '').trim() || null;
    }
    if (
      data.additionalSummaryChartIds !== undefined ||
      data.additional_summary_chart_ids !== undefined
    ) {
      sets.push('additional_summary_chart_ids = @additionalSummaryChartIds');
      params.additionalSummaryChartIds = normalizeAdditionalChartIds(
        data.additionalSummaryChartIds ?? data.additional_summary_chart_ids
      );
    }

    if (sets.length === 0) {
      throw new FISServiceError('No fields to update', 400);
    }

    const update = await executeQuery(
      `UPDATE admin.fis_report_types SET ${sets.join(', ')} WHERE report_type_id = @reportTypeId`,
      params
    );
    throwOnError(update.error);

    const result = await executeQuery<{
      report_type_id: number;
      report_type_code: string;
      report_type_name: string;
      description: string | null;
      chart_id: string | null;
      additional_chart_ids: string | null;
      summary_chart_id: string | null;
      additional_summary_chart_ids: string | null;
      is_active: boolean | number;
      created_at: Date;
      created_by: string | null;
    }>(
      `SELECT report_type_id, report_type_code, report_type_name, description,
              chart_id, additional_chart_ids, summary_chart_id, additional_summary_chart_ids,
              is_active, created_at, created_by
       FROM admin.fis_report_types
       WHERE report_type_id = @reportTypeId`,
      { reportTypeId }
    );
    throwOnError(result.error);
    if (!result.data?.length) {
      throw new FISServiceError('Report type not found', 404);
    }
    return mapReportTypeRow(result.data[0]);
  }

  // ---------------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------------

  private rowSelectSql = `SELECT rr.row_id, rr.report_type_id, rt.report_type_code,
              rr.line_item_code, rr.line_item_label, rr.display_order, rr.calculation_order, rr.indent_level,
              rr.is_header, rr.is_total, rr.is_spacer, rr.is_title, rr.is_bold, rr.show_on_summary, rr.row_color, rr.font_color,
              rr.aggregation_type, rr.expression, rr.sign_convention, rr.format_type,
              rr.pct_numerator_code, rr.pct_denominator_code,
              rr.is_active, rr.notes, rr.created_at, rr.updated_at
       FROM admin.fis_report_rows rr
       INNER JOIN admin.fis_report_types rt ON rr.report_type_id = rt.report_type_id`;

  async getRowById(rowId: number): Promise<FisReportRow | null> {
    const result = await executeQuery<Parameters<FISService['mapRow']>[0]>(
      `${this.rowSelectSql} WHERE rr.row_id = @rowId`,
      { rowId }
    );
    throwOnError(result.error);
    if (!result.data?.[0]) return null;
    return this.mapRow(result.data[0]);
  }

  async getRowsByReportType(reportTypeId: number): Promise<FisReportRow[]> {
    const result = await executeQuery<Parameters<FISService['mapRow']>[0]>(
      `${this.rowSelectSql}
       WHERE rr.report_type_id = @reportTypeId
       ORDER BY ISNULL(rr.calculation_order, rr.display_order), rr.display_order`,
      { reportTypeId }
    );
    throwOnError(result.error);
    return (result.data || []).map((r) => this.mapRow(r));
  }

  async createRow(reportTypeId: number, data: Record<string, unknown>): Promise<number> {
    const lineItemCode = String(data.lineItemCode ?? data.line_item_code ?? '').trim();
    const lineItemLabel = String(data.lineItemLabel ?? data.line_item_label ?? '').trim();
    if (!lineItemCode || !lineItemLabel) {
      throw new FISServiceError('lineItemCode and lineItemLabel are required', 400);
    }

    const result = await executeQuery<{ row_id: number }>(
      `INSERT INTO admin.fis_report_rows (
         report_type_id, line_item_code, line_item_label, display_order, calculation_order, indent_level,
         is_header, is_total, is_spacer, is_title, aggregation_type, expression,
         sign_convention, format_type, pct_numerator_code, pct_denominator_code, is_bold, show_on_summary, row_color, font_color, notes
       )
       OUTPUT INSERTED.row_id
       VALUES (
         @reportTypeId, @lineItemCode, @lineItemLabel, @displayOrder, @calculationOrder, @indentLevel,
         @isHeader, @isTotal, @isSpacer, @isTitle, @aggregationType, @expression,
         @signConvention, @formatType, @pctNumeratorCode, @pctDenominatorCode, @isBold, @showOnSummary, @rowColor, @fontColor, @notes
       )`,
      {
        reportTypeId,
        lineItemCode,
        lineItemLabel,
        displayOrder: toInt(data.displayOrder ?? data.display_order ?? 0, 'displayOrder'),
        calculationOrder: toInt(
          data.calculationOrder ?? data.calculation_order ?? 1,
          'calculationOrder'
        ),
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
        showOnSummary: toBit(data.showOnSummary ?? data.show_on_summary),
        rowColor: normalizeHexColor(data.rowColor ?? data.row_color),
        fontColor: normalizeHexColor(data.fontColor ?? data.font_color),
        notes: data.notes != null ? String(data.notes) : null,
      }
    );
    throwOnError(result.error);
    if (!result.data?.[0]?.row_id) throw new FISServiceError('Failed to create row');
    return result.data[0].row_id;
  }

  async updateRow(rowId: number, data: Record<string, unknown>): Promise<FisReportRow> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { rowId };

    const fields: Array<{ key: string; snake: string; transform?: (v: unknown) => unknown }> = [
      { key: 'lineItemCode', snake: 'line_item_code' },
      { key: 'lineItemLabel', snake: 'line_item_label' },
      { key: 'displayOrder', snake: 'display_order', transform: (v) => toInt(v, 'displayOrder') },
      { key: 'calculationOrder', snake: 'calculation_order', transform: (v) => toInt(v, 'calculationOrder') },
      { key: 'indentLevel', snake: 'indent_level', transform: (v) => toInt(v, 'indentLevel') },
      { key: 'isHeader', snake: 'is_header', transform: (v) => toBit(v) },
      { key: 'isTotal', snake: 'is_total', transform: (v) => toBit(v) },
      { key: 'isSpacer', snake: 'is_spacer', transform: (v) => toBit(v) },
      { key: 'isTitle', snake: 'is_title', transform: (v) => toBit(v) },
      { key: 'isBold', snake: 'is_bold', transform: (v) => toBit(v) },
      { key: 'showOnSummary', snake: 'show_on_summary', transform: (v) => toBit(v) },
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

    const result = await executeQuery(
      `UPDATE admin.fis_report_rows SET ${sets.join(', ')} WHERE row_id = @rowId`,
      params
    );
    throwOnError(result.error);

    const row = await this.getRowById(rowId);
    if (!row) {
      throw new FISServiceError(`Row ${rowId} not found after update`, 404);
    }
    return row;
  }

  async deleteRow(rowId: number): Promise<void> {
    const existing = await executeQuery<{
      row_id: number;
      report_type_id: number;
      line_item_code: string;
    }>(
      `SELECT row_id, report_type_id, line_item_code
       FROM admin.fis_report_rows
       WHERE row_id = @rowId`,
      { rowId }
    );
    throwOnError(existing.error);
    if (!existing.data?.length) {
      throw new FISServiceError('Row not found', 404);
    }
    const current = existing.data[0];
    const reportTypeId = current.report_type_id;
    const lineItemCode = String(current.line_item_code).trim();

    const rules = await executeQuery<{ rule_id: number }>(
      `SELECT rule_id
       FROM admin.fis_row_filter_rules
       WHERE row_id = @rowId AND is_active = 1`,
      { rowId }
    );
    throwOnError(rules.error);
    if (rules.data?.length) {
      throw new FISServiceError(
        `Cannot delete row ${lineItemCode}: remove its ${rules.data.length} filter rule(s) first`,
        400
      );
    }

    const refs = await executeQuery<{ line_item_code: string }>(
      `SELECT line_item_code
       FROM admin.fis_report_rows
       WHERE report_type_id = @reportTypeId
         AND row_id <> @rowId
         AND (
           pct_numerator_code = @lineItemCode
           OR pct_denominator_code = @lineItemCode
           OR (
             expression IS NOT NULL
             AND (
               CHARINDEX(N'[' + @lineItemCode + N']', expression) > 0
               OR CHARINDEX(N':' + @lineItemCode + N']', expression) > 0
             )
           )
         )`,
      {
        reportTypeId,
        rowId,
        lineItemCode,
      }
    );
    throwOnError(refs.error);
    if (refs.data?.length) {
      const dependents = refs.data.map((r) => r.line_item_code).join(', ');
      throw new FISServiceError(
        `Cannot delete row ${lineItemCode}: referenced by row(s): ${dependents}`,
        400
      );
    }

    const deleteCriteria = await executeQuery(
      `DELETE rc
       FROM admin.fis_rule_criteria rc
       INNER JOIN admin.fis_row_filter_rules rfr ON rc.rule_id = rfr.rule_id
       WHERE rfr.row_id = @rowId`,
      { rowId }
    );
    throwOnError(deleteCriteria.error);

    const deleteRules = await executeQuery(
      `DELETE FROM admin.fis_row_filter_rules WHERE row_id = @rowId`,
      { rowId }
    );
    throwOnError(deleteRules.error);

    const deleteRow = await executeQuery(
      `DELETE FROM admin.fis_report_rows WHERE row_id = @rowId`,
      { rowId }
    );
    throwOnError(deleteRow.error);

    await this.compactDisplayOrders(reportTypeId);
  }

  /** @deprecated Use deleteRow — kept for route compatibility */
  async softDeleteRow(rowId: number): Promise<void> {
    return this.deleteRow(rowId);
  }

  async compactDisplayOrders(reportTypeId: number): Promise<number> {
    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      request.input('reportTypeId', sql.Int, reportTypeId);
      const result = await request.query<{ needs_update: number }>(`
        IF OBJECT_ID('tempdb..#fis_compact_orders') IS NOT NULL DROP TABLE #fis_compact_orders;

        SELECT
          row_id,
          ROW_NUMBER() OVER (ORDER BY display_order, row_id) AS target_order
        INTO #fis_compact_orders
        FROM admin.fis_report_rows
        WHERE report_type_id = @reportTypeId;

        DECLARE @needs_update INT;
        SELECT @needs_update = COUNT(*)
        FROM admin.fis_report_rows r
        INNER JOIN #fis_compact_orders c ON r.row_id = c.row_id
        WHERE r.report_type_id = @reportTypeId
          AND r.display_order <> c.target_order;

        IF @needs_update > 0
        BEGIN
          UPDATE r
          SET display_order = -r.row_id, updated_at = GETDATE()
          FROM admin.fis_report_rows r
          INNER JOIN #fis_compact_orders c ON r.row_id = c.row_id
          WHERE r.report_type_id = @reportTypeId
            AND r.display_order <> c.target_order;

          UPDATE r
          SET display_order = c.target_order, updated_at = GETDATE()
          FROM admin.fis_report_rows r
          INNER JOIN #fis_compact_orders c ON r.row_id = c.row_id
          WHERE r.report_type_id = @reportTypeId
            AND r.display_order < 0;
        END

        DROP TABLE #fis_compact_orders;

        SELECT @needs_update AS needs_update;`);

      await transaction.commit();
      return Number(result.recordset[0]?.needs_update ?? 0);
    } catch (err: unknown) {
      await transaction.rollback();
      const message = err instanceof Error ? err.message : 'Failed to compact display orders';
      throw new FISServiceError(message);
    }
  }

  async reorderRows(updates: Array<{ rowId: number; displayOrder: number }>): Promise<void> {
    if (!updates.length) return;

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      const valueRows = updates
        .map((_, index) => `(@rowId${index}, @displayOrder${index})`)
        .join(', ');
      for (const [index, update] of updates.entries()) {
        request.input(`rowId${index}`, sql.Int, update.rowId);
        request.input(`displayOrder${index}`, sql.Int, update.displayOrder);
      }

      await request.query(`
        IF OBJECT_ID('tempdb..#fis_reorder_rows') IS NOT NULL DROP TABLE #fis_reorder_rows;
        CREATE TABLE #fis_reorder_rows (
          row_id INT NOT NULL PRIMARY KEY,
          display_order INT NOT NULL
        );

        INSERT INTO #fis_reorder_rows (row_id, display_order)
        VALUES ${valueRows};

        UPDATE r
        SET display_order = -r.row_id, updated_at = GETDATE()
        FROM admin.fis_report_rows r
        INNER JOIN #fis_reorder_rows t ON r.row_id = t.row_id;

        UPDATE r
        SET display_order = t.display_order, updated_at = GETDATE()
        FROM admin.fis_report_rows r
        INNER JOIN #fis_reorder_rows t ON r.row_id = t.row_id;

        DROP TABLE #fis_reorder_rows;`);

      await transaction.commit();
    } catch (err: unknown) {
      await transaction.rollback();
      const message = err instanceof Error ? err.message : 'Failed to reorder rows';
      throw new FISServiceError(message);
    }
  }

  async autoCalculateRowCalculationOrder(
    reportTypeId: number
  ): Promise<{ updated: number; unresolvedReferences: string[] }> {
    const reportTypeResult = await executeQuery<{ report_type_code: string }>(
      `SELECT report_type_code
       FROM admin.fis_report_types
       WHERE report_type_id = @reportTypeId`,
      { reportTypeId }
    );
    throwOnError(reportTypeResult.error);
    const reportTypeCode = String(reportTypeResult.data?.[0]?.report_type_code ?? '').trim().toUpperCase();
    if (!reportTypeCode) {
      throw new FISServiceError('Report type not found', 404);
    }

    const rowsResult = await executeQuery<{
      row_id: number;
      line_item_code: string;
      aggregation_type: string;
      format_type: string | null;
      expression: string | null;
      pct_numerator_code: string | null;
      pct_denominator_code: string | null;
      display_order: number;
      calculation_order: number | null;
      is_active: boolean | number;
    }>(
      `SELECT row_id, line_item_code, aggregation_type, format_type, expression,
              pct_numerator_code, pct_denominator_code,
              display_order, calculation_order, is_active
       FROM admin.fis_report_rows
       WHERE report_type_id = @reportTypeId
         AND is_active = 1`,
      { reportTypeId }
    );
    throwOnError(rowsResult.error);
    const rows = rowsResult.data || [];
    if (!rows.length) {
      return { updated: 0, unresolvedReferences: [] };
    }

    const byCode = new Map<string, number>();
    for (const r of rows) byCode.set(String(r.line_item_code).trim().toUpperCase(), r.row_id);

    const deps = new Map<number, Set<number>>();
    const level = new Map<number, number>();
    const unresolved = new Set<string>();
    const tokenRegex = /\[([^\]]+)\]/g;

    const addSameReportDependency = (
      sourceLineItemCode: string,
      refCode: string,
      dependencySet: Set<number>
    ) => {
      const cleanRef = refCode.replace(/@(PY|PM)$/i, '').trim().toUpperCase();
      if (!cleanRef) return;
      const depRowId = byCode.get(cleanRef);
      if (depRowId != null) dependencySet.add(depRowId);
      else unresolved.add(`${sourceLineItemCode} -> ${cleanRef}`);
    };

    for (const r of rows) {
      const rowId = r.row_id;
      const aggregationType = String(r.aggregation_type || '').toUpperCase();
      if (aggregationType !== 'EXPRESSION') {
        level.set(rowId, 1);
        deps.set(rowId, new Set());
        continue;
      }

      const dependencySet = new Set<number>();
      const sourceLineItemCode = String(r.line_item_code);
      const expr = String(r.expression ?? '');
      tokenRegex.lastIndex = 0;
      let m: RegExpExecArray | null = tokenRegex.exec(expr);
      while (m) {
        const token = String(m[1] ?? '').trim();
        let refType = reportTypeCode;
        let refCode = token;
        const colonAt = token.indexOf(':');
        if (colonAt > 0) {
          refType = token.slice(0, colonAt).trim().toUpperCase();
          refCode = token.slice(colonAt + 1).trim();
        }
        if (refType === reportTypeCode) {
          addSameReportDependency(sourceLineItemCode, refCode, dependencySet);
        }
        m = tokenRegex.exec(expr);
      }

      if (String(r.format_type || '').toUpperCase() === 'PERCENTAGE') {
        const numeratorCode = String(r.pct_numerator_code ?? '').trim();
        const denominatorCode = String(r.pct_denominator_code ?? '').trim();
        if (numeratorCode) addSameReportDependency(sourceLineItemCode, numeratorCode, dependencySet);
        if (denominatorCode) addSameReportDependency(sourceLineItemCode, denominatorCode, dependencySet);
      }

      deps.set(rowId, dependencySet);
      level.set(rowId, 1);
    }

    for (let i = 0; i < rows.length; i++) {
      let changed = false;
      for (const r of rows) {
        const rowId = r.row_id;
        const d = deps.get(rowId) || new Set<number>();
        let next = 1;
        for (const dep of d) next = Math.max(next, (level.get(dep) || 1) + 1);
        if ((level.get(rowId) || 1) !== next) {
          level.set(rowId, next);
          changed = true;
        }
      }
      if (!changed) break;
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();
    try {
      let updated = 0;
      for (const r of rows) {
        const next = level.get(r.row_id) || 1;
        if ((r.calculation_order ?? r.display_order) === next) continue;
        const request = new sql.Request(transaction);
        request.input('rowId', sql.Int, r.row_id);
        request.input('calculationOrder', sql.Int, next);
        await request.query(
          `UPDATE admin.fis_report_rows
           SET calculation_order = @calculationOrder, updated_at = GETDATE()
           WHERE row_id = @rowId`
        );
        updated++;
      }
      await transaction.commit();
      return { updated, unresolvedReferences: [...unresolved].sort() };
    } catch (err: unknown) {
      await transaction.rollback();
      const message = err instanceof Error ? err.message : 'Failed to auto-calculate calculation order';
      throw new FISServiceError(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Column definitions (Phase 3)
  // ---------------------------------------------------------------------------

  private static readonly CALCULATED_COLUMN_KINDS = new Set([
    'YTD_VARIANCE',
    'YTD_VAR_PCT',
    'CM_VARIANCE',
    'CM_VAR_PCT',
    'PERF_PCT',
    'AUDITED_PLACEHOLDER',
  ]);

  private columnDefSelectSql = `SELECT cd.column_def_id, cd.report_type_id, rt.report_type_code,
              cd.column_code, cd.column_label, cd.display_order, cd.column_kind, cd.period_scope,
              cd.tb_type, cd.reference_month, cd.fiscal_year_offset, cd.source_column_codes,
              cd.format_type, cd.header_background_color, cd.header_font_color,
              cd.is_active, cd.notes, cd.created_at, cd.updated_at
       FROM admin.fis_report_column_defs cd
       INNER JOIN admin.fis_report_types rt ON cd.report_type_id = rt.report_type_id`;

  private mapColumnDef(r: {
    column_def_id: number;
    report_type_id: number;
    report_type_code?: string;
    column_code: string;
    column_label: string;
    display_order: number;
    column_kind: string;
    period_scope: string;
    tb_type: string | null;
    reference_month: number | null;
    fiscal_year_offset: number;
    source_column_codes: string | null;
    format_type: string;
    header_background_color: string | null;
    header_font_color: string | null;
    is_active: boolean | number;
    notes: string | null;
    created_at?: Date;
    updated_at?: Date;
  }): FisReportColumnDef {
    return {
      columnDefId: r.column_def_id,
      reportTypeId: r.report_type_id,
      reportTypeCode: r.report_type_code,
      columnCode: r.column_code,
      columnLabel: r.column_label,
      displayOrder: r.display_order,
      columnKind: r.column_kind as FisColumnKind,
      periodScope: r.period_scope,
      tbType: r.tb_type as FisColumnTbType | null,
      referenceMonth: r.reference_month,
      fiscalYearOffset: r.fiscal_year_offset,
      sourceColumnCodes: r.source_column_codes,
      formatType: r.format_type,
      headerBackgroundColor: r.header_background_color ?? null,
      headerFontColor: r.header_font_color ?? null,
      isActive: r.is_active === true || r.is_active === 1,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  private async assertColumnDefDependencies(
    reportTypeId: number,
    columnCode: string
  ): Promise<void> {
    const result = await executeQuery<{ column_code: string }>(
      `SELECT column_code
       FROM admin.fis_report_column_defs
       WHERE report_type_id = @reportTypeId
         AND is_active = 1
         AND source_column_codes IS NOT NULL
         AND (
           source_column_codes = @columnCode
           OR source_column_codes LIKE @columnCodePrefix
           OR source_column_codes LIKE @columnCodeMiddle
           OR source_column_codes LIKE @columnCodeSuffix
         )`,
      {
        reportTypeId,
        columnCode,
        columnCodePrefix: `${columnCode},%`,
        columnCodeMiddle: `%,${columnCode},%`,
        columnCodeSuffix: `%,${columnCode}`,
      }
    );
    throwOnError(result.error);
    if (result.data?.length) {
      const dependents = result.data.map((r) => r.column_code).join(', ');
      throw new FISServiceError(
        `Cannot deactivate column ${columnCode}: required by calculated column(s): ${dependents}`,
        409
      );
    }
  }

  resolveColumnDefPeriods(
    def: Pick<
      FisReportColumnDef,
      | 'periodScope'
      | 'columnKind'
      | 'referenceMonth'
      | 'fiscalYearOffset'
      | 'tbType'
    >,
    asOfPeriod: string
  ): FisColumnDefPreviewRow['resolution'] {
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
    const skipTbQuery =
      calculated ||
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
      effectiveTbType:
        def.columnKind === 'APPROVED_BUDGET' ? 'BUDGET' : def.tbType,
    };
  }

  async getColumnDefsByReportType(reportTypeId: number, activeOnly = false): Promise<FisReportColumnDef[]> {
    const result = await executeQuery<Parameters<FISService['mapColumnDef']>[0]>(
      `${this.columnDefSelectSql}
       WHERE cd.report_type_id = @reportTypeId
         ${activeOnly ? 'AND cd.is_active = 1' : ''}
       ORDER BY cd.display_order`,
      { reportTypeId }
    );
    throwOnError(result.error);
    return (result.data || []).map((r) => this.mapColumnDef(r));
  }

  async getColumnDefPreview(
    reportTypeId: number,
    asOfPeriod: string
  ): Promise<FisColumnDefPreviewRow[]> {
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

  async createColumnDef(reportTypeId: number, data: Record<string, unknown>): Promise<number> {
    const columnCode = String(data.columnCode ?? data.column_code ?? '')
      .trim()
      .toUpperCase();
    const columnLabel = String(data.columnLabel ?? data.column_label ?? '').trim();
    const columnKind = String(data.columnKind ?? data.column_kind ?? 'TB_SUM')
      .trim()
      .toUpperCase() as FisColumnKind;
    const periodScope = String(data.periodScope ?? data.period_scope ?? 'YTD')
      .trim()
      .toUpperCase();

    if (!columnCode || !columnLabel) {
      throw new FISServiceError('columnCode and columnLabel are required', 400);
    }
    if (!/^[A-Z0-9_]+$/.test(columnCode)) {
      throw new FISServiceError('columnCode may only contain letters, numbers, and underscores', 400);
    }

    const maxOrder = await executeQuery<{ max_order: number | null }>(
      `SELECT MAX(display_order) AS max_order
       FROM admin.fis_report_column_defs
       WHERE report_type_id = @reportTypeId`,
      { reportTypeId }
    );
    throwOnError(maxOrder.error);
    const displayOrder =
      data.displayOrder !== undefined || data.display_order !== undefined
        ? toInt(data.displayOrder ?? data.display_order, 'displayOrder')
        : (Number(maxOrder.data?.[0]?.max_order) || 0) + 1;

    const tbTypeRaw = data.tbType ?? data.tb_type;
    const tbType =
      tbTypeRaw != null && String(tbTypeRaw).trim() !== ''
        ? String(tbTypeRaw).trim().toUpperCase()
        : null;

    const result = await executeQuery<{ column_def_id: number }>(
      `INSERT INTO admin.fis_report_column_defs (
         report_type_id, column_code, column_label, display_order,
         column_kind, period_scope, tb_type, reference_month, fiscal_year_offset,
         source_column_codes, format_type, notes
       )
       OUTPUT INSERTED.column_def_id
       VALUES (
         @reportTypeId, @columnCode, @columnLabel, @displayOrder,
         @columnKind, @periodScope, @tbType, @referenceMonth, @fiscalYearOffset,
         @sourceColumnCodes, @formatType, @notes
       )`,
      {
        reportTypeId,
        columnCode,
        columnLabel,
        displayOrder,
        columnKind,
        periodScope,
        tbType,
        referenceMonth:
          data.referenceMonth != null
            ? toInt(data.referenceMonth, 'referenceMonth')
            : data.reference_month != null
              ? toInt(data.reference_month, 'referenceMonth')
              : null,
        fiscalYearOffset: toInt(data.fiscalYearOffset ?? data.fiscal_year_offset ?? 0, 'fiscalYearOffset'),
        sourceColumnCodes:
          data.sourceColumnCodes != null
            ? String(data.sourceColumnCodes)
            : data.source_column_codes != null
              ? String(data.source_column_codes)
              : null,
        formatType: String(data.formatType ?? data.format_type ?? 'NUMBER'),
        notes: data.notes != null ? String(data.notes) : null,
      }
    );
    throwOnError(result.error);
    if (!result.data?.[0]?.column_def_id) {
      throw new FISServiceError('Failed to create column definition');
    }
    return result.data[0].column_def_id;
  }

  async updateColumnDef(columnDefId: number, data: Record<string, unknown>): Promise<FisReportColumnDef> {
    const existing = await executeQuery<{
      column_def_id: number;
      report_type_id: number;
      column_code: string;
      column_kind: string;
    }>(
      `SELECT column_def_id, report_type_id, column_code, column_kind
       FROM admin.fis_report_column_defs
       WHERE column_def_id = @columnDefId`,
      { columnDefId }
    );
    throwOnError(existing.error);
    if (!existing.data?.length) {
      throw new FISServiceError('Column definition not found', 404);
    }
    const current = existing.data[0];
    const isCalculated = FISService.CALCULATED_COLUMN_KINDS.has(current.column_kind);

    if (data.isActive === false || data.is_active === 0 || data.is_active === false) {
      await this.assertColumnDefDependencies(current.report_type_id, current.column_code);
    }

    const sets: string[] = [];
    const params: Record<string, unknown> = { columnDefId };

    const editableFields: Array<{ key: string; snake: string; transform?: (v: unknown) => unknown }> = [
      { key: 'columnLabel', snake: 'column_label' },
      { key: 'notes', snake: 'notes' },
      { key: 'formatType', snake: 'format_type' },
      { key: 'headerBackgroundColor', snake: 'header_background_color' },
      { key: 'headerFontColor', snake: 'header_font_color' },
      { key: 'isActive', snake: 'is_active', transform: (v) => toBit(v) },
    ];

    if (!isCalculated) {
      editableFields.push(
        { key: 'columnKind', snake: 'column_kind', transform: (v) => String(v).trim().toUpperCase() },
        { key: 'periodScope', snake: 'period_scope', transform: (v) => String(v).trim().toUpperCase() },
        { key: 'tbType', snake: 'tb_type', transform: (v) => (v == null || v === '' ? null : String(v).trim().toUpperCase()) },
        {
          key: 'referenceMonth',
          snake: 'reference_month',
          transform: (v) => (v == null || v === '' ? null : toInt(v, 'referenceMonth')),
        },
        { key: 'fiscalYearOffset', snake: 'fiscal_year_offset', transform: (v) => toInt(v, 'fiscalYearOffset') },
        { key: 'sourceColumnCodes', snake: 'source_column_codes' }
      );
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

    const update = await executeQuery(
      `UPDATE admin.fis_report_column_defs SET ${sets.join(', ')} WHERE column_def_id = @columnDefId`,
      params
    );
    throwOnError(update.error);

    const result = await executeQuery<Parameters<FISService['mapColumnDef']>[0]>(
      `${this.columnDefSelectSql} WHERE cd.column_def_id = @columnDefId`,
      { columnDefId }
    );
    throwOnError(result.error);
    if (!result.data?.length) {
      throw new FISServiceError('Column definition not found after update', 404);
    }
    return this.mapColumnDef(result.data[0]);
  }

  async softDeleteColumnDef(columnDefId: number): Promise<void> {
    const existing = await executeQuery<{ report_type_id: number; column_code: string }>(
      `SELECT report_type_id, column_code FROM admin.fis_report_column_defs WHERE column_def_id = @columnDefId`,
      { columnDefId }
    );
    throwOnError(existing.error);
    if (!existing.data?.length) {
      throw new FISServiceError('Column definition not found', 404);
    }
    await this.assertColumnDefDependencies(
      existing.data[0].report_type_id,
      existing.data[0].column_code
    );

    const result = await executeQuery(
      `UPDATE admin.fis_report_column_defs SET is_active = 0, updated_at = GETDATE() WHERE column_def_id = @columnDefId`,
      { columnDefId }
    );
    throwOnError(result.error);
  }

  async reorderColumnDefs(updates: Array<{ columnDefId: number; displayOrder: number }>): Promise<void> {
    if (!updates.length) return;

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();

    try {
      for (const u of updates) {
        const request = new sql.Request(transaction);
        request.input('columnDefId', sql.Int, u.columnDefId);
        await request.query(
          `UPDATE admin.fis_report_column_defs
           SET display_order = -column_def_id, updated_at = GETDATE()
           WHERE column_def_id = @columnDefId AND is_active = 1`
        );
      }

      for (const u of updates) {
        const request = new sql.Request(transaction);
        request.input('columnDefId', sql.Int, u.columnDefId);
        request.input('displayOrder', sql.Int, u.displayOrder);
        await request.query(
          `UPDATE admin.fis_report_column_defs
           SET display_order = @displayOrder, updated_at = GETDATE()
           WHERE column_def_id = @columnDefId AND is_active = 1`
        );
      }
      await transaction.commit();
    } catch (err: unknown) {
      await transaction.rollback();
      const message = err instanceof Error ? err.message : 'Failed to reorder column definitions';
      throw new FISServiceError(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Filter rules and criteria
  // ---------------------------------------------------------------------------

  async getRulesForRow(rowId: number): Promise<FisFilterRule[]> {
    const rulesResult = await executeQuery<{
      rule_id: number;
      row_id: number;
      rule_order: number;
      rule_label: string | null;
      tb_type_filter: string | null;
      amount_source: string;
      sign_override: number | null;
      is_active: boolean | number;
      notes: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT rule_id, row_id, rule_order, rule_label, tb_type_filter, amount_source,
              sign_override, is_active, notes, created_at, updated_at
       FROM admin.fis_row_filter_rules
       WHERE row_id = @rowId AND is_active = 1
       ORDER BY rule_order`,
      { rowId }
    );
    throwOnError(rulesResult.error);

    const criteriaResult = await executeQuery<{
      criterion_id: number;
      rule_id: number;
      dimension: string;
      filter_type: string;
      value_single: string | null;
      value_list: string | null;
      value_range_from: string | null;
      value_range_to: string | null;
      is_active: boolean | number;
    }>(
      `SELECT rc.criterion_id, rc.rule_id, rc.dimension, rc.filter_type,
              rc.value_single, rc.value_list, rc.value_range_from, rc.value_range_to, rc.is_active
       FROM admin.fis_rule_criteria rc
       INNER JOIN admin.fis_row_filter_rules rfr ON rc.rule_id = rfr.rule_id
       WHERE rfr.row_id = @rowId AND rfr.is_active = 1 AND rc.is_active = 1
       ORDER BY rc.rule_id, rc.criterion_id`,
      { rowId }
    );
    throwOnError(criteriaResult.error);

    const criteriaByRule = new Map<number, FisRuleCriterion[]>();
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

  async createRule(rowId: number, data: Record<string, unknown>): Promise<number> {
    const criteria = (data.criteria as FisRuleCriterion[] | undefined) || [];

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
      insertRule.input(
        'signOverride',
        sql.Int,
        data.signOverride != null ? toInt(data.signOverride, 'signOverride') : data.sign_override != null ? toInt(data.sign_override, 'signOverride') : null
      );
      insertRule.input('notes', sql.NVarChar(500), data.notes ?? null);

      const ruleResult = await insertRule.query<{ rule_id: number }>(
        `INSERT INTO admin.fis_row_filter_rules (
           row_id, rule_order, rule_label, tb_type_filter, amount_source, sign_override, notes
         )
         OUTPUT INSERTED.rule_id
         VALUES (@rowId, @ruleOrder, @ruleLabel, @tbTypeFilter, @amountSource, @signOverride, @notes)`
      );

      const ruleId = ruleResult.recordset?.[0]?.rule_id;
      if (!ruleId) throw new FISServiceError('Failed to create rule');

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
        await req.query(
          `INSERT INTO admin.fis_rule_criteria (
             rule_id, dimension, filter_type, value_single, value_list, value_range_from, value_range_to
           ) VALUES (@ruleId, @dimension, @filterType, @valueSingle, @valueList, @valueRangeFrom, @valueRangeTo)`
        );
      }

      await transaction.commit();
      return ruleId;
    } catch (err: unknown) {
      await transaction.rollback();
      if (err instanceof FISServiceError) throw err;
      throw new FISServiceError(err instanceof Error ? err.message : 'Failed to create rule');
    }
  }

  async updateRule(ruleId: number, data: Record<string, unknown>): Promise<void> {
    const sets: string[] = [];
    const params: Record<string, unknown> = { ruleId };

    const fields: Array<{ key: string; snake: string; transform?: (v: unknown) => unknown }> = [
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

    const result = await executeQuery(
      `UPDATE admin.fis_row_filter_rules SET ${sets.join(', ')} WHERE rule_id = @ruleId`,
      params
    );
    throwOnError(result.error);
  }

  async softDeleteRule(ruleId: number): Promise<void> {
    const result = await executeQuery(
      `UPDATE admin.fis_row_filter_rules SET is_active = 0, updated_at = GETDATE() WHERE rule_id = @ruleId`,
      { ruleId }
    );
    throwOnError(result.error);
  }

  async replaceRuleCriteria(ruleId: number, criteria: FisRuleCriterion[]): Promise<void> {
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
        await req.query(
          `INSERT INTO admin.fis_rule_criteria (
             rule_id, dimension, filter_type, value_single, value_list, value_range_from, value_range_to
           ) VALUES (@ruleId, @dimension, @filterType, @valueSingle, @valueList, @valueRangeFrom, @valueRangeTo)`
        );
      }

      const touch = new sql.Request(transaction);
      touch.input('ruleId', sql.Int, ruleId);
      await touch.query(
        `UPDATE admin.fis_row_filter_rules SET updated_at = GETDATE() WHERE rule_id = @ruleId`
      );

      await transaction.commit();
    } catch (err: unknown) {
      await transaction.rollback();
      throw new FISServiceError(err instanceof Error ? err.message : 'Failed to replace criteria');
    }
  }

  // ---------------------------------------------------------------------------
  // Instances
  // ---------------------------------------------------------------------------

  async getInstances(): Promise<FisReportInstanceSummary[]> {
    const result = await executeQuery<{
      instance_id: number;
      report_type_id: number;
      instance_name: string;
      country_scope: string;
      base_currency: string | null;
      is_active: boolean | number;
      created_at: Date;
      created_by: string | null;
      entity_codes: string | null;
      column_count: number;
    }>(
      `SELECT i.instance_id, i.report_type_id, i.instance_name, i.country_scope, i.base_currency,
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
       ORDER BY i.instance_name`
    );
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

  async getInstance(instanceId: number): Promise<FisReportInstanceDetail> {
    const instResult = await executeQuery<{
      instance_id: number;
      report_type_id: number;
      instance_name: string;
      country_scope: string;
      base_currency: string | null;
      is_active: boolean | number;
      created_at: Date;
      created_by: string | null;
    }>(
      `SELECT instance_id, report_type_id, instance_name, country_scope, base_currency,
              is_active, created_at, created_by
       FROM admin.fis_report_instances
       WHERE instance_id = @instanceId AND is_active = 1`,
      { instanceId }
    );
    throwOnError(instResult.error);
    if (!instResult.data?.length) {
      throw new FISServiceError('Report instance not found', 404);
    }

    const inst = instResult.data[0];

    const countriesResult = await executeQuery<{ entity_code: string }>(
      `SELECT entity_code FROM admin.fis_instance_countries WHERE instance_id = @instanceId ORDER BY entity_code`,
      { instanceId }
    );
    throwOnError(countriesResult.error);

    const columnsResult = await executeQuery<{
      column_id: number;
      instance_id: number;
      column_order: number;
      column_label: string;
      fiscal_year: number;
      fiscal_month_from: number;
      fiscal_month_to: number;
      is_ytd: boolean | number;
      tb_type: string | null;
      column_kind: string;
    }>(
      `SELECT column_id, instance_id, column_order, column_label,
              fiscal_year, fiscal_month_from, fiscal_month_to, is_ytd,
              tb_type, ISNULL(column_kind, 'TB_SUM') AS column_kind
       FROM admin.fis_report_columns
       WHERE instance_id = @instanceId
       ORDER BY column_order`,
      { instanceId }
    );
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
        tbType: c.tb_type as FisColumnTbType | null,
        columnKind: (c.column_kind || 'TB_SUM') as FisColumnKind,
      })),
    };
  }

  private async insertReportColumn(
    transaction: sql.Transaction,
    instanceId: number,
    col: FisMonthColumnDef | FisReportColumn
  ): Promise<void> {
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
    await req.query(
      `INSERT INTO admin.fis_report_columns (
         instance_id, column_order, column_label, fiscal_year,
         fiscal_month_from, fiscal_month_to, is_ytd, tb_type, column_kind
       ) VALUES (
         @instanceId, @columnOrder, @columnLabel, @fiscalYear,
         @fiscalMonthFrom, @fiscalMonthTo, @isYtd, @tbType, @columnKind
       )`
    );
  }

  /**
   * Normalize column_order: Budget before Actual within each month block.
   * Runs after inserts and before generate so upload/file order never affects display.
   */
  async reorderInstanceColumns(instanceId: number): Promise<void> {
    const result = await executeQuery<{
      column_id: number;
      fiscal_year: number;
      fiscal_month_to: number;
      is_ytd: boolean | number;
      tb_type: string | null;
      column_kind: string;
      column_label: string;
    }>(
      `SELECT column_id, fiscal_year, fiscal_month_to, is_ytd, tb_type,
              ISNULL(column_kind, 'TB_SUM') AS column_kind, column_label
       FROM admin.fis_report_columns
       WHERE instance_id = @instanceId`,
      { instanceId }
    );
    throwOnError(result.error);
    const rows = result.data || [];
    if (rows.length <= 1) return;

    const toSortInput = (row: (typeof rows)[0]) => ({
      fiscalYear: row.fiscal_year,
      fiscalMonthTo: row.fiscal_month_to,
      isYtd: row.is_ytd === true || row.is_ytd === 1,
      tbType: row.tb_type as FisColumnTbType | null,
      columnKind: (row.column_kind || 'TB_SUM') as FisColumnKind,
      columnLabel: row.column_label,
    });

    const sorted = [...rows].sort((a, b) =>
      compareFisReportColumns(toSortInput(a), toSortInput(b))
    );

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();
    try {
      const resetReq = new sql.Request(transaction);
      resetReq.input('instanceId', sql.Int, instanceId);
      await resetReq.query(
        `UPDATE admin.fis_report_columns
         SET column_order = -column_id
         WHERE instance_id = @instanceId`
      );

      let order = 1;
      for (const row of sorted) {
        const req = new sql.Request(transaction);
        req.input('columnId', sql.Int, row.column_id);
        req.input('columnOrder', sql.Int, order++);
        await req.query(
          `UPDATE admin.fis_report_columns SET column_order = @columnOrder WHERE column_id = @columnId`
        );
      }

      await transaction.commit();
    } catch (err: unknown) {
      await transaction.rollback();
      if (err instanceof FISServiceError) throw err;
      throw new FISServiceError(
        err instanceof Error ? err.message : 'Failed to reorder report columns'
      );
    }
  }

  /** Append six month columns if this period is not already on the instance. */
  async appendMonthColumnsForPeriod(instanceId: number, period: string): Promise<number> {
    const periodNorm = period.trim();
    const fiscalYear = parseInt(periodNorm.slice(0, 4), 10);
    const fiscalMonth = parseInt(periodNorm.slice(4, 6), 10);

    const existing = await executeQuery<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt
       FROM admin.fis_report_columns
       WHERE instance_id = @instanceId
         AND fiscal_year = @fiscalYear
         AND fiscal_month_from = @fiscalMonth
         AND fiscal_month_to = @fiscalMonth
         AND is_ytd = 0
         AND tb_type = 'ACTUAL'
         AND ISNULL(column_kind, 'TB_SUM') = 'TB_SUM'`,
      { instanceId, fiscalYear, fiscalMonth }
    );
    throwOnError(existing.error);
    if (existing.data?.[0]?.cnt) {
      return 0;
    }

    const maxOrderResult = await executeQuery<{ max_order: number | null }>(
      `SELECT MAX(column_order) AS max_order FROM admin.fis_report_columns WHERE instance_id = @instanceId`,
      { instanceId }
    );
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
    } catch (err: unknown) {
      await transaction.rollback();
      if (err instanceof FISServiceError) throw err;
      throw new FISServiceError(
        err instanceof Error ? err.message : 'Failed to append report columns'
      );
    }
  }

  async ensureInstanceEntity(instanceId: number, entityCode: string): Promise<void> {
    const entity = entityCode.trim().toUpperCase();
    const result = await executeQuery(
      `IF NOT EXISTS (
         SELECT 1 FROM admin.fis_instance_countries
         WHERE instance_id = @instanceId AND entity_code = @entity
       )
       INSERT INTO admin.fis_instance_countries (instance_id, entity_code)
       VALUES (@instanceId, @entity)`,
      { instanceId, entity }
    );
    throwOnError(result.error);
  }

  async createInstance(data: Record<string, unknown>): Promise<number> {
    const entityCodes = (data.entityCodes ?? data.entity_codes) as string[] | undefined;
    const columns = (data.columns as FisReportColumn[] | undefined) || [];

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

      const instResult = await insReq.query<{ instance_id: number }>(
        `INSERT INTO admin.fis_report_instances (
           report_type_id, instance_name, country_scope, base_currency, created_by
         )
         OUTPUT INSERTED.instance_id
         VALUES (@reportTypeId, @instanceName, @countryScope, @baseCurrency, @createdBy)`
      );

      const instanceId = instResult.recordset?.[0]?.instance_id;
      if (!instanceId) throw new FISServiceError('Failed to create instance');

      for (const code of entityCodes || []) {
        const req = new sql.Request(transaction);
        req.input('instanceId', sql.Int, instanceId);
        req.input('entityCode', sql.NVarChar(4), String(code).trim());
        await req.query(
          `INSERT INTO admin.fis_instance_countries (instance_id, entity_code) VALUES (@instanceId, @entityCode)`
        );
      }

      for (const col of columns) {
        await this.insertReportColumn(transaction, instanceId, col);
      }

      await transaction.commit();
      if (columns.length > 0) {
        await this.reorderInstanceColumns(instanceId);
      }
      return instanceId;
    } catch (err: unknown) {
      await transaction.rollback();
      if (err instanceof FISServiceError) throw err;
      throw new FISServiceError(err instanceof Error ? err.message : 'Failed to create instance');
    }
  }

  async updateInstance(instanceId: number, data: Record<string, unknown>): Promise<void> {
    const entityCodes = data.entityCodes ?? data.entity_codes;
    const columns = data.columns;

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();

    try {
      const sets: string[] = [];
      const params: Record<string, unknown> = { instanceId };

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
          if (k === 'instanceId') updReq.input(k, sql.Int, v);
          else if (typeof v === 'number') updReq.input(k, sql.Int, v);
          else updReq.input(k, sql.NVarChar(sql.MAX), v);
        });
        await updReq.query(
          `UPDATE admin.fis_report_instances SET ${sets.join(', ')} WHERE instance_id = @instanceId AND is_active = 1`
        );
      }

      if (entityCodes !== undefined) {
        const delC = new sql.Request(transaction);
        delC.input('instanceId', sql.Int, instanceId);
        await delC.query(`DELETE FROM admin.fis_instance_countries WHERE instance_id = @instanceId`);

        for (const code of entityCodes as string[]) {
          const req = new sql.Request(transaction);
          req.input('instanceId', sql.Int, instanceId);
          req.input('entityCode', sql.NVarChar(4), String(code).trim());
          await req.query(
            `INSERT INTO admin.fis_instance_countries (instance_id, entity_code) VALUES (@instanceId, @entityCode)`
          );
        }
      }

      if (columns !== undefined) {
        const delCol = new sql.Request(transaction);
        delCol.input('instanceId', sql.Int, instanceId);
        await delCol.query(`DELETE FROM admin.fis_report_columns WHERE instance_id = @instanceId`);

        for (const col of columns as FisReportColumn[]) {
          await this.insertReportColumn(transaction, instanceId, col);
        }
      }

      await transaction.commit();
      if (columns !== undefined) {
        await this.reorderInstanceColumns(instanceId);
      }
    } catch (err: unknown) {
      await transaction.rollback();
      if (err instanceof FISServiceError) throw err;
      throw new FISServiceError(err instanceof Error ? err.message : 'Failed to update instance');
    }
  }

  async softDeleteInstance(instanceId: number): Promise<void> {
    const result = await executeQuery(
      `UPDATE admin.fis_report_instances SET is_active = 0 WHERE instance_id = @instanceId`,
      { instanceId }
    );
    throwOnError(result.error);
  }

  async generateReport(
    instanceId: number,
    scope?: { entityCode: string; period: string }
  ): Promise<{ instanceId: number; outputRowCount: number; entityCode?: string; period?: string }> {
    const check = await executeQuery<{ instance_id: number }>(
      `SELECT instance_id FROM admin.fis_report_instances WHERE instance_id = @instanceId AND is_active = 1`,
      { instanceId }
    );
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
      } catch (err) {
        throw new FISServiceError(
          err instanceof Error ? err.message : 'No trial balance data for scope',
          400
        );
      }

      await this.ensureInstanceEntity(instanceId, entity);
      const appended = await this.appendMonthColumnsForPeriod(instanceId, period);
      if (appended === 0) {
        const hasColumns = await executeQuery<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM admin.fis_report_columns WHERE instance_id = @instanceId`,
          { instanceId }
        );
        throwOnError(hasColumns.error);
        if (!hasColumns.data?.[0]?.cnt) {
          throw new FISServiceError(
            `No report columns on instance ${instanceId}. Create the instance for ${period} first.`,
            400
          );
        }
      }
    }

    await this.reorderInstanceColumns(instanceId);

    const result = await executeProcedure('rp.usp_GenerateFISReportByInstance', { instance_id: instanceId });
    throwOnError(result.error);

    const countResult = await executeQuery<{ total: number }>(
      `SELECT COUNT(*) AS total FROM rp.fis_report_output WHERE instance_id = @instanceId`,
      { instanceId }
    );
    throwOnError(countResult.error);

    return {
      instanceId,
      outputRowCount: Number(countResult.data?.[0]?.total) || 0,
      entityCode: scope?.entityCode.trim().toUpperCase(),
      period: scope?.period.trim(),
    };
  }

  /** Run-key generation — server-side batched SP calls (fast path). */
  async generateReportByRunKey(
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
    const ctx = await this.prepareRunKeyGeneration(
      reportTypeCode,
      entityCode,
      asOfPeriod,
      triggeredBy,
      true
    );

    return withFisProcessLog(
      {
        runId: ctx.runId,
        entity: ctx.entity,
        asOfPeriod: ctx.period,
        reportTypeCode: ctx.reportType,
        actualUploadId: ctx.actualUploadId,
        budgetUploadId: ctx.budgetUploadId,
      },
      async () => {
        try {
          onProgress?.({ phase: 'init', current: 0, total: 1, label: 'Clearing prior output' });
          await this.executeGenerateMode(ctx.procParams, 'INIT');

          await this.runSumColumnChunks(ctx, onProgress);

          await this.runFinalizeChunks(ctx, onProgress);

          if (ctx.reportType === 'BS') {
            if (isFisPreviousYearPeriod(ctx.period)) {
              await syncBsPreviousYearColumn({
                entityCode: ctx.entity,
                period: ctx.period,
                fileStatus: ctx.fileStatus,
                outputTable: 'live',
              });
            } else {
              await restoreBsPreviousYearAfterMonthlyRun({
                entityCode: ctx.entity,
                asOfPeriod: ctx.period,
                fileStatus: ctx.fileStatus,
                outputTable: 'live',
              });
            }
          }

          const outputRowCount = await this.countRunKeyOutput(ctx);
          await completeReportRun(ctx.runId, true, outputRowCount);

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
          if (err instanceof FISServiceError) throw err;
          throw new FISServiceError(message);
        }
      }
    );
  }

  /** Generate multiple run-key reports in NF → BS → PL → CF order. */
  async generateReportsByRunKey(
    reportTypeCodes: string[],
    entityCode: string,
    asOfPeriod: string,
    triggeredBy?: string | null,
    onProgress?: (progress: FisGenerationJobProgress) => void
  ): Promise<{
    entityCode: string;
    asOfPeriod: string;
    reports: Array<{ reportTypeCode: string; outputRowCount: number }>;
    fileStatus?: FisFileStatus;
    isTbLocked?: boolean;
  }> {
    const ordered = assertReportTypesAllowedForPeriod(reportTypeCodes, asOfPeriod);

    const reports: Array<{ reportTypeCode: string; outputRowCount: number }> = [];
    let fileStatus: FisFileStatus | undefined;
    let isTbLocked = false;

    for (let i = 0; i < ordered.length; i++) {
      const reportType = ordered[i];
      const batchIndex = i + 1;
      const batchTotal = ordered.length;

      const result = await this.generateReportByRunKey(
        reportType,
        entityCode,
        asOfPeriod,
        triggeredBy,
        (inner) => {
          onProgress?.({
            ...inner,
            reportTypeCode: reportType,
            batchIndex,
            batchTotal,
          });
        }
      );

      reports.push({
        reportTypeCode: result.reportTypeCode,
        outputRowCount: result.outputRowCount,
      });
      if (result.fileStatus) fileStatus = result.fileStatus;
      if (result.isTbLocked != null) isTbLocked = result.isTbLocked;
    }

    return {
      entityCode: entityCode.trim().toUpperCase(),
      asOfPeriod: asOfPeriod.trim(),
      reports,
      ...(fileStatus ? { fileStatus, isTbLocked } : {}),
    };
  }

  /** TB-backed columns for chunked SUM progress (matches SP column cursor). */
  async getTbSumColumnsForRunKey(
    reportTypeCode: string,
    asOfPeriod: string
  ): Promise<
    Array<{ columnKey: number; columnCode: string; columnLabel: string; displayOrder: number }>
  > {
    const reportType = reportTypeCode.trim().toUpperCase();
    const period = asOfPeriod.trim();
    if (!/^\d{6}$/.test(period)) {
      throw new FISServiceError('asOfPeriod must be YYYYMM', 400);
    }
    const reportMonth = parseInt(period.slice(4, 6), 10);
    const previousYear = isFisPreviousYearPeriod(period);

    const result = await executeQuery<{
      column_key: number;
      column_code: string;
      column_label: string;
      display_order: number;
      calculation_order: number | null;
    }>(
      previousYear
        ? `SELECT d.column_def_id AS column_key, d.column_code, d.column_label, d.display_order
           FROM admin.fis_report_column_defs d
           INNER JOIN admin.fis_report_types rt ON d.report_type_id = rt.report_type_id
           WHERE rt.report_type_code = @reportType
             AND rt.is_active = 1
             AND d.is_active = 1
             AND d.column_kind IN ('TB_SUM', 'APPROVED_BUDGET', 'POINT_IN_TIME')
             AND (d.column_code = N'PREVIOUS_YEAR' OR d.period_scope = N'PY')
           ORDER BY d.display_order`
        : `SELECT d.column_def_id AS column_key, d.column_code, d.column_label, d.display_order
           FROM admin.fis_report_column_defs d
           INNER JOIN admin.fis_report_types rt ON d.report_type_id = rt.report_type_id
           WHERE rt.report_type_code = @reportType
             AND rt.is_active = 1
             AND d.is_active = 1
             AND d.column_kind IN ('TB_SUM', 'APPROVED_BUDGET', 'POINT_IN_TIME')
             AND ISNULL(d.column_code, N'') <> N'PREVIOUS_YEAR'
             AND ISNULL(d.period_scope, N'') <> N'PY'
             AND NOT (
               d.column_kind = 'POINT_IN_TIME'
               AND d.period_scope = 'MONTH'
               AND d.reference_month > @reportMonth
             )
           ORDER BY d.display_order`,
      previousYear ? { reportType } : { reportType, reportMonth }
    );
    throwOnError(result.error);
    return (result.data || []).map((r) => ({
      columnKey: r.column_key,
      columnCode: r.column_code,
      columnLabel: r.column_label,
      displayOrder: r.display_order,
    }));
  }

  /** SUM rows from report row config — used for chunked generation progress. */
  async getSumRowsForRunKey(reportTypeCode: string): Promise<
    Array<{ rowId: number; lineItemCode: string; lineItemLabel: string; displayOrder: number }>
  > {
    const reportType = reportTypeCode.trim().toUpperCase();
    if (!reportType) {
      throw new FISServiceError('reportTypeCode is required', 400);
    }

    const result = await executeQuery<{
      row_id: number;
      line_item_code: string;
      line_item_label: string;
      display_order: number;
    }>(
      `SELECT rr.row_id, rr.line_item_code, rr.line_item_label, rr.display_order, rr.calculation_order
       FROM admin.fis_report_rows rr
       INNER JOIN admin.fis_report_types rt ON rr.report_type_id = rt.report_type_id
       WHERE rt.report_type_code = @reportType
         AND rt.is_active = 1
         AND rr.is_active = 1
         AND rr.aggregation_type = 'SUM'
       ORDER BY ISNULL(rr.calculation_order, rr.display_order), rr.display_order`,
      { reportType }
    );
    throwOnError(result.error);
    return (result.data || []).map((r) => ({
      rowId: r.row_id,
      lineItemCode: r.line_item_code,
      lineItemLabel: r.line_item_label,
      displayOrder: r.display_order,
    }));
  }

  /** Calculated columns (variance / perf %) for chunked finalize. */
  async getVarianceColumnsForRunKey(reportTypeCode: string): Promise<
    Array<{ columnKey: number; columnCode: string; columnLabel: string; displayOrder: number }>
  > {
    const reportType = reportTypeCode.trim().toUpperCase();
    const result = await executeQuery<{
      column_key: number;
      column_code: string;
      column_label: string;
      display_order: number;
      calculation_order: number | null;
    }>(
      `SELECT d.column_def_id AS column_key, d.column_code, d.column_label, d.display_order
       FROM admin.fis_report_column_defs d
       INNER JOIN admin.fis_report_types rt ON d.report_type_id = rt.report_type_id
       WHERE rt.report_type_code = @reportType
         AND rt.is_active = 1
         AND d.is_active = 1
         AND d.column_kind IN ('YTD_VARIANCE', 'YTD_VAR_PCT', 'CM_VARIANCE', 'CM_VAR_PCT', 'PERF_PCT', 'AUDITED_PLACEHOLDER')
       ORDER BY d.display_order`,
      { reportType }
    );
    throwOnError(result.error);
    return (result.data || []).map((r) => ({
      columnKey: r.column_key,
      columnCode: r.column_code,
      columnLabel: r.column_label,
      displayOrder: r.display_order,
    }));
  }

  /** Expression rows for chunked finalize. */
  async getExpressionRowsForRunKey(reportTypeCode: string): Promise<
    Array<{ rowId: number; lineItemCode: string; lineItemLabel: string; displayOrder: number }>
  > {
    const reportType = reportTypeCode.trim().toUpperCase();
    const result = await executeQuery<{
      row_id: number;
      line_item_code: string;
      line_item_label: string;
      display_order: number;
    }>(
      `SELECT rr.row_id, rr.line_item_code, rr.line_item_label, rr.display_order, rr.calculation_order
       FROM admin.fis_report_rows rr
       INNER JOIN admin.fis_report_types rt ON rr.report_type_id = rt.report_type_id
       WHERE rt.report_type_code = @reportType
         AND rt.is_active = 1
         AND rr.is_active = 1
         AND rr.aggregation_type = 'EXPRESSION'
       ORDER BY ISNULL(rr.calculation_order, rr.display_order), rr.display_order`,
      { reportType }
    );
    throwOnError(result.error);
    return (result.data || []).map((r) => ({
      rowId: r.row_id,
      lineItemCode: r.line_item_code,
      lineItemLabel: r.line_item_label,
      displayOrder: r.display_order,
    }));
  }

  /** Single chunk of run-key generation. */
  async generateReportRunKeyChunk(params: {
    phase:
      | 'init'
      | 'row'
      | 'finalize-pit'
      | 'finalize-variance'
      | 'finalize-expression'
      | 'finalize-normalize';
    reportTypeCode: string;
    entityCode: string;
    asOfPeriod: string;
    rowId?: number;
    columnKey?: number;
    runId?: number | null;
    triggeredBy?: string | null;
  }): Promise<{
    reportTypeCode: string;
    entityCode: string;
    asOfPeriod: string;
    phase: string;
    runId?: number | null;
    fileStatus?: FisFileStatus;
    isTbLocked?: boolean;
    outputRowCount?: number;
    sumRows?: Array<{ rowId: number; lineItemCode: string; lineItemLabel: string; displayOrder: number }>;
    varianceColumns?: Array<{ columnKey: number; columnCode: string; columnLabel: string; displayOrder: number }>;
    expressionRows?: Array<{ rowId: number; lineItemCode: string; lineItemLabel: string; displayOrder: number }>;
  }> {
    const phase = params.phase;
    const ctx = await this.prepareRunKeyGeneration(
      params.reportTypeCode,
      params.entityCode,
      params.asOfPeriod,
      params.triggeredBy,
      phase === 'init'
    );

    const runId = phase === 'init' ? ctx.runId : params.runId ?? null;
    const isFinalizePhase = phase.startsWith('finalize-');

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
          varianceColumns: ctx.varianceColumns,
          expressionRows: ctx.expressionRows,
          ...(ctx.phase4 ? { fileStatus: ctx.fileStatus, isTbLocked: ctx.isTbLocked } : {}),
        };
      }

      if (phase === 'row') {
        if (params.rowId == null) {
          throw new FISServiceError('rowId is required for row phase', 400);
        }
        await this.executeGenerateMode(ctx.procParams, 'SUM_ROW', { targetRowId: params.rowId });
        return {
          reportTypeCode: ctx.reportType,
          entityCode: ctx.entity,
          asOfPeriod: ctx.period,
          phase,
          runId,
        };
      }

      if (phase === 'finalize-pit') {
        await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_PIT');
      } else if (phase === 'finalize-variance') {
        if (params.columnKey == null) {
          throw new FISServiceError('columnKey is required for finalize-variance', 400);
        }
        await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_VARIANCE', {
          targetColumnKey: params.columnKey,
          ...(params.rowId != null ? { targetRowId: params.rowId } : {}),
        });
      } else if (phase === 'finalize-expression') {
        if (params.rowId == null) {
          throw new FISServiceError('rowId is required for finalize-expression', 400);
        }
        await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_EXPRESSION', {
          targetRowId: params.rowId,
        });
      } else if (phase === 'finalize-normalize') {
        await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_NORMALIZE');
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
      } else {
        throw new FISServiceError(`Unsupported chunk phase: ${phase}`, 400);
      }

      return {
        reportTypeCode: ctx.reportType,
        entityCode: ctx.entity,
        asOfPeriod: ctx.period,
        phase,
        runId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isFinalizePhase) {
        await completeReportRun(runId, false, 0, message);
      }
      if (err instanceof FISServiceError) throw err;
      throw new FISServiceError(message);
    }
  }

  private async runSumColumnChunks(
    ctx: {
      procParams: Record<string, unknown>;
      tbSumColumns: Array<{ columnKey: number; columnLabel: string }>;
    },
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
    ctx: {
      procParams: Record<string, unknown>;
      varianceColumns: Array<{ columnKey: number; columnLabel: string }>;
    },
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
    await this.executeGenerateMode(ctx.procParams, 'POSTPROCESS_NORMALIZE');
  }

  private async prepareRunKeyGeneration(
    reportTypeCode: string,
    entityCode: string,
    asOfPeriod: string,
    triggeredBy?: string | null,
    startRun = false
  ): Promise<{
    reportType: string;
    entity: string;
    period: string;
    procParams: Record<string, unknown>;
    phase4: boolean;
    fileStatus?: FisFileStatus;
    isTbLocked: boolean;
    runId: number | null;
    actualUploadId: number | null;
    budgetUploadId: number | null;
    sumRows: Array<{ rowId: number; lineItemCode: string; lineItemLabel: string; displayOrder: number }>;
    tbSumColumns: Array<{ columnKey: number; columnCode: string; columnLabel: string; displayOrder: number }>;
    varianceColumns: Array<{ columnKey: number; columnCode: string; columnLabel: string; displayOrder: number }>;
    expressionRows: Array<{ rowId: number; lineItemCode: string; lineItemLabel: string; displayOrder: number }>;
  }> {
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
    if (isFisPreviousYearPeriod(period) && reportType !== 'BS') {
      throw new FISServiceError(
        `Period ${period} (Previous Year) can only generate BS, not ${reportType}.`,
        400
      );
    }

    const typeCheck = await executeQuery<{ report_type_id: number }>(
      `SELECT report_type_id FROM admin.fis_report_types
       WHERE report_type_code = @reportType AND is_active = 1`,
      { reportType }
    );
    throwOnError(typeCheck.error);
    if (!typeCheck.data?.length) {
      throw new FISServiceError(`Report type ${reportType} not found`, 404);
    }

    try {
      await assertTrialBalanceDataForPeriod(entity, period);
    } catch (err) {
      throw new FISServiceError(
        err instanceof Error ? err.message : 'No trial balance data for scope',
        400
      );
    }

    const phase4 = isFisPhase4Enabled();
    let fileStatus: FisFileStatus | undefined;
    let isTbLocked = false;
    let runId: number | null = null;
    let actualUploadId: number | null = null;
    let budgetUploadId: number | null = null;
    let runLoggingContext: {
      fileStatus: FisFileStatus;
      actualUploadId: number | null;
      budgetUploadId: number | null;
      actualFileName: string | null;
      budgetFileName: string | null;
      actualTbStatus: FisFileStatus | null;
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

    if (runLoggingContext) {
      actualUploadId = runLoggingContext.actualUploadId;
      budgetUploadId = runLoggingContext.budgetUploadId;
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
      if (actualUploadId == null) actualUploadId = resolved.actualUploadId;
      if (budgetUploadId == null) budgetUploadId = resolved.budgetUploadId;
    }
    if (fileStatus) {
      procParams.file_status = fileStatus;
    }

    const sumRows = await this.getSumRowsForRunKey(reportType);
    const tbSumColumns = await this.getTbSumColumnsForRunKey(reportType, period);
    const varianceColumns = await this.getVarianceColumnsForRunKey(reportType);
    const expressionRows = await this.getExpressionRowsForRunKey(reportType);

    return {
      reportType,
      entity,
      period,
      procParams,
      phase4,
      fileStatus,
      isTbLocked,
      runId,
      actualUploadId,
      budgetUploadId,
      sumRows,
      tbSumColumns,
      varianceColumns,
      expressionRows,
    };
  }

  private async executeGenerateMode(
    procParams: Record<string, unknown>,
    generationMode:
      | 'INIT'
      | 'SUM_ROW'
      | 'SUM_COLUMN'
      | 'SUM_ALL'
      | 'POSTPROCESS'
      | 'POSTPROCESS_PIT'
      | 'POSTPROCESS_VARIANCE'
      | 'POSTPROCESS_EXPRESSION'
      | 'POSTPROCESS_NORMALIZE'
      | 'FULL',
    targets?: { targetRowId?: number; targetColumnKey?: number }
  ): Promise<void> {
    const params = {
      ...procParams,
      generation_mode: generationMode,
      ...(targets?.targetRowId != null ? { target_row_id: targets.targetRowId } : {}),
      ...(targets?.targetColumnKey != null ? { target_column_key: targets.targetColumnKey } : {}),
    };
    const result = await executeProcedure('rp.usp_GenerateFISReport', params);
    throwOnError(result.error);
  }

  private async countRunKeyOutput(ctx: {
    reportType: string;
    entity: string;
    period: string;
    phase4: boolean;
    fileStatus?: FisFileStatus;
  }): Promise<number> {
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
    const countParams: Record<string, unknown> = {
      reportType: ctx.reportType,
      entity: ctx.entity,
      period: ctx.period,
    };
    if (ctx.phase4 && ctx.fileStatus) {
      countParams.fileStatus = ctx.fileStatus;
    }

    const countResult = await executeQuery<{ total: number }>(countSql, countParams);
    throwOnError(countResult.error);
    return Number(countResult.data?.[0]?.total) || 0;
  }

  // ---------------------------------------------------------------------------
  // Dictionary autocomplete
  // ---------------------------------------------------------------------------

  async getDictionaryCodes(
    dictionaryType: string,
    entity?: string,
    search?: string
  ): Promise<DictionaryCodeItem[]> {
    let query = `
      SELECT TOP 100 dim_id, code, description
      FROM FIN.DimCode
      WHERE dictionary_type = @dictionaryType
        AND dim_id <> 0
        AND is_sentinel = 0
        AND (
          suspended IS NULL
          OR LTRIM(RTRIM(suspended)) = ''
          OR UPPER(LTRIM(RTRIM(suspended))) NOT IN ('YES', 'Y', 'TRUE', '1', 'SUSPENDED')
        )
    `;
    const params: Record<string, unknown> = { dictionaryType };

    if (entity) {
      query += ` AND (entity IS NULL OR LTRIM(RTRIM(entity)) = '' OR entity = @entity)`;
      params.entity = entity;
    }

    if (search && search.trim()) {
      query += ` AND (code LIKE @search OR description LIKE @search)`;
      params.search = `%${search.trim()}%`;
    }

    query += ` ORDER BY code`;

    const result = await executeQuery<{ dim_id: number; code: string; description: string | null }>(query, params);
    throwOnError(result.error);
    return (result.data || []).map((r) => ({
      dim_id: Number(r.dim_id),
      code: r.code,
      description: r.description,
    }));
  }

  private mapRow(r: {
    row_id: number;
    report_type_id: number;
    report_type_code?: string;
    line_item_code: string;
    line_item_label: string;
    display_order: number;
    calculation_order: number | null;
    indent_level: number;
    is_header: boolean | number;
    is_total: boolean | number;
    is_spacer: boolean | number;
    is_title: boolean | number;
    is_bold: boolean | number;
    show_on_summary: boolean | number;
    row_color: string | null;
    font_color: string | null;
    aggregation_type: string;
    expression: string | null;
    sign_convention: number;
    format_type: string | null;
    pct_numerator_code?: string | null;
    pct_denominator_code?: string | null;
    is_active: boolean | number;
    notes: string | null;
    created_at?: Date;
    updated_at?: Date;
  }): FisReportRow {
    return {
      rowId: r.row_id,
      reportTypeId: r.report_type_id,
      reportTypeCode: r.report_type_code,
      lineItemCode: r.line_item_code,
      lineItemLabel: r.line_item_label,
      displayOrder: r.display_order,
      calculationOrder: r.calculation_order ?? r.display_order,
      indentLevel: r.indent_level,
      isHeader: r.is_header === true || r.is_header === 1,
      isTotal: r.is_total === true || r.is_total === 1,
      isSpacer: r.is_spacer === true || r.is_spacer === 1,
      isTitle: r.is_title === true || r.is_title === 1,
      isBold: r.is_bold === true || r.is_bold === 1,
      showOnSummary: r.show_on_summary === true || r.show_on_summary === 1,
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
