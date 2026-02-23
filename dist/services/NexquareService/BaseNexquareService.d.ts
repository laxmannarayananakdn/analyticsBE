/**
 * Base Nexquare Service
 * Provides shared utilities for token management and API requests
 */
import type { NexquareConfig } from '../../middleware/configLoader.js';
export declare class BaseNexquareService {
    protected tokenCache: Map<number, {
        token: string;
        expiresAt: number;
    }>;
    protected currentSchoolId: string | null;
    /**
     * Get or refresh OAuth access token
     */
    protected getAccessToken(config: NexquareConfig, forceRefresh?: boolean): Promise<string>;
    /**
     * Generic method for making HTTP requests to the Nexquare API
     */
    makeRequest<T>(endpoint: string, config: NexquareConfig, options?: RequestInit, retryOnAuthError?: boolean): Promise<T>;
    /**
     * Make HTTP request that returns file response (CSV or Excel)
     * Returns both the buffer and content type
     */
    protected makeFileRequest(endpoint: string, config: NexquareConfig, options?: RequestInit, retryOnAuthError?: boolean): Promise<{
        buffer: Buffer;
        contentType: string;
    }>;
    /**
     * Get current school ID
     */
    getCurrentSchoolId(): string | null;
    /**
     * Set current school ID
     */
    protected setCurrentSchoolId(schoolId: string | null): void;
    /**
     * Get school sourced_id from sourced_id or numeric id
     * Returns the sourced_id for use in school_id columns (NEX tables use sourced_id after migration)
     */
    protected getSchoolSourcedId(schoolIdOrSourcedId: string): Promise<string | null>;
    /**
     * Clear cached token (useful for testing or forced refresh)
     */
    clearToken(configId?: number): void;
    /**
     * Format date for API (YYYY-MM-DD)
     */
    protected formatDateForAPI(date: Date): string;
}
//# sourceMappingURL=BaseNexquareService.d.ts.map