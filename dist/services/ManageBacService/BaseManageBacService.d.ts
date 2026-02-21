/**
 * Base ManageBac Service
 * Provides shared utilities for API requests, pagination, and URL building
 */
import type { AcademicYear, AcademicTerm } from '../../types/managebac.js';
import type { ApiResponse } from '../../types/managebac.js';
export declare class BaseManageBacService {
    protected currentSchoolId: number | null;
    protected studentsSyncedFromYearGroups: boolean;
    /**
     * Generic method for making HTTP requests to the ManageBac API
     */
    protected makeRequest<T>(endpoint: string, apiKey: string, options?: RequestInit, baseUrl?: string): Promise<ApiResponse<T>>;
    /**
     * Make request and return raw response (including meta for pagination)
     */
    protected makeRequestRaw(endpoint: string, apiKey: string, options?: RequestInit, baseUrl?: string): Promise<any>;
    /**
     * Fetch all pages for a paginated ManageBac list endpoint
     */
    protected fetchAllPaginated<T>(endpointBase: string, dataKey: string, apiKey: string, baseUrl: string | undefined, existingParams?: Record<string, string>, logLabel?: string): Promise<T[]>;
    /**
     * Build ManageBac URL with custom base URL
     */
    protected buildManageBacUrl(endpoint: string, baseUrl: string): string;
    getCurrentSchoolId(): number | null;
    setCurrentSchoolId(schoolId: number): void;
    /**
     * Normalize date string (YYYY-MM-DD)
     */
    protected normalizeDate(date?: string | null): string | null;
    /**
     * Get normalized start/end dates for an academic year
     */
    protected getAcademicYearDates(year: AcademicYear): {
        startsOn: string;
        endsOn: string;
    };
    /**
     * Get normalized start/end dates for an academic term
     */
    protected getAcademicTermDates(term: AcademicTerm, defaultStart: string, defaultEnd: string): {
        startsOn: string;
        endsOn: string;
    };
    /**
     * Resolve program code to API key
     */
    protected resolveProgramKey(requestedCode: string, academicData: Record<string, any>): string | null;
    /**
     * Map program names/codes to canonical API codes
     */
    protected resolveProgramCodeFromName(program?: string | null): string | null;
}
//# sourceMappingURL=BaseManageBacService.d.ts.map