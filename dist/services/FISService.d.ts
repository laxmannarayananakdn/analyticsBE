/**
 * FIS (Financial Information System) Reporting Service
 */
import { type FisColumnKind, type FisColumnTbType } from './FISTrialBalanceProcessService.js';
export declare class FISServiceError extends Error {
    statusCode: number;
    constructor(message: string, statusCode?: number);
}
export interface FisReportType {
    reportTypeId: number;
    reportTypeCode: string;
    reportTypeName: string;
    description: string | null;
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
    aggregationType: string;
    expression: string | null;
    signConvention: number;
    formatType: string | null;
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
    getRowsByReportType(reportTypeId: number): Promise<FisReportRow[]>;
    createRow(reportTypeId: number, data: Record<string, unknown>): Promise<number>;
    updateRow(rowId: number, data: Record<string, unknown>): Promise<void>;
    softDeleteRow(rowId: number): Promise<void>;
    reorderRows(updates: Array<{
        rowId: number;
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
    getDictionaryCodes(dictionaryType: string, entity?: string, search?: string): Promise<DictionaryCodeItem[]>;
    private mapRow;
}
export declare const fisService: FISService;
//# sourceMappingURL=FISService.d.ts.map