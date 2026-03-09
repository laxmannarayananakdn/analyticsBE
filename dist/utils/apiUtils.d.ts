/**
 * Utility functions for API operations
 */
export declare class ApiUtilsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any);
}
export interface ApiError {
    code: string;
    message: string;
    details?: any;
}
export declare const handleApiError: (error: any) => ApiError;
export declare const validateApiResponse: <T>(response: any) => {
    data: T;
    success: boolean;
    message?: string;
    errors?: string[];
};
export declare const delay: (ms: number) => Promise<void>;
export interface RetryOptions {
    maxAttempts?: number;
    delayMs?: number;
    /** When error is HTTP 429 (rate limit), wait this long before retry. Default 90s. */
    rateLimitDelayMs?: number;
}
export declare const retryOperation: <T>(operation: () => Promise<T>, maxAttemptsOrOptions?: number | RetryOptions, delayMs?: number) => Promise<T>;
export declare const formatApiDate: (date: string | Date) => string;
export declare const isValidEmail: (email: string) => boolean;
//# sourceMappingURL=apiUtils.d.ts.map