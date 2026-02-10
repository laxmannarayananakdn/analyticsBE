/**
 * File Parser Factory
 * Selects and uses the appropriate parser based on file type
 */
import { IBExternalExam, MSNAVFinancialAid, CEMPredictionReport, CEMSubjectLevelAnalysis } from '../../types/ef.js';
import { ValidationResult } from '../../types/errors.js';
export type ParseResult<T> = ValidationResult<T>;
export declare class FileParserFactory {
    private ibParser;
    private msnavParser;
    private cemPredictionParser;
    private cemSubjectParser;
    constructor();
    /**
     * Parse file based on file type code
     * @param fileTypeCode - The file type code (e.g., 'IB_EXTERNAL_EXAMS', 'MSNAV_FINANCIAL_AID', 'CEM_INITIAL', 'CEM_FINAL')
     * @param fileBuffer - The file buffer to parse
     * @param skipInvalidRows - Whether to skip invalid rows or fail on first error
     * @returns Validation result with data or errors
     */
    parseFile(fileTypeCode: string, fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ParseResult<IBExternalExam | MSNAVFinancialAid | CEMPredictionReport | CEMSubjectLevelAnalysis>>;
    /**
     * Parse IB External Exams file
     */
    parseIBExternalExams(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ParseResult<IBExternalExam>>;
    /**
     * Parse MSNAV Financial Aid file
     */
    parseMSNAVFinancialAid(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ParseResult<MSNAVFinancialAid>>;
    /**
     * Parse CEM Prediction Report file
     */
    parseCEMPredictionReport(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ParseResult<CEMPredictionReport>>;
    /**
     * Parse CEM Subject Level Analysis file
     */
    parseCEMSubjectLevelAnalysis(fileBuffer: Buffer, skipInvalidRows?: boolean): Promise<ParseResult<CEMSubjectLevelAnalysis>>;
}
export declare const fileParserFactory: FileParserFactory;
export { IBExternalExamParser } from './IBExternalExamParser.js';
export { MSNAVFinancialAidParser } from './MSNAVFinancialAidParser.js';
export { CEMPredictionReportParser } from './CEMPredictionReportParser.js';
export { CEMSubjectLevelAnalysisParser } from './CEMSubjectLevelAnalysisParser.js';
//# sourceMappingURL=index.d.ts.map