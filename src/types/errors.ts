/**
 * Error Types for EF Upload System
 */

export interface ValidationErrorDetail {
  row?: number;         // Row number (1-indexed)
  column?: string;      // Column name
  value?: string;       // The problematic value
  expected?: string;    // What was expected
  message?: string;     // Additional error message
}

export interface UploadError {
  code: string;         // Error code (e.g., 'INVALID_FILE_TYPE', 'PARSE_ERROR', 'DB_ERROR')
  message: string;     // User-friendly message
  details?: ValidationErrorDetail[];  // Array of detailed errors
  step?: 'VALIDATION' | 'PARSE' | 'VALIDATE_DATA' | 'INSERT' | 'UNKNOWN';  // Which step failed
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T[];
  errors: UploadError[];
  skippedRows?: number;  // Number of rows skipped due to validation errors
  totalRows?: number;    // Total rows processed
}

export enum ErrorCode {
  // File validation errors
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_EXTENSION = 'INVALID_FILE_EXTENSION',
  INVALID_MIME_TYPE = 'INVALID_MIME_TYPE',
  EMPTY_FILE = 'EMPTY_FILE',
  INSUFFICIENT_ROWS = 'INSUFFICIENT_ROWS',
  
  // Parse errors
  PARSE_ERROR = 'PARSE_ERROR',
  INVALID_FORMAT = 'INVALID_FORMAT',
  MISSING_HEADERS = 'MISSING_HEADERS',
  
  // Data validation errors
  MISSING_REQUIRED_COLUMN = 'MISSING_REQUIRED_COLUMN',
  INVALID_DATA_TYPE = 'INVALID_DATA_TYPE',
  INVALID_VALUE = 'INVALID_VALUE',
  DUPLICATE_ROW = 'DUPLICATE_ROW',
  
  // Database errors
  DB_ERROR = 'DB_ERROR',
  INSERT_ERROR = 'INSERT_ERROR',
  
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

