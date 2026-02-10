/**
 * File Validation Utilities
 */

import { UploadError, ErrorCode, ValidationErrorDetail } from '../types/errors';
import * as path from 'path';

// Configurable limits
export const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024; // 10MB default
export const MIN_ROWS_REQUIRED = parseInt(process.env.MIN_ROWS_REQUIRED || '1');

// MIME type mapping
const MIME_TYPES: Record<string, string[]> = {
  'csv': ['text/csv', 'application/csv', 'text/plain'],
  'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  'xls': ['application/vnd.ms-excel']
};

/**
 * Validate file size
 */
export function validateFileSize(fileSize: number): UploadError | null {
  if (fileSize === 0) {
    return {
      code: ErrorCode.EMPTY_FILE,
      message: 'File is empty',
      step: 'VALIDATION'
    };
  }

  if (fileSize > MAX_FILE_SIZE) {
    return {
      code: ErrorCode.FILE_TOO_LARGE,
      message: `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      step: 'VALIDATION'
    };
  }

  return null;
}

/**
 * Validate file extension
 */
export function validateFileExtension(
  fileName: string,
  expectedExtension: string
): UploadError | null {
  const fileExtension = path.extname(fileName).toLowerCase();
  const expected = expectedExtension.startsWith('.') 
    ? expectedExtension.toLowerCase() 
    : `.${expectedExtension.toLowerCase()}`;

  if (fileExtension !== expected) {
    return {
      code: ErrorCode.INVALID_FILE_EXTENSION,
      message: `Invalid file extension. Expected ${expected}, but received ${fileExtension}`,
      step: 'VALIDATION',
      details: [{
        value: fileExtension,
        expected: expected
      }]
    };
  }

  return null;
}

/**
 * Validate MIME type (if available)
 */
export function validateMimeType(
  mimeType: string | undefined,
  expectedExtension: string
): UploadError | null {
  if (!mimeType) {
    // MIME type not available, skip validation
    return null;
  }

  const ext = expectedExtension.startsWith('.') 
    ? expectedExtension.slice(1).toLowerCase()
    : expectedExtension.toLowerCase();

  const allowedMimeTypes = MIME_TYPES[ext] || [];
  
  if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(mimeType)) {
    return {
      code: ErrorCode.INVALID_MIME_TYPE,
      message: `Invalid MIME type. Expected one of: ${allowedMimeTypes.join(', ')}, but received ${mimeType}`,
      step: 'VALIDATION',
      details: [{
        value: mimeType,
        expected: allowedMimeTypes.join(' or ')
      }]
    };
  }

  return null;
}

/**
 * Validate minimum row count
 */
export function validateRowCount(rowCount: number): UploadError | null {
  if (rowCount < MIN_ROWS_REQUIRED) {
    return {
      code: ErrorCode.INSUFFICIENT_ROWS,
      message: `File must contain at least ${MIN_ROWS_REQUIRED} data row(s). Found ${rowCount} row(s)`,
      step: 'VALIDATION',
      details: [{
        value: rowCount.toString(),
        expected: `at least ${MIN_ROWS_REQUIRED}`
      }]
    };
  }

  return null;
}

/**
 * Validate required columns are present
 */
export function validateRequiredColumns(
  headers: string[],
  requiredColumns: string[],
  columnMapping?: Record<string, string>
): UploadError | null {
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
  const missingColumns: string[] = [];

  for (const required of requiredColumns) {
    const normalizedRequired = required.toLowerCase().trim();
    const mappedColumn = columnMapping?.[normalizedRequired];
    
    // Check direct match or mapped column
    const found = normalizedHeaders.some(h => 
      h === normalizedRequired || 
      h === mappedColumn?.toLowerCase() ||
      (mappedColumn && normalizedHeaders.includes(mappedColumn.toLowerCase()))
    );

    if (!found) {
      missingColumns.push(required);
    }
  }

  if (missingColumns.length > 0) {
    return {
      code: ErrorCode.MISSING_REQUIRED_COLUMN,
      message: `Missing required columns: ${missingColumns.join(', ')}`,
      step: 'VALIDATE_DATA',
      details: missingColumns.map(col => ({
        column: col,
        expected: 'column must be present'
      }))
    };
  }

  return null;
}

/**
 * Validate data type
 */
export function validateDataType(
  value: any,
  expectedType: 'number' | 'string' | 'date' | 'boolean',
  column: string,
  row: number
): ValidationErrorDetail | null {
  if (value === null || value === undefined || value === '') {
    return null; // Allow empty values
  }

  switch (expectedType) {
    case 'number':
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(num)) {
        return {
          row,
          column,
          value: String(value),
          expected: 'number',
          message: `Value "${value}" is not a valid number`
        };
      }
      break;

    case 'date':
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return {
          row,
          column,
          value: String(value),
          expected: 'date',
          message: `Value "${value}" is not a valid date`
        };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean' && 
          !['true', 'false', '1', '0', 'yes', 'no'].includes(String(value).toLowerCase())) {
        return {
          row,
          column,
          value: String(value),
          expected: 'boolean',
          message: `Value "${value}" is not a valid boolean`
        };
      }
      break;
  }

  return null;
}

