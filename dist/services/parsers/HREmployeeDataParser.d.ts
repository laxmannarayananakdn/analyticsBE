/**
 * HR Employee Data XLSX Parser
 * Reads "Employee Data" tab from AKS Dashboard Excel file
 */
import { HREmployeeData } from '../../types/ef.js';
import { ValidationResult } from '../../types/errors.js';
export declare class HREmployeeDataParser {
    parseHREmployeeData(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ValidationResult<HREmployeeData>>;
}
//# sourceMappingURL=HREmployeeDataParser.d.ts.map