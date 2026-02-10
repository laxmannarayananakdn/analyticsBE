/**
 * CEM Subject Level Analysis Parser
 * Handles .xls files with CEM Final (Subject Level Analysis) data
 * File structure: Title row (0), Info rows (1-4), Headers (5-7), Data starts at row 8
 */
import { CEMSubjectLevelAnalysis } from '../../types/ef';
import { ValidationResult } from '../../types/errors';
export declare class CEMSubjectLevelAnalysisParser {
    /**
     * Parse CEM Subject Level Analysis .xls file with validation
     * Data starts at row index 8 (0-indexed)
     */
    parseCEMSubjectLevelAnalysis(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ValidationResult<CEMSubjectLevelAnalysis>>;
}
//# sourceMappingURL=CEMSubjectLevelAnalysisParser.d.ts.map