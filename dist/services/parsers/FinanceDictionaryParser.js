import * as XLSX from 'xlsx';
import { ErrorCode } from '../../types/errors.js';
export class FinanceDictionaryParser {
    async parseFinanceDictionary(fileBuffer, skipInvalidRows = false) {
        const errors = [];
        const results = [];
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
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: null,
                raw: false
            });
            if (rows.length < 2) {
                return {
                    valid: false,
                    errors: [{ code: ErrorCode.EMPTY_FILE, message: 'Sheet has no data rows', step: 'PARSE' }],
                    skippedRows: 0,
                    totalRows: 0
                };
            }
            const headers = (rows[0] || []).map((h) => String(h || '').trim().toLowerCase());
            const findHeaderIndex = (...aliases) => headers.findIndex((h) => aliases.some((a) => h === a.toLowerCase()));
            const codeColumnCandidates = [
                'account', 'activity', 'department', 'fixedasset', 'operatingunit',
                'party', 'project', 'reference', 'region', 'resource', 'sourceoffund'
            ];
            const codeColumnIndex = headers.findIndex((h) => codeColumnCandidates.includes(h));
            if (codeColumnIndex < 0) {
                return {
                    valid: false,
                    errors: [{
                            code: ErrorCode.MISSING_HEADERS,
                            message: `Could not identify dictionary code column from headers: ${headers.join(', ')}`,
                            step: 'PARSE'
                        }],
                    skippedRows: 0,
                    totalRows: 0
                };
            }
            const descriptionIndex = findHeaderIndex('description');
            const suspendedIndex = findHeaderIndex('suspended');
            const entityIndex = findHeaderIndex('entity');
            const groupDimensionIndex = findHeaderIndex('groupdimension', 'group dimension');
            const get = (row, index) => (index >= 0 && index < row.length ? row[index] : null);
            const toText = (value) => {
                if (value == null)
                    return null;
                const s = String(value).trim();
                return s === '' ? null : s;
            };
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i] || [];
                totalRows++;
                if (row.every((cell) => cell == null || String(cell).trim() === '')) {
                    continue;
                }
                const code = toText(get(row, codeColumnIndex));
                if (!code) {
                    if (skipInvalidRows) {
                        skippedRows++;
                        continue;
                    }
                    errors.push({
                        code: ErrorCode.INVALID_VALUE,
                        message: `Row ${i + 1}: Missing code value`,
                        step: 'PARSE'
                    });
                    continue;
                }
                results.push({
                    code,
                    description: toText(get(row, descriptionIndex)) ?? undefined,
                    suspended: toText(get(row, suspendedIndex)) ?? undefined,
                    entity: toText(get(row, entityIndex)) ?? undefined,
                    group_dimension: toText(get(row, groupDimensionIndex)) ?? undefined
                });
            }
            return {
                valid: results.length > 0 && errors.length === 0,
                data: results.length > 0 ? results : undefined,
                errors,
                skippedRows,
                totalRows
            };
        }
        catch (error) {
            return {
                valid: false,
                errors: [{
                        code: ErrorCode.PARSE_ERROR,
                        message: `Failed to parse finance dictionary file: ${error.message || error}`,
                        step: 'PARSE'
                    }],
                skippedRows,
                totalRows
            };
        }
    }
}
//# sourceMappingURL=FinanceDictionaryParser.js.map