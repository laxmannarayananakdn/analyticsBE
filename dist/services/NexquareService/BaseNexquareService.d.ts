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
     * Validate school exists in NEX.schools by sourced_id and return it.
     * Standard: nexquare_school_config.school_id = NEX.schools.sourced_id.
     * All NEX/RP tables use school_id = this value.
     */
    protected getSchoolSourcedId(schoolId: string): Promise<string | null>;
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