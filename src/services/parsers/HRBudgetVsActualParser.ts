/**
 * HR Budget vs Actual XLSX Parser
 * Reads "Budget vs actual" tab from AKS Dashboard Excel file
 */

import * as XLSX from 'xlsx';
import { HRBudgetVsActual } from '../../types/ef.js';
import { ValidationResult, UploadError, ErrorCode } from '../../types/errors.js';

const SHEET_NAME = 'Budget vs actual';

function getSheetByName(workbook: XLSX.WorkBook, name: string): string | null {
  return workbook.SheetNames.find((s) => s.toLowerCase().trim() === name.toLowerCase()) ?? null;
}

export class HRBudgetVsActualParser {
  async parseHRBudgetVsActual(
    fileBuffer: Buffer,
    skipInvalidRows: boolean = false
  ): Promise<ValidationResult<HRBudgetVsActual>> {
    const errors: UploadError[] = [];
    const results: HRBudgetVsActual[] = [];
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

      const sheetName = getSheetByName(workbook, SHEET_NAME);
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
      const headers = headerRow.map((h: any) => String(h || '').trim().toLowerCase());
      const idx = (name: string): number => {
        const i = headers.findIndex((h) => h === name || h.replace(/\s+/g, ' ') === name);
        return i >= 0 ? i : -1;
      };

      const colYear = idx('year') >= 0 ? idx('year') : 0;
      const colQuarter = idx('quarter') >= 0 ? idx('quarter') : 1;
      const colCountry = idx('country') >= 0 ? idx('country') : 2;
      const colCategory = idx('category') >= 0 ? idx('category') : 3;
      const colBudget = idx('budget') >= 0 ? idx('budget') : 4;
      const colActual = idx('actual') >= 0 ? idx('actual') : 5;
      const colKey = idx('key') >= 0 ? idx('key') : 6;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        totalRows++;
        if (!row || row.length === 0 || row.every((c: any) => c == null || String(c).trim() === '')) {
          continue;
        }

        const get = (col: number): any => (col >= 0 && col < row.length ? row[col] : undefined);
        const str = (col: number): string | null => {
          const v = get(col);
          if (v == null) return null;
          const s = String(v).trim();
          return s === '' ? null : s;
        };
        const num = (col: number): number | null => {
          const v = get(col);
          if (v == null) return null;
          const n = typeof v === 'number' ? v : parseFloat(String(v));
          return isNaN(n) ? null : n;
        };

        const country = str(colCountry);
        if (!country) {
          skippedRows++;
          continue;
        }

        results.push({
          Year: str(colYear) ?? undefined,
          Quarter: str(colQuarter) ?? undefined,
          Country: country ?? undefined,
          Category: str(colCategory) ?? undefined,
          Budget: num(colBudget) ?? undefined,
          Actual: num(colActual) ?? undefined,
          Key: str(colKey) ?? undefined
        });
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
            message: `Failed to parse HR Budget vs Actual: ${error.message || error}`,
            step: 'PARSE'
          }
        ],
        skippedRows,
        totalRows
      };
    }
  }
}
