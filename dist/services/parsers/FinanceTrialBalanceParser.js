import * as XLSX from 'xlsx';
import { ErrorCode } from '../../types/errors.js';
export class FinanceTrialBalanceParser {
    async parseFinanceTrialBalance(fileBuffer, skipInvalidRows = false) {
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
            const indexOf = (...names) => headers.findIndex((h) => names.some((n) => h === n.toLowerCase()));
            const colMainAccount = indexOf('mainaccount', 'main account');
            const colFundingSource = indexOf('fundingsource', 'funding source');
            const colRegion = indexOf('region');
            const colOperatingUnit = indexOf('operatingunit', 'operating unit');
            const colDepartment = indexOf('department');
            const colProject = indexOf('project');
            const colActivity = indexOf('activity');
            const colResource = indexOf('resource');
            const colParty = indexOf('party');
            const colFixedAssets = indexOf('fixedassets', 'fixed assets');
            const colReference = indexOf('reference');
            const colDebit = indexOf('debit');
            const colCredit = indexOf('credit');
            const colStatus = indexOf('status');
            if (colMainAccount < 0 || colFundingSource < 0 || colDebit < 0 || colCredit < 0) {
                return {
                    valid: false,
                    errors: [{
                            code: ErrorCode.MISSING_HEADERS,
                            message: `Missing required headers in trial balance file. Found: ${headers.join(', ')}`,
                            step: 'PARSE'
                        }],
                    skippedRows: 0,
                    totalRows: 0
                };
            }
            const get = (row, index) => (index >= 0 && index < row.length ? row[index] : null);
            const toText = (value) => {
                if (value == null)
                    return null;
                const s = String(value).trim();
                return s === '' ? null : s;
            };
            const toNumber = (value) => {
                if (value == null)
                    return null;
                if (typeof value === 'number')
                    return value;
                const normalized = String(value).replace(/,/g, '').trim();
                if (!normalized)
                    return null;
                const parsed = Number(normalized);
                return Number.isFinite(parsed) ? parsed : null;
            };
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i] || [];
                totalRows++;
                if (row.every((cell) => cell == null || String(cell).trim() === '')) {
                    continue;
                }
                const mainAccount = toText(get(row, colMainAccount));
                if (!mainAccount) {
                    if (skipInvalidRows) {
                        skippedRows++;
                        continue;
                    }
                    errors.push({
                        code: ErrorCode.INVALID_VALUE,
                        message: `Row ${i + 1}: Missing MainAccount`,
                        step: 'PARSE'
                    });
                    continue;
                }
                results.push({
                    main_account: mainAccount,
                    funding_source: toText(get(row, colFundingSource)) ?? undefined,
                    region: toText(get(row, colRegion)) ?? undefined,
                    operating_unit: toText(get(row, colOperatingUnit)) ?? undefined,
                    department: toText(get(row, colDepartment)) ?? undefined,
                    project: toText(get(row, colProject)) ?? undefined,
                    activity: toText(get(row, colActivity)) ?? undefined,
                    resource: toText(get(row, colResource)) ?? undefined,
                    party: toText(get(row, colParty)) ?? undefined,
                    fixed_assets: toText(get(row, colFixedAssets)) ?? undefined,
                    reference: toText(get(row, colReference)) ?? undefined,
                    debit: toNumber(get(row, colDebit)) ?? undefined,
                    credit: toNumber(get(row, colCredit)) ?? undefined,
                    status: toText(get(row, colStatus)) ?? undefined
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
                        message: `Failed to parse finance trial balance file: ${error.message || error}`,
                        step: 'PARSE'
                    }],
                skippedRows,
                totalRows
            };
        }
    }
}
//# sourceMappingURL=FinanceTrialBalanceParser.js.map