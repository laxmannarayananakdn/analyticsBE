/**
 * MSNAV Financial Aid XLSX Parser
 * Handles Excel files with financial aid data
 */

import * as XLSX from 'xlsx';
import { MSNAVFinancialAid } from '../../types/ef.js';
import { ValidationResult, UploadError, ErrorCode, ValidationErrorDetail } from '../../types/errors.js';
import { validateDataType, validateRequiredColumns } from '../../utils/fileValidation.js';

export class MSNAVFinancialAidParser {
  /**
   * Parse MSNAV Financial Aid XLSX file with validation
   * Expected columns: S.No, UCI, Academic Year, Class, Class Code, Student No, 
   * Student Name, Percentage, Fee Classification, FA Sub-Type, Fee Code, Community status
   */
  async parseMSNAVFinancialAid(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ValidationResult<MSNAVFinancialAid>> {
    const errors: UploadError[] = [];
    const results: MSNAVFinancialAid[] = [];
    let skippedRows = 0;
    let totalRows = 0;

    try {
      // Parse Excel workbook
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

      // Convert to JSON array
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

      // Find header row (first non-empty row)
      let headerRowIndex = -1;
      let headers: string[] = [];

      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (row && row.length > 0) {
          const firstCell = String(row[0] || '').trim().toLowerCase();
          // Look for common header indicators
          if (firstCell === 's.no' || firstCell === 's_no' || firstCell === 'sno' || 
              firstCell === 'serial no' || firstCell === 'serial number') {
            headerRowIndex = i;
            headers = row.map((cell: any) => String(cell || '').trim());
            break;
          }
        }
      }

      if (headerRowIndex === -1) {
        return {
          valid: false,
          errors: [{
            code: ErrorCode.MISSING_HEADERS,
            message: 'Could not find header row in Excel file. Expected column "S.No" or similar.',
            step: 'PARSE'
          }],
          skippedRows: 0,
          totalRows: 0
        };
      }

      // Normalize header names to match our interface
      const headerMap: Record<string, string> = {
        's.no': 'S_No',
        's_no': 'S_No',
        'sno': 'S_No',
        'serial no': 'S_No',
        'serial number': 'S_No',
        'uci': 'UCI',
        'academic year': 'Academic_Year',
        'academic_year': 'Academic_Year',
        'class': 'Class',
        'class code': 'Class_Code',
        'class_code': 'Class_Code',
        'student no': 'Student_No',
        'student_no': 'Student_No',
        'student number': 'Student_No',
        'student name': 'Student_Name',
        'student_name': 'Student_Name',
        'percentage': 'Percentage',
        'fee classification': 'Fee_Classification',
        'fee_classification': 'Fee_Classification',
        'fa sub-type': 'FA_Sub_Type',
        'fa_sub_type': 'FA_Sub_Type',
        'fa sub type': 'FA_Sub_Type',
        'fee code': 'Fee_Code',
        'fee_code': 'Fee_Code',
        'community status': 'Community_Status',
        'community_status': 'Community_Status',
        'component type': 'Component_Type' // May be present but not in our interface
      };

      // Create normalized header map (index -> field name)
      const normalizedHeaders: Record<number, string> = {};
      headers.forEach((header, index) => {
        const normalized = header.toLowerCase().trim();
        const mappedField = headerMap[normalized];
        if (mappedField) {
          normalizedHeaders[index] = mappedField;
        }
      });

      // Validate required columns
      const requiredColumns = ['S_No', 'UCI', 'Student_No', 'Student_Name'];
      const missingColumns = requiredColumns.filter(col => 
        !Object.values(normalizedHeaders).includes(col)
      );

      if (missingColumns.length > 0) {
        const columnError = validateRequiredColumns(
          headers,
          requiredColumns,
          headerMap
        );
        if (columnError) {
          return {
            valid: false,
            errors: [columnError],
            skippedRows: 0,
            totalRows: 0
          };
        }
      }

      // Parse data rows
      const rowErrors: ValidationErrorDetail[] = [];

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1; // 1-indexed for user display
        totalRows++;
        
        // Skip empty rows
        if (!row || row.length === 0 || 
            row.every((cell: any) => cell === null || cell === undefined || 
            String(cell).trim() === '')) {
          continue;
        }

        const record: MSNAVFinancialAid = {};
        let hasErrors = false;

        // Map each column to the record
        Object.entries(normalizedHeaders).forEach(([colIndex, fieldName]) => {
          const index = parseInt(colIndex, 10);
          const cellValue = row[index];

          if (cellValue === null || cellValue === undefined) {
            return;
          }

          const stringValue = String(cellValue).trim();
          if (stringValue === '' || stringValue === 'null' || stringValue === 'NULL') {
            return;
          }

          // Type conversion and validation based on field
          switch (fieldName) {
            case 'S_No':
              const sNo = parseInt(stringValue, 10);
              if (!isNaN(sNo)) {
                record.S_No = sNo;
              } else {
                const error = validateDataType(stringValue, 'number', 'S_No', rowNumber);
                if (error) {
                  rowErrors.push(error);
                  hasErrors = true;
                }
              }
              break;
            
            case 'Percentage':
              const percentage = parseFloat(stringValue);
              if (!isNaN(percentage)) {
                record.Percentage = percentage;
              } else {
                const error = validateDataType(stringValue, 'number', 'Percentage', rowNumber);
                if (error) {
                  rowErrors.push(error);
                  hasErrors = true;
                }
              }
              break;
            
            case 'UCI':
              record.UCI = stringValue;
              break;
            case 'Academic_Year':
              record.Academic_Year = stringValue;
              break;
            case 'Class':
              record.Class = stringValue;
              break;
            case 'Class_Code':
              record.Class_Code = stringValue;
              break;
            case 'Student_No':
              record.Student_No = stringValue;
              break;
            case 'Student_Name':
              record.Student_Name = stringValue;
              break;
            case 'Fee_Classification':
              record.Fee_Classification = stringValue;
              break;
            case 'FA_Sub_Type':
              record.FA_Sub_Type = stringValue;
              break;
            case 'Fee_Code':
              record.Fee_Code = stringValue;
              break;
            case 'Community_Status':
              record.Community_Status = stringValue;
              break;
          }
        });

        // Only add records with at least Student_No or Student_Name
        if (record.Student_No || record.Student_Name) {
          if (hasErrors && !skipInvalidRows) {
            skippedRows++;
            continue;
          }
          results.push(record);
        } else {
          skippedRows++;
          if (!skipInvalidRows) {
            rowErrors.push({
              row: rowNumber,
              message: 'Row missing required fields (Student_No or Student_Name)'
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
          message: `Failed to parse MSNAV Financial Aid XLSX: ${error.message || error}`,
          step: 'PARSE'
        }],
        skippedRows,
        totalRows
      };
    }
  }
}

