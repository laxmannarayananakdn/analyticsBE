/**
 * IB External Exams CSV Parser
 * Handles the peculiar CSV format with double-quoted values
 */
import { parse } from 'csv-parse/sync';
import { ErrorCode } from '../../types/errors';
import { validateDataType } from '../../utils/fileValidation';
export class IBExternalExamParser {
    /**
     * Parse IB External Exams CSV file with validation
     * Format: "2025,""MAY"",""049369"",""0001"",""jfx329"",""Name"",""DIPLOMA"",""Subject"",""SL"",""ENGLISH"",""5"",""5"",""2"",""27"",""Result"",""Code"""
     */
    async parseIBExternalExams(fileBuffer, skipInvalidRows = false) {
        const errors = [];
        const results = [];
        let skippedRows = 0;
        let totalRows = 0;
        try {
            const fileContent = fileBuffer.toString('utf-8');
            // Remove BOM if present
            const content = fileContent.replace(/^\uFEFF/, '');
            if (!content.trim()) {
                return {
                    valid: false,
                    errors: [{
                            code: ErrorCode.EMPTY_FILE,
                            message: 'File is empty',
                            step: 'PARSE'
                        }],
                    skippedRows: 0,
                    totalRows: 0
                };
            }
            // Parse CSV with proper handling of double quotes
            // The format uses double quotes around the entire row, with internal quotes escaped as ""
            // Example: "2025,""MAY"",""049369"",""0001"",""jfx329"",""Name"",""DIPLOMA"",""Subject"",""SL"",""ENGLISH"",""5"",""5"",""2"",""27"",""Result"",""Code"""
            let records;
            try {
                records = parse(content, {
                    quote: '"',
                    escape: '"',
                    relax_quotes: true,
                    relax_column_count: true,
                    skip_empty_lines: true,
                    trim: true,
                    bom: true,
                    skip_records_with_error: false
                });
            }
            catch (parseError) {
                return {
                    valid: false,
                    errors: [{
                            code: ErrorCode.PARSE_ERROR,
                            message: `Failed to parse CSV: ${parseError.message}`,
                            step: 'PARSE'
                        }],
                    skippedRows: 0,
                    totalRows: 0
                };
            }
            if (records.length === 0) {
                return {
                    valid: false,
                    errors: [{
                            code: ErrorCode.EMPTY_FILE,
                            message: 'CSV file is empty or contains no data rows',
                            step: 'PARSE'
                        }],
                    skippedRows: 0,
                    totalRows: 0
                };
            }
            // Expected columns (in order):
            // Year, Month, School, Registration_Number, Personal_Code, Name, Category, 
            // Subject, Level, Language, Predicted_Grade, Grade, EE_TOK_Points, 
            // Total_Points, Result, Diploma_Requirements_Code
            const expectedColumnCount = 16;
            // Check if first row might be headers (optional, we'll try to detect)
            let startIndex = 0;
            const firstRow = records[0];
            // If first row looks like headers (contains text like "Year", "Month", etc.), skip it
            if (firstRow && firstRow.length > 0 &&
                (firstRow[0]?.toString().toLowerCase().includes('year') ||
                    firstRow[0]?.toString().toLowerCase().includes('month'))) {
                startIndex = 1;
            }
            // Clean up values: remove surrounding quotes and handle double-double quotes
            const cleanValue = (value) => {
                if (value === null || value === undefined) {
                    return undefined;
                }
                let str = value.toString().trim();
                // Remove surrounding quotes if present
                if ((str.startsWith('"') && str.endsWith('"')) ||
                    (str.startsWith("'") && str.endsWith("'"))) {
                    str = str.slice(1, -1);
                }
                // Replace double-double quotes with single quote
                str = str.replace(/""/g, '"');
                // Remove any remaining surrounding quotes
                if ((str.startsWith('"') && str.endsWith('"')) ||
                    (str.startsWith("'") && str.endsWith("'"))) {
                    str = str.slice(1, -1);
                }
                return str === '' ? undefined : str;
            };
            const rowErrors = [];
            for (let i = startIndex; i < records.length; i++) {
                const row = records[i];
                const rowNumber = i + 1; // 1-indexed for user display
                totalRows++;
                // Skip empty rows
                if (!row || row.length === 0 || row.every((cell) => !cell || cell.toString().trim() === '')) {
                    continue;
                }
                // Validate column count
                if (row.length < expectedColumnCount) {
                    const error = {
                        row: rowNumber,
                        message: `Row has ${row.length} columns, expected ${expectedColumnCount}`
                    };
                    rowErrors.push(error);
                    if (!skipInvalidRows) {
                        errors.push({
                            code: ErrorCode.INVALID_FORMAT,
                            message: `Row ${rowNumber}: Invalid column count`,
                            step: 'VALIDATE_DATA',
                            details: [error]
                        });
                        continue;
                    }
                    skippedRows++;
                    continue;
                }
                // Parse and validate data
                const yearValue = cleanValue(row[0]);
                const year = this.parseInteger(yearValue);
                // Validate Year is numeric if provided
                if (yearValue && year === undefined) {
                    const error = validateDataType(yearValue, 'number', 'Year', rowNumber);
                    if (error) {
                        rowErrors.push(error);
                        if (!skipInvalidRows) {
                            errors.push({
                                code: ErrorCode.INVALID_DATA_TYPE,
                                message: `Row ${rowNumber}: Invalid Year value`,
                                step: 'VALIDATE_DATA',
                                details: [error]
                            });
                            continue;
                        }
                    }
                }
                // Map columns to fields
                const exam = {
                    Year: year,
                    Month: cleanValue(row[1]),
                    School: cleanValue(row[2]),
                    Registration_Number: cleanValue(row[3]),
                    Personal_Code: cleanValue(row[4]),
                    Name: cleanValue(row[5]),
                    Category: cleanValue(row[6]),
                    Subject: cleanValue(row[7]),
                    Level: cleanValue(row[8]),
                    Language: cleanValue(row[9]),
                    Predicted_Grade: cleanValue(row[10]),
                    Grade: cleanValue(row[11]),
                    EE_TOK_Points: cleanValue(row[12]),
                    Total_Points: cleanValue(row[13]),
                    Result: cleanValue(row[14]),
                    Diploma_Requirements_Code: cleanValue(row[15])
                };
                // Only add rows that have at least some meaningful data
                if (exam.Year || exam.Personal_Code || exam.Name || exam.Subject) {
                    results.push(exam);
                }
                else if (!skipInvalidRows) {
                    skippedRows++;
                    rowErrors.push({
                        row: rowNumber,
                        message: 'Row has no meaningful data'
                    });
                }
                else {
                    skippedRows++;
                }
            }
            // If we have row errors and not skipping invalid rows, add them to errors
            if (rowErrors.length > 0 && !skipInvalidRows && errors.length === 0) {
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
        }
        catch (error) {
            return {
                valid: false,
                errors: [{
                        code: ErrorCode.PARSE_ERROR,
                        message: `Failed to parse IB External Exams CSV: ${error.message || error}`,
                        step: 'PARSE'
                    }],
                skippedRows,
                totalRows
            };
        }
    }
    /**
     * Parse integer value, handling empty strings and invalid values
     */
    parseInteger(value) {
        if (!value) {
            return undefined;
        }
        const cleaned = value.toString().trim();
        if (cleaned === '' || cleaned === 'null' || cleaned === 'NULL') {
            return undefined;
        }
        const parsed = parseInt(cleaned, 10);
        return isNaN(parsed) ? undefined : parsed;
    }
}
//# sourceMappingURL=IBExternalExamParser.js.map