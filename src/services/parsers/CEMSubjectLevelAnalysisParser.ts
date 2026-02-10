/**
 * CEM Subject Level Analysis Parser
 * Handles .xls files with CEM Final (Subject Level Analysis) data
 * File structure: Title row (0), Info rows (1-4), Headers (5-7), Data starts at row 8
 */

import * as XLSX from 'xlsx';
import { CEMSubjectLevelAnalysis } from '../../types/ef.js';
import { ValidationResult, UploadError, ErrorCode, ValidationErrorDetail } from '../../types/errors.js';

export class CEMSubjectLevelAnalysisParser {
  /**
   * Parse CEM Subject Level Analysis .xls file with validation
   * Data starts at row index 8 (0-indexed)
   */
  async parseCEMSubjectLevelAnalysis(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ValidationResult<CEMSubjectLevelAnalysis>> {
    const errors: UploadError[] = [];
    const results: CEMSubjectLevelAnalysis[] = [];
    let skippedRows = 0;
    let totalRows = 0;

    try {
      // Parse Excel workbook (.xls format)
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(fileBuffer, {
          type: 'buffer',
          cellDates: false,
          cellNF: false,
          cellText: false
        });
      } catch (parseError: any) {
        return {
          valid: false,
          errors: [{
            code: ErrorCode.PARSE_ERROR,
            message: `Failed to parse Excel file: ${parseError.message}`,
            step: 'PARSE'
          }],
          skippedRows: 0,
          totalRows: 0
        };
      }

      if (workbook.SheetNames.length === 0) {
        return {
          valid: false,
          errors: [{
            code: ErrorCode.EMPTY_FILE,
            message: 'Excel file contains no sheets',
            step: 'PARSE'
          }],
          skippedRows: 0,
          totalRows: 0
        };
      }

      // Use the first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found in Excel file`);
      }

      // Convert to JSON array (row by row)
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
        raw: false
      }) as any[][];

      if (rows.length === 0) {
        return {
          valid: false,
          errors: [{
            code: ErrorCode.EMPTY_FILE,
            message: 'Excel sheet is empty',
            step: 'PARSE'
          }],
          skippedRows: 0,
          totalRows: 0
        };
      }

      // Verify structure: Check if row 0 contains "Alis SLR Report" or similar
      const titleRow = rows[0];
      const titleText = titleRow && titleRow[0] ? String(titleRow[0]).trim() : '';
      
      if (rows.length < 9) {
        return {
          valid: false,
          errors: [{
            code: ErrorCode.INVALID_FORMAT,
            message: 'File does not have enough rows. Expected at least 9 rows (title, info, headers, data).',
            step: 'PARSE'
          }],
          skippedRows: 0,
          totalRows: 0
        };
      }

      // Data starts at row index 8 (0-indexed)
      const dataStartRow = 8;
      const rowErrors: ValidationErrorDetail[] = [];

      for (let i = dataStartRow; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1; // 1-indexed for user display
        totalRows++;

        // Skip empty rows
        if (!row || row.length === 0 || 
            row.every((cell: any) => cell === null || cell === undefined || 
            String(cell).trim() === '')) {
          continue;
        }

        // Helper function to clean and trim string values
        const cleanString = (value: any): string | null => {
          if (value === null || value === undefined) {
            return null;
          }
          const str = String(value).trim();
          return str === '' || str === 'null' || str === 'NULL' ? null : str;
        };

        // Helper function to parse number, handling NaN
        const parseNumber = (value: any): number | null => {
          if (value === null || value === undefined) {
            return null;
          }
          const str = String(value).trim();
          if (str === '' || str === 'null' || str === 'NULL' || str === 'NaN' || str === '#N/A') {
            return null;
          }
          const num = parseFloat(str);
          return isNaN(num) ? null : num;
        };

        // Map columns to fields (0-indexed)
        const record: CEMSubjectLevelAnalysis = {
          // Student Info
          Student_ID: cleanString(row[0]), // Trim trailing spaces
          Class: cleanString(row[1]),
          Surname: cleanString(row[2]),
          Forename: cleanString(row[3]),
          Gender: cleanString(row[4]),
          
          // Exam Info
          Exam_Type: cleanString(row[5]),
          Subject_Title: cleanString(row[6]),
          Syllabus_Title: cleanString(row[7]),
          Exam_Board: cleanString(row[8]),
          Syllabus_Code: cleanString(row[9]), // Trim trailing spaces
          
          // Grades
          Grade: cleanString(row[10]),
          Grade_as_Points: parseNumber(row[11]),
          
          // GCSE Based Metrics
          GCSE_Score: parseNumber(row[12]),
          GCSE_Prediction: parseNumber(row[13]),
          GCSE_Residual: parseNumber(row[14]),
          GCSE_Standardised_Residual: parseNumber(row[15]),
          GCSE_Gender_Adj_Prediction: parseNumber(row[16]),
          GCSE_Gender_Adj_Residual: parseNumber(row[17]),
          GCSE_Gender_Adj_Std_Residual: parseNumber(row[18]),
          
          // Adaptive Test Metrics
          Adaptive_Score: parseNumber(row[19]),
          Adaptive_Prediction: parseNumber(row[20]),
          Adaptive_Residual: parseNumber(row[21]),
          Adaptive_Standardised_Residual: parseNumber(row[22]),
          Adaptive_Gender_Adj_Prediction: parseNumber(row[23]),
          Adaptive_Gender_Adj_Residual: parseNumber(row[24]),
          Adaptive_Gender_Adj_Std_Residual: parseNumber(row[25]),
          
          // TDA Test Metrics
          TDA_Score: parseNumber(row[26]),
          TDA_Prediction: parseNumber(row[27]),
          TDA_Residual: parseNumber(row[28]),
          TDA_Standardised_Residual: parseNumber(row[29]),
          TDA_Gender_Adj_Prediction: parseNumber(row[30]),
          TDA_Gender_Adj_Residual: parseNumber(row[31]),
          TDA_Gender_Adj_Std_Residual: parseNumber(row[32])
        };

        // Only add rows that have at least Student_ID or Subject_Title
        if (record.Student_ID || record.Subject_Title) {
          results.push(record);
        } else {
          skippedRows++;
          if (!skipInvalidRows) {
            rowErrors.push({
              row: rowNumber,
              message: 'Row missing required fields (Student_ID or Subject_Title)'
            });
          }
        }
      }

      // If we have row errors and not skipping invalid rows, add them to errors
      if (rowErrors.length > 0 && !skipInvalidRows) {
        errors.push({
          code: ErrorCode.INVALID_VALUE,
          message: `Found ${rowErrors.length} row(s) with validation errors`,
          step: 'VALIDATE_DATA',
          details: rowErrors
        });
      }

      const valid = errors.length === 0 && results.length > 0;

      if (results.length === 0) {
        errors.push({
          code: ErrorCode.EMPTY_FILE,
          message: 'No valid data rows found in file',
          step: 'VALIDATE_DATA'
        });
      }

      return {
        valid,
        data: valid ? results : undefined,
        errors,
        skippedRows,
        totalRows
      };
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          code: ErrorCode.PARSE_ERROR,
          message: `Failed to parse CEM Subject Level Analysis: ${error.message || error}`,
          step: 'PARSE'
        }],
        skippedRows,
        totalRows
      };
    }
  }
}

