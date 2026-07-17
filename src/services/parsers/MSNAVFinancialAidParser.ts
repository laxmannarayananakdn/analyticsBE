/**
 * MSNAV Financial Aid XLSX Parser
 * Handles Excel files with financial aid data (new template format)
 */

import * as XLSX from 'xlsx';
import { MSNAVFinancialAid } from '../../types/ef.js';
import { ValidationResult, UploadError, ErrorCode, ValidationErrorDetail } from '../../types/errors.js';
import { validateDataType, validateRequiredColumns } from '../../utils/fileValidation.js';

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Normalize join year to YYYY only (or empty → caller stores null). */
function normalizeJoinYear(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Already YYYY
  if (/^[12]\d{3}$/.test(trimmed)) {
    return trimmed;
  }

  // Excel day serial (~1955–2118) → calendar year
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed);
    if (serial >= 20000 && serial <= 80000) {
      const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
      return String(new Date(utc).getUTCFullYear());
    }
    // Plain 4-digit-ish numeric year already handled above; other numbers → drop
  }

  // ISO / parseable date → year
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const year = new Date(parsed).getUTCFullYear();
    if (year >= 1900 && year <= 2100) {
      return String(year);
    }
  }

  // Leading YYYY in longer string (e.g. 2020-08-15, 2020-21)
  const lead = trimmed.match(/^([12]\d{3})/);
  if (lead) {
    return lead[1];
  }

  return undefined;
}

export class MSNAVFinancialAidParser {
  /**
   * Parse MSNAV Financial Aid XLSX file with validation
   * Expected columns: S.No, UCI, Academic Year, Class, Class Code, Student No,
   * Student Name, Percentage, Fee Classification, FA Sub-Type, Fee Code,
   * Community status, Year of Joining Academy,
   * Curriculum from which the student joined the academy,
   * Talent ID Prog. [Yes], Rebalancing [Tajik/Afgh/Syri/Iranian]
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

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found in Excel file`);
      }

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

      let headerRowIndex = -1;
      let headers: string[] = [];

      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (row && row.length > 0) {
          const firstCell = normalizeHeader(String(row[0] || ''));
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
        'year of joining academy': 'Year_of_Joining_Academy',
        'year_of_joining_academy': 'Year_of_Joining_Academy',
        'curriculum from which the student joined the academy': 'Joining_Curriculum',
        'joining_curriculum': 'Joining_Curriculum',
        'talent id prog. [yes]': 'Talent_ID_Prog',
        'talent id prog [yes]': 'Talent_ID_Prog',
        'talent_id_prog': 'Talent_ID_Prog',
        'rebalancing [tajik/afgh/syri/iranian]': 'Rebalancing',
        'rebalancing': 'Rebalancing',
      };

      const normalizedHeaders: Record<number, string> = {};
      headers.forEach((header, index) => {
        const normalized = normalizeHeader(header);
        const mappedField = headerMap[normalized];
        if (mappedField) {
          normalizedHeaders[index] = mappedField;
        }
      });

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

      const rowErrors: ValidationErrorDetail[] = [];

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1;
        totalRows++;

        if (!row || row.length === 0 ||
            row.every((cell: any) => cell === null || cell === undefined ||
            String(cell).trim() === '')) {
          continue;
        }

        const record: MSNAVFinancialAid = {};
        let hasErrors = false;

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

          switch (fieldName) {
            case 'S_No': {
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
            }
            case 'Percentage': {
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
            }
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
            case 'Year_of_Joining_Academy':
              record.Year_of_Joining_Academy = normalizeJoinYear(stringValue);
              break;
            case 'Joining_Curriculum':
              record.Joining_Curriculum = stringValue;
              break;
            case 'Talent_ID_Prog':
              record.Talent_ID_Prog = stringValue;
              break;
            case 'Rebalancing':
              record.Rebalancing = stringValue;
              break;
          }
        });

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
