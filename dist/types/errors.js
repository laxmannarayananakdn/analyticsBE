/**
 * Error Types for EF Upload System
 */
export var ErrorCode;
(function (ErrorCode) {
    // File validation errors
    ErrorCode["INVALID_FILE_TYPE"] = "INVALID_FILE_TYPE";
    ErrorCode["FILE_TOO_LARGE"] = "FILE_TOO_LARGE";
    ErrorCode["INVALID_FILE_EXTENSION"] = "INVALID_FILE_EXTENSION";
    ErrorCode["INVALID_MIME_TYPE"] = "INVALID_MIME_TYPE";
    ErrorCode["EMPTY_FILE"] = "EMPTY_FILE";
    ErrorCode["INSUFFICIENT_ROWS"] = "INSUFFICIENT_ROWS";
    // Parse errors
    ErrorCode["PARSE_ERROR"] = "PARSE_ERROR";
    ErrorCode["INVALID_FORMAT"] = "INVALID_FORMAT";
    ErrorCode["MISSING_HEADERS"] = "MISSING_HEADERS";
    // Data validation errors
    ErrorCode["MISSING_REQUIRED_COLUMN"] = "MISSING_REQUIRED_COLUMN";
    ErrorCode["INVALID_DATA_TYPE"] = "INVALID_DATA_TYPE";
    ErrorCode["INVALID_VALUE"] = "INVALID_VALUE";
    ErrorCode["DUPLICATE_ROW"] = "DUPLICATE_ROW";
    // Database errors
    ErrorCode["DB_ERROR"] = "DB_ERROR";
    ErrorCode["INSERT_ERROR"] = "INSERT_ERROR";
    // General errors
    ErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorCode || (ErrorCode = {}));
//# sourceMappingURL=errors.js.map