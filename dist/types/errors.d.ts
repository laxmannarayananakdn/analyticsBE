/**
 * Error Types for EF Upload System
 */
export interface ValidationErrorDetail {
    row?: number;
    column?: string;
    value?: string;
    expected?: string;
    message?: string;
}
export interface UploadError {
    code: string;
    message: string;
    details?: ValidationErrorDetail[];
    step?: 'VALIDATION' | 'PARSE' | 'VALIDATE_DATA' | 'INSERT' | 'UNKNOWN';
}
export interface ValidationResult<T> {
    valid: boolean;
    data?: T[];
    errors: UploadError[];
    skippedRows?: number;
    totalRows?: number;
}
export declare enum ErrorCode {
    INVALID_FILE_TYPE = "INVALID_FILE_TYPE",
    FILE_TOO_LARGE = "FILE_TOO_LARGE",
    INVALID_FILE_EXTENSION = "INVALID_FILE_EXTENSION",
    INVALID_MIME_TYPE = "INVALID_MIME_TYPE",
    EMPTY_FILE = "EMPTY_FILE",
    INSUFFICIENT_ROWS = "INSUFFICIENT_ROWS",
    PARSE_ERROR = "PARSE_ERROR",
    INVALID_FORMAT = "INVALID_FORMAT",
    MISSING_HEADERS = "MISSING_HEADERS",
    MISSING_REQUIRED_COLUMN = "MISSING_REQUIRED_COLUMN",
    INVALID_DATA_TYPE = "INVALID_DATA_TYPE",
    INVALID_VALUE = "INVALID_VALUE",
    DUPLICATE_ROW = "DUPLICATE_ROW",
    DB_ERROR = "DB_ERROR",
    INSERT_ERROR = "INSERT_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
//# sourceMappingURL=errors.d.ts.map