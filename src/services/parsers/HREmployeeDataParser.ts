/**
 * HR Employee Data XLSX Parser
 * Reads "Employee Data" tab from AKS Dashboard Excel file
 */

import * as XLSX from 'xlsx';
import { HREmployeeData } from '../../types/ef.js';
import { ValidationResult, UploadError, ErrorCode } from '../../types/errors.js';

const SHEET_NAME = 'Employee Data';

function normalizeHeader(h: string): string {
  return String(h || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/\//g, '_')
    .replace(/_+/g, '_');  // collapse multiple underscores (e.g. "Country / City" -> "country_city")
}

function toDbColumn(header: string): string | null {
  const n = normalizeHeader(header).toLowerCase();
  const map: Record<string, string> = {
    year: 'Year',
    quarter: 'Quarter',
    month: 'Month',
    country: 'Country',
    country_city: 'Country_City',
    entity: 'Entity',
    emp_id: 'Emp_ID',
    position_category: 'Position_Category',
    attrition: 'Attrition',
    fte: 'FTE',
    date_of_birth: 'Date_of_Birth',
    date_of_hire: 'Date_of_Hire',
    sect: 'Sect',
    staff_nationality: 'Staff_Nationality',
    gender: 'Gender',
    teaching_level: 'Teaching_Level',
    teaching_subject_category: 'Teaching_Subject_Category',
    qualification: 'Qualification',
    date_of_separation: 'Date_of_Separation',
    reason_for_leaving: 'reason_for_leaving',
    aging: 'Aging',
    age_grouping: 'Age_Grouping',
    longevity: 'Longevity',
    longevity_grouping: 'Longevity_Grouping',
    reason_type: 'Reason_type',
    reporting_year: 'Reporting_Year',
    recruitment: 'recruitment',
    separation: 'separation',
    staff_category: 'Staff_Category',
    contract_type: 'Contract_type'
  };
  return map[n] || null;
}

/** Derive Country from Country_City: first segment before "/" or use as-is */
function deriveCountry(countryCity: string | null): string | null {
  if (!countryCity || String(countryCity).trim() === '') return null;
  const s = String(countryCity).trim();
  const idx = s.indexOf('/');
  return idx >= 0 ? s.substring(0, idx).trim() : s;
}

export class HREmployeeDataParser {
  async parseHREmployeeData(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ValidationResult<HREmployeeData>> {
    const errors: UploadError[] = [];
    const results: HREmployeeData[] = [];
    let skippedRows = 0;
    let totalRows = 0;

    try {
      const workbook = XLSX.read(fileBuffer, {
        type: 'buffer',
        cellDates: false,
        cellNF: false,
        raw: false
      });

      if (workbook.SheetNames.length === 0) {
        return {
          valid: false,
          errors: [{ code: ErrorCode.EMPTY_FILE, message: 'Excel file contains no sheets', step: 'PARSE' }],
          skippedRows: 0,
          totalRows: 0
        };
      }

      const sheetName = workbook.SheetNames.find(
        (s) => s.toLowerCase().trim() === SHEET_NAME.toLowerCase()
      );
      if (!sheetName) {
        return {
          valid: false,
          errors: [
            {
              code: ErrorCode.MISSING_HEADERS,
              message: `Sheet "${SHEET_NAME}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`,
              step: 'PARSE'
            }
          ],
          skippedRows: 0,
          totalRows: 0
        };
      }

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        return {
          valid: false,
          errors: [{ code: ErrorCode.PARSE_ERROR, message: `Sheet "${SHEET_NAME}" not found`, step: 'PARSE' }],
          skippedRows: 0,
          totalRows: 0
        };
      }

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
        raw: false
      }) as any[][];

      if (rows.length < 2) {
        return {
          valid: false,
          errors: [{ code: ErrorCode.EMPTY_FILE, message: 'Sheet has no data rows', step: 'PARSE' }],
          skippedRows: 0,
          totalRows: 0
        };
      }

      const headerRow = rows[0];
      const headers: string[] = headerRow.map((h: any) => String(h || '').trim());
      const colMap: Record<string, number> = {};
      headers.forEach((h, i) => {
        const dbCol = toDbColumn(h);
        if (dbCol) colMap[dbCol] = i;
      });

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        totalRows++;
        if (!row || row.length === 0 || row.every((c: any) => c == null || String(c).trim() === '')) {
          continue;
        }

        const get = (col: string): any => {
          const idx = colMap[col];
          return idx !== undefined ? row[idx] : undefined;
        };
        const str = (col: string): string | null => {
          const v = get(col);
          if (v == null) return null;
          const s = String(v).trim();
          return s === '' ? null : s;
        };
        const num = (col: string): number | null => {
          const v = get(col);
          if (v == null) return null;
          const n = typeof v === 'number' ? v : parseFloat(String(v));
          return isNaN(n) ? null : n;
        };

        const countryCity = str('Country_City') ?? str('Country');
        const country = str('Country') ?? deriveCountry(countryCity);

        const record: HREmployeeData = {
          Year: num('Year') ?? undefined,
          Quarter: str('Quarter') ?? undefined,
          Month: str('Month') ?? undefined,
          Country: country ?? undefined,
          Country_City: countryCity ?? undefined,
          Entity: str('Entity') ?? undefined,
          Emp_ID: str('Emp_ID') ?? undefined,
          Position_Category: str('Position_Category') ?? undefined,
          Attrition: str('Attrition') ?? undefined,
          FTE: num('FTE') ?? undefined,
          Date_of_Birth: str('Date_of_Birth') ?? undefined,
          Date_of_Hire: str('Date_of_Hire') ?? undefined,
          Sect: str('Sect') ?? undefined,
          Staff_Nationality: str('Staff_Nationality') ?? undefined,
          Gender: str('Gender') ?? undefined,
          Teaching_Level: str('Teaching_Level') ?? undefined,
          Teaching_Subject_Category: str('Teaching_Subject_Category') ?? undefined,
          Qualification: str('Qualification') ?? undefined,
          Date_of_Separation: str('Date_of_Separation') ?? undefined,
          reason_for_leaving: str('reason_for_leaving') ?? undefined,
          Aging: num('Aging') ?? undefined,
          Age_Grouping: str('Age_Grouping') ?? undefined,
          Longevity: num('Longevity') ?? undefined,
          Longevity_Grouping: str('Longevity_Grouping') ?? undefined,
          Reason_type: str('Reason_type') ?? undefined,
          Reporting_Year: str('Reporting_Year') ?? undefined,
          recruitment: str('recruitment') ?? undefined,
          separation: str('separation') ?? undefined,
          Staff_Category: str('Staff_Category') ?? undefined,
          Contract_type: str('Contract_type') ?? undefined
        };

        if (record.Emp_ID || record.Entity || record.Country) {
          results.push(record);
        } else {
          skippedRows++;
        }
      }

      const valid = results.length > 0;
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
        errors: [
          {
            code: ErrorCode.PARSE_ERROR,
            message: `Failed to parse HR Employee Data: ${error.message || error}`,
            step: 'PARSE'
          }
        ],
        skippedRows,
        totalRows
      };
    }
  }
}
