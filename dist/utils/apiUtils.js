/**
 * Utility functions for API operations
 */
export class ApiUtilsError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = 'ApiUtilsError';
        this.code = code;
        this.details = details;
    }
}
export const handleApiError = (error) => {
    if (error.response) {
        const { status, data } = error.response;
        return {
            code: `HTTP_${status}`,
            message: data?.message || `HTTP Error ${status}`,
            details: data,
        };
    }
    else if (error.request) {
        return {
            code: 'NETWORK_ERROR',
            message: 'Unable to connect to the server. Please check your internet connection.',
            details: error.request,
        };
    }
    else {
        return {
            code: 'UNKNOWN_ERROR',
            message: error.message || 'An unexpected error occurred',
            details: error,
        };
    }
};
export const validateApiResponse = (response) => {
    if (!response || typeof response !== 'object') {
        throw new ApiUtilsError('INVALID_RESPONSE', 'Invalid API response format');
    }
    return {
        data: response.data || response,
        success: response.success !== false,
        message: response.message,
        errors: response.errors,
    };
};
export const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
export const retryOperation = async (operation, maxAttempts = 3, delayMs = 1000) => {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxAttempts) {
                break;
            }
            await delay(delayMs * Math.pow(2, attempt - 1));
        }
    }
    throw lastError;
};
export const formatApiDate = (date) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toISOString().split('T')[0];
};
export const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
//# sourceMappingURL=apiUtils.js.map