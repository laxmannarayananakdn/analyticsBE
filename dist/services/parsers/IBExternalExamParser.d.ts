/**
 * IB External Exams CSV Parser
 * Handles the peculiar CSV format with double-quoted values
 */
import { IBExternalExam } from '../../types/ef.js';
import { ValidationResult } from '../../types/errors.js';
export declare class IBExternalExamParser {
    /**
     * Parse IB External Exams CSV file with validation
     * Format: "2025,""MAY"",""049369"",""0001"",""jfx329"",""Name"",""DIPLOMA"",""Subject"",""SL"",""ENGLISH"",""5"",""5"",""2"",""27"",""Result"",""Code"""
     */
    parseIBExternalExams(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ValidationResult<IBExternalExam>>;
    /**
     * Parse integer value, handling empty strings and invalid values
     */
    private parseInteger;
}
//# sourceMappingURL=IBExternalExamParser.d.ts.map