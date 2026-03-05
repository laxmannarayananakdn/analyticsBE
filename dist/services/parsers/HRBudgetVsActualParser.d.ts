/**
 * HR Budget vs Actual XLSX Parser
 * Reads "Budget vs actual" tab from AKS Dashboard Excel file
 */
import { HRBudgetVsActual } from '../../types/ef.js';
import { ValidationResult } from '../../types/errors.js';
export declare class HRBudgetVsActualParser {
    parseHRBudgetVsActual(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ValidationResult<HRBudgetVsActual>>;
}
//# sourceMappingURL=HRBudgetVsActualParser.d.ts.map