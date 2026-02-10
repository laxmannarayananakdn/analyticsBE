/**
 * MSNAV Financial Aid XLSX Parser
 * Handles Excel files with financial aid data
 */
import { MSNAVFinancialAid } from '../../types/ef.js';
import { ValidationResult } from '../../types/errors.js';
export declare class MSNAVFinancialAidParser {
    /**
     * Parse MSNAV Financial Aid XLSX file with validation
     * Expected columns: S.No, UCI, Academic Year, Class, Class Code, Student No,
     * Student Name, Percentage, Fee Classification, FA Sub-Type, Fee Code, Community status
     */
    parseMSNAVFinancialAid(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ValidationResult<MSNAVFinancialAid>>;
}
//# sourceMappingURL=MSNAVFinancialAidParser.d.ts.map