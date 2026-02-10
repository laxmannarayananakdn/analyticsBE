/**
 * File Validation Utilities
 */
import { UploadError, ValidationErrorDetail } from '../types/errors.js';
export declare const MAX_FILE_SIZE: number;
export declare const MIN_ROWS_REQUIRED: number;
/**
 * Validate file size
 */
export declare function validateFileSize(fileSize: number): UploadError | null;
/**
 * Validate file extension
 */
export declare function validateFileExtension(fileName: string, expectedExtension: string): UploadError | null;
/**
 * Validate MIME type (if available)
 */
export declare function validateMimeType(mimeType: string | undefined, expectedExtension: string): UploadError | null;
/**
 * Validate minimum row count
 */
export declare function validateRowCount(rowCount: number): UploadError | null;
/**
 * Validate required columns are present
 */
export declare function validateRequiredColumns(headers: string[], requiredColumns: string[], columnMapping?: Record<string, string>): UploadError | null;
/**
 * Validate data type
 */
export declare function validateDataType(value: any, expectedType: 'number' | 'string' | 'date' | 'boolean', column: string, row: number): ValidationErrorDetail | null;
//# sourceMappingURL=fileValidation.d.ts.map