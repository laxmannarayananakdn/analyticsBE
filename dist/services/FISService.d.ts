/**
 * FIS (Financial Information System) Reporting Service
 */
import { type FisColumnKind, type FisColumnTbType } from './FISTrialBalanceProcessService.js';
import { type FisFileStatus } from './FISRunTrackingService.js';
import type { FisGenerationJobProgress } from './FISReportGenerationJobService.js';
/** Fixed processing order when multiple report types are selected. */
export declare const FIS_REPORT_GENERATION_ORDER: readonly ["NF", "BS", "PL", "CF"];
export declare function sortReportTypesForGeneration(reportTypeCodes: string[]): string[];
export declare class FISServiceError extends Error {
    statusCode: number;
    constructor(message: string, statusCode?: number);
}
export interface FisReportType {
    reportTypeId: number;
    reportTypeCode: string;
    reportTypeName: string;
    description: string | null;
    chartId: string | null;
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
    indentLevel: number;
    isHeader: boolean;
    isTotal: boolean;
    isSpacer: boolean;
    isTitle: boolean;
    isBold: boolean;
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
    code: string;
    description: string | null;
}
export declare class FISService {
    getReportTypes(): Promise<FisReportType[]>;
    createReportType(data: Record<string, unknown>): Promise<number>;
    updateReportType(reportTypeId: number, data: Record<string, unknown>): Promise<FisReportType>;
    private rowSelectSql;
    getRowById(rowId: number): Promise<FisReportRow | null>;
    getRowsByReportType(reportTypeId: number): Promise<FisReportRow[]>;
    createRow(reportTypeId: number, data: Record<string, unknown>): Promise<number>;
    updateRow(rowId: number, data: Record<string, unknown>): Promise<FisReportRow>;
    softDeleteRow(rowId: number): Promise<void>;
    reorderRows(updates: Array<{
        rowId: number;
        displayOrder: number;
    }>): Promise<void>;
    private static readonly CALCULATED_COLUMN_KINDS;
    private columnDefSelectSql;
    private mapColumnDef;
    private assertColumnDefDependencies;
    resolveColumnDefPeriods(def: Pick<FisReportColumnDef, 'periodScope' | 'columnKind' | 'referenceMonth' | 'fiscalYearOffset' | 'tbType'>, asOfPeriod: string): FisColumnDefPreviewRow['resolution'];
    getColumnDefsByReportType(reportTypeId: number, activeOnly?: boolean): Promise<FisReportColumnDef[]>;
    getColumnDefPreview(reportTypeId: number, asOfPeriod: string): Promise<FisColumnDefPreviewRow[]>;
    createColumnDef(reportTypeId: number, data: Record<string, unknown>): Promise<number>;
    updateColumnDef(columnDefId: number, data: Record<string, unknown>): Promise<FisReportColumnDef>;
    softDeleteColumnDef(columnDefId: number): Promise<void>;
    reorderColumnDefs(updates: Array<{
        columnDefId: number;
        displayOrder: number;
    }>): Promise<void>;
    getRulesForRow(rowId: number): Promise<FisFilterRule[]>;
    createRule(rowId: number, data: Record<string, unknown>): Promise<number>;
    updateRule(ruleId: number, data: Record<string, unknown>): Promise<void>;
    softDeleteRule(ruleId: number): Promise<void>;
    replaceRuleCriteria(ruleId: number, criteria: FisRuleCriterion[]): Promise<void>;
    getInstances(): Promise<FisReportInstanceSummary[]>;
    getInstance(instanceId: number): Promise<FisReportInstanceDetail>;
    private insertReportColumn;
    /**
     * Normalize column_order: Budget before Actual within each month block.
     * Runs after inserts and before generate so upload/file order never affects display.
     */
    reorderInstanceColumns(instanceId: number): Promise<void>;
    /** Append six month columns if this period is not already on the instance. */
    appendMonthColumnsForPeriod(instanceId: number, period: string): Promise<number>;
    ensureInstanceEntity(instanceId: number, entityCode: string): Promise<void>;
    createInstance(data: Record<string, unknown>): Promise<number>;
    updateInstance(instanceId: number, data: Record<string, unknown>): Promise<void>;
    softDeleteInstance(instanceId: number): Promise<void>;
    generateReport(instanceId: number, scope?: {
        entityCode: string;
        period: string;
    }): Promise<{
        instanceId: number;
        outputRowCount: number;
        entityCode?: string;
        period?: string;
    }>;
    /** Run-key generation — server-side batched SP calls (fast path). */
    generateReportByRunKey(reportTypeCode: string, entityCode: string, asOfPeriod: string, triggeredBy?: string | null, onProgress?: (progress: FisGenerationJobProgress) => void): Promise<{
        reportTypeCode: string;
        entityCode: string;
        asOfPeriod: string;
        outputRowCount: number;
        fileStatus?: FisFileStatus;
        isTbLocked?: boolean;
    }>;
    /** Generate multiple run-key reports in NF → BS → PL → CF order. */
    generateReportsByRunKey(reportTypeCodes: string[], entityCode: string, asOfPeriod: string, triggeredBy?: string | null, onProgress?: (progress: FisGenerationJobProgress) => void): Promise<{
        entityCode: string;
        asOfPeriod: string;
        reports: Array<{
            reportTypeCode: string;
            outputRowCount: number;
        }>;
        fileStatus?: FisFileStatus;
        isTbLocked?: boolean;
    }>;
    /** SUM rows from report row config — used for chunked generation progress. */
    getSumRowsForRunKey(reportTypeCode: string): Promise<Array<{
        rowId: number;
        lineItemCode: string;
        lineItemLabel: string;
        displayOrder: number;
    }>>;
    /** Calculated columns (variance / perf %) for chunked finalize. */
    getVarianceColumnsForRunKey(reportTypeCode: string): Promise<Array<{
        columnKey: number;
        columnCode: string;
        columnLabel: string;
        displayOrder: number;
    }>>;
    /** Expression rows for chunked finalize. */
    getExpressionRowsForRunKey(reportTypeCode: string): Promise<Array<{
        rowId: number;
        lineItemCode: string;
        lineItemLabel: string;
        displayOrder: number;
    }>>;
    /** Single chunk of run-key generation. */
    generateReportRunKeyChunk(params: {
        phase: 'init' | 'row' | 'finalize-pit' | 'finalize-variance' | 'finalize-expression' | 'finalize-normalize';
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
        sumRows?: Array<{
            rowId: number;
            lineItemCode: string;
            lineItemLabel: string;
            displayOrder: number;
        }>;
        varianceColumns?: Array<{
            columnKey: number;
            columnCode: string;
            columnLabel: string;
            displayOrder: number;
        }>;
        expressionRows?: Array<{
            rowId: number;
            lineItemCode: string;
            lineItemLabel: string;
            displayOrder: number;
        }>;
    }>;
    private runFinalizeChunks;
    private prepareRunKeyGeneration;
    private executeGenerateMode;
    private countRunKeyOutput;
    getDictionaryCodes(dictionaryType: string, entity?: string, search?: string): Promise<DictionaryCodeItem[]>;
    private mapRow;
}
export declare const fisService: FISService;
//# sourceMappingURL=FISService.d.ts.map