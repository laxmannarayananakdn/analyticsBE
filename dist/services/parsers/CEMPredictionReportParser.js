/**
 * CEM Prediction Report Parser
 * Handles .xls files with CEM Initial (Prediction Report) data
 * File structure: Title row (0), Empty (1), Headers (2-3), Data starts at row 4
 */
import * as XLSX from 'xlsx';
import { ErrorCode } from '../../types/errors.js';
export class CEMPredictionReportParser {
    /**
     * Parse CEM Prediction Report .xls file with validation
     * Data starts at row index 4 (0-indexed)
     */
    async parseCEMPredictionReport(fileBuffer, skipInvalidRows = false) {
        const errors = [];
        const results = [];
        let skippedRows = 0;
        let totalRows = 0;
        try {
            // Parse Excel workbook (.xls format)
            let workbook;
            try {
                workbook = XLSX.read(fileBuffer, {
                    type: 'buffer',
                    cellDates: false,
                    cellNF: false,
                    cellText: false
                });
            }
            catch (parseError) {
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
            });
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
            // Verify structure: Check if row 0 contains "Alis Prediction Report" or similar
            const titleRow = rows[0];
            const titleText = titleRow && titleRow[0] ? String(titleRow[0]).trim() : '';
            if (rows.length < 5) {
                return {
                    valid: false,
                    errors: [{
                            code: ErrorCode.INVALID_FORMAT,
                            message: 'File does not have enough rows. Expected at least 5 rows (title, empty, headers, data).',
                            step: 'PARSE'
                        }],
                    skippedRows: 0,
                    totalRows: 0
                };
            }
            // Data starts at row index 4 (0-indexed)
            const dataStartRow = 4;
            const rowErrors = [];
            for (let i = dataStartRow; i < rows.length; i++) {
                const row = rows[i];
                const rowNumber = i + 1; // 1-indexed for user display
                totalRows++;
                // Skip empty rows
                if (!row || row.length === 0 ||
                    row.every((cell) => cell === null || cell === undefined ||
                        String(cell).trim() === '')) {
                    continue;
                }
                // Helper function to clean and trim string values
                const cleanString = (value) => {
                    if (value === null || value === undefined) {
                        return null;
                    }
                    const str = String(value).trim();
                    return str === '' || str === 'null' || str === 'NULL' ? null : str;
                };
                // Helper function to parse number, handling NaN
                const parseNumber = (value) => {
                    if (value === null || value === undefined) {
                        return null;
                    }
                    const str = String(value).trim();
                    if (str === '' || str === 'null' || str === 'NULL' || str === 'NaN') {
                        return null;
                    }
                    const num = parseFloat(str);
                    return isNaN(num) ? null : num;
                };
                // Helper function to parse integer
                const parseInteger = (value) => {
                    if (value === null || value === undefined) {
                        return null;
                    }
                    const str = String(value).trim();
                    if (str === '' || str === 'null' || str === 'NULL' || str === 'NaN') {
                        return null;
                    }
                    const num = parseInt(str, 10);
                    return isNaN(num) ? null : num;
                };
                // Map columns to fields (0-indexed)
                const record = {
                    Student_ID: cleanString(row[0]), // Trim trailing spaces
                    Class: cleanString(row[1]),
                    Name: cleanString(row[2]),
                    Gender: cleanString(row[3]),
                    Date_of_Birth: cleanString(row[4]), // String format like "09/06/07"
                    Year_Group: parseInteger(row[5]),
                    GCSE_Score: parseNumber(row[6]), // Often null
                    Subject: cleanString(row[7]),
                    Level: cleanString(row[8]),
                    GCSE_Prediction_Points: parseNumber(row[9]), // Often null
                    GCSE_Prediction_Grade: cleanString(row[10]), // Often null
                    Test_Taken: cleanString(row[11]), // e.g., "Adaptive"
                    Test_Score: parseNumber(row[12]), // Decimal
                    Test_Prediction_Points: parseNumber(row[13]), // Decimal
                    Test_Prediction_Grade: cleanString(row[14]) // String like "6"
                };
                // Only add rows that have at least Student_ID or Name
                if (record.Student_ID || record.Name) {
                    results.push(record);
                }
                else {
                    skippedRows++;
                    if (!skipInvalidRows) {
                        rowErrors.push({
                            row: rowNumber,
                            message: 'Row missing required fields (Student_ID or Name)'
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
        }
        catch (error) {
            return {
                valid: false,
                errors: [{
                        code: ErrorCode.PARSE_ERROR,
                        message: `Failed to parse CEM Prediction Report: ${error.message || error}`,
                        step: 'PARSE'
                    }],
                skippedRows,
                totalRows
            };
        }
    }
}
//# sourceMappingURL=CEMPredictionReportParser.js.map