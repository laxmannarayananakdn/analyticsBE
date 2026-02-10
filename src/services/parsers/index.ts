/**
 * File Parser Factory
 * Selects and uses the appropriate parser based on file type
 */

import { IBExternalExamParser } from './IBExternalExamParser';
import { MSNAVFinancialAidParser } from './MSNAVFinancialAidParser';
import { CEMPredictionReportParser } from './CEMPredictionReportParser';
import { CEMSubjectLevelAnalysisParser } from './CEMSubjectLevelAnalysisParser';
import { IBExternalExam, MSNAVFinancialAid, CEMPredictionReport, CEMSubjectLevelAnalysis } from '../../types/ef';
import { ValidationResult } from '../../types/errors';

export type ParseResult<T> = ValidationResult<T>;

export class FileParserFactory {
  private ibParser: IBExternalExamParser;
  private msnavParser: MSNAVFinancialAidParser;
  private cemPredictionParser: CEMPredictionReportParser;
  private cemSubjectParser: CEMSubjectLevelAnalysisParser;

  constructor() {
    this.ibParser = new IBExternalExamParser();
    this.msnavParser = new MSNAVFinancialAidParser();
    this.cemPredictionParser = new CEMPredictionReportParser();
    this.cemSubjectParser = new CEMSubjectLevelAnalysisParser();
  }

  /**
   * Parse file based on file type code
   * @param fileTypeCode - The file type code (e.g., 'IB_EXTERNAL_EXAMS', 'MSNAV_FINANCIAL_AID', 'CEM_INITIAL', 'CEM_FINAL')
   * @param fileBuffer - The file buffer to parse
   * @param skipInvalidRows - Whether to skip invalid rows or fail on first error
   * @returns Validation result with data or errors
   */
  async parseFile(
    fileTypeCode: string,
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ParseResult<IBExternalExam | MSNAVFinancialAid | CEMPredictionReport | CEMSubjectLevelAnalysis>> {
    try {
      switch (fileTypeCode.toUpperCase()) {
        case 'IB_EXTERNAL_EXAMS':
          return await this.ibParser.parseIBExternalExams(fileBuffer, skipInvalidRows);

        case 'MSNAV_FINANCIAL_AID':
          return await this.msnavParser.parseMSNAVFinancialAid(fileBuffer, skipInvalidRows);

        case 'CEM_INITIAL':
          return await this.cemPredictionParser.parseCEMPredictionReport(fileBuffer, skipInvalidRows);

        case 'CEM_FINAL':
          return await this.cemSubjectParser.parseCEMSubjectLevelAnalysis(fileBuffer, skipInvalidRows);

        default:
          return {
            valid: false,
            errors: [{
              code: 'UNSUPPORTED_FILE_TYPE',
              message: `Unsupported file type: ${fileTypeCode}. Supported types: IB_EXTERNAL_EXAMS, MSNAV_FINANCIAL_AID, CEM_INITIAL, CEM_FINAL`,
              step: 'PARSE'
            }],
            skippedRows: 0,
            totalRows: 0
          };
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          code: 'PARSE_ERROR',
          message: error.message || 'Failed to parse file',
          step: 'PARSE'
        }],
        skippedRows: 0,
        totalRows: 0
      };
    }
  }

  /**
   * Parse IB External Exams file
   */
  async parseIBExternalExams(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ParseResult<IBExternalExam>> {
    return await this.ibParser.parseIBExternalExams(fileBuffer, skipInvalidRows);
  }

  /**
   * Parse MSNAV Financial Aid file
   */
  async parseMSNAVFinancialAid(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ParseResult<MSNAVFinancialAid>> {
    return await this.msnavParser.parseMSNAVFinancialAid(fileBuffer, skipInvalidRows);
  }

  /**
   * Parse CEM Prediction Report file
   */
  async parseCEMPredictionReport(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ParseResult<CEMPredictionReport>> {
    return await this.cemPredictionParser.parseCEMPredictionReport(fileBuffer, skipInvalidRows);
  }

  /**
   * Parse CEM Subject Level Analysis file
   */
  async parseCEMSubjectLevelAnalysis(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ParseResult<CEMSubjectLevelAnalysis>> {
    return await this.cemSubjectParser.parseCEMSubjectLevelAnalysis(fileBuffer, skipInvalidRows);
  }
}

// Export singleton instance
export const fileParserFactory = new FileParserFactory();

// Export individual parsers for direct use if needed
export { IBExternalExamParser } from './IBExternalExamParser';
export { MSNAVFinancialAidParser } from './MSNAVFinancialAidParser';
export { CEMPredictionReportParser } from './CEMPredictionReportParser';
export { CEMSubjectLevelAnalysisParser } from './CEMSubjectLevelAnalysisParser';

