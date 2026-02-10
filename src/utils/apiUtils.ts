/**
 * Utility functions for API operations
 */

export class ApiUtilsError extends Error {
  code: string;
  details?: any;

  constructor(code: string, message: string, details?: any) {
    super(message);
    this.name = 'ApiUtilsError';
    this.code = code;
    this.details = details;
  }
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export const handleApiError = (error: any): ApiError => {
  if (error.response) {
    const { status, data } = error.response;
    return {
      code: `HTTP_${status}`,
      message: data?.message || `HTTP Error ${status}`,
      details: data,
    };
  } else if (error.request) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Unable to connect to the server. Please check your internet connection.',
      details: error.request,
    };
  } else {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: error,
    };
  }
};

export const validateApiResponse = <T>(response: any): { data: T; success: boolean; message?: string; errors?: string[] } => {
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

export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        break;
      }

      await delay(delayMs * Math.pow(2, attempt - 1));
    }
  }

  throw lastError!;
};

export const formatApiDate = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toISOString().split('T')[0];
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

