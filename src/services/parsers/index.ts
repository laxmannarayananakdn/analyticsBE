/**
 * File Parser Factory
 * Selects and uses the appropriate parser based on file type
 */

import { IBExternalExamParser } from './IBExternalExamParser.js';
import { MSNAVFinancialAidParser } from './MSNAVFinancialAidParser.js';
import { CEMPredictionReportParser } from './CEMPredictionReportParser.js';
import { CEMSubjectLevelAnalysisParser } from './CEMSubjectLevelAnalysisParser.js';
import { HREmployeeDataParser } from './HREmployeeDataParser.js';
import { HRBudgetVsActualParser } from './HRBudgetVsActualParser.js';
import { FinanceDictionaryParser } from './FinanceDictionaryParser.js';
import { FinanceTrialBalanceParser } from './FinanceTrialBalanceParser.js';
import {
  IBExternalExam,
  MSNAVFinancialAid,
  CEMPredictionReport,
  CEMSubjectLevelAnalysis,
  HREmployeeData,
  HRBudgetVsActual,
  FinanceDictionaryRecord,
  FinanceTrialBalanceRecord
} from '../../types/ef.js';
import { ValidationResult } from '../../types/errors.js';

export type ParseResult<T> = ValidationResult<T>;

export class FileParserFactory {
  private ibParser: IBExternalExamParser;
  private msnavParser: MSNAVFinancialAidParser;
  private cemPredictionParser: CEMPredictionReportParser;
  private cemSubjectParser: CEMSubjectLevelAnalysisParser;
  private hrEmployeeParser: HREmployeeDataParser;
  private hrBudgetParser: HRBudgetVsActualParser;
  private financeDictionaryParser: FinanceDictionaryParser;
  private financeTrialBalanceParser: FinanceTrialBalanceParser;

  constructor() {
    this.ibParser = new IBExternalExamParser();
    this.msnavParser = new MSNAVFinancialAidParser();
    this.cemPredictionParser = new CEMPredictionReportParser();
    this.cemSubjectParser = new CEMSubjectLevelAnalysisParser();
    this.hrEmployeeParser = new HREmployeeDataParser();
    this.hrBudgetParser = new HRBudgetVsActualParser();
    this.financeDictionaryParser = new FinanceDictionaryParser();
    this.financeTrialBalanceParser = new FinanceTrialBalanceParser();
  }

  /**
   * Parse file based on file type code
   * @param fileTypeCode - The file type code (e.g., 'IB_EXTERNAL_EXAMS', 'MSNAV_FINANCIAL_AID', 'CEM_INITIAL', 'CEM_FINAL', 'HR_EMPLOYEE_DATA', 'HR_BUDGET_VS_ACTUAL')
   * @param fileBuffer - The file buffer to parse
   * @param skipInvalidRows - Whether to skip invalid rows or fail on first error
   * @returns Validation result with data or errors
   */
  async parseFile(
    fileTypeCode: string,
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<
    ParseResult<
      | IBExternalExam
      | MSNAVFinancialAid
      | CEMPredictionReport
      | CEMSubjectLevelAnalysis
      | HREmployeeData
      | HRBudgetVsActual
      | FinanceDictionaryRecord
      | FinanceTrialBalanceRecord
    >
  > {
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

        case 'HR_EMPLOYEE_DATA':
          return await this.hrEmployeeParser.parseHREmployeeData(fileBuffer, skipInvalidRows);

        case 'HR_BUDGET_VS_ACTUAL':
          return await this.hrBudgetParser.parseHRBudgetVsActual(fileBuffer, skipInvalidRows);

        case 'FIN_DIC_ACCOUNT':
        case 'FIN_DIC_ACTIVITY':
        case 'FIN_DIC_DEPARTMENT':
        case 'FIN_DIC_FIXED_ASSETS':
        case 'FIN_DIC_OPERATING_UNIT':
        case 'FIN_DIC_PARTY':
        case 'FIN_DIC_PROJECT':
        case 'FIN_DIC_REFERENCE':
        case 'FIN_DIC_REGION':
        case 'FIN_DIC_RESOURCE':
        case 'FIN_DIC_SOURCE_OF_FUND':
          return await this.financeDictionaryParser.parseFinanceDictionary(fileBuffer, skipInvalidRows);

        case 'FIN_TB_ACTUAL':
        case 'FIN_TB_BUDGET':
          return await this.financeTrialBalanceParser.parseFinanceTrialBalance(fileBuffer, skipInvalidRows);

        default:
          return {
            valid: false,
            errors: [{
              code: 'UNSUPPORTED_FILE_TYPE',
              message: `Unsupported file type: ${fileTypeCode}`,
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

  /**
   * Parse HR Employee Data file
   */
  async parseHREmployeeData(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ParseResult<HREmployeeData>> {
    return await this.hrEmployeeParser.parseHREmployeeData(fileBuffer, skipInvalidRows);
  }

  /**
   * Parse HR Budget vs Actual file
   */
  async parseHRBudgetVsActual(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ParseResult<HRBudgetVsActual>> {
    return await this.hrBudgetParser.parseHRBudgetVsActual(fileBuffer, skipInvalidRows);
  }
}

// Export singleton instance
export const fileParserFactory = new FileParserFactory();

// Export individual parsers for direct use if needed
export { IBExternalExamParser } from './IBExternalExamParser.js';
export { MSNAVFinancialAidParser } from './MSNAVFinancialAidParser.js';
export { CEMPredictionReportParser } from './CEMPredictionReportParser.js';
export { CEMSubjectLevelAnalysisParser } from './CEMSubjectLevelAnalysisParser.js';
export { HREmployeeDataParser } from './HREmployeeDataParser.js';
export { HRBudgetVsActualParser } from './HRBudgetVsActualParser.js';
export { FinanceDictionaryParser } from './FinanceDictionaryParser.js';
export { FinanceTrialBalanceParser } from './FinanceTrialBalanceParser.js';

