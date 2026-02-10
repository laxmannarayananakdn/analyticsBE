/**
 * CEM Prediction Report Parser
 * Handles .xls files with CEM Initial (Prediction Report) data
 * File structure: Title row (0), Empty (1), Headers (2-3), Data starts at row 4
 */
import { CEMPredictionReport } from '../../types/ef.js';
import { ValidationResult } from '../../types/errors.js';
export declare class CEMPredictionReportParser {
    /**
     * Parse CEM Prediction Report .xls file with validation
     * Data starts at row index 4 (0-indexed)
     */
    parseCEMPredictionReport(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ValidationResult<CEMPredictionReport>>;
}
//# sourceMappingURL=CEMPredictionReportParser.d.ts.map