/**
 * Base ManageBac Service
 * Provides shared utilities for API requests, pagination, and URL building
 */

import { getManageBacHeaders, MANAGEBAC_ENDPOINTS, MANAGEBAC_CONFIG } from '../../config/managebac.js';
import { retryOperation, validateApiResponse, handleApiError } from '../../utils/apiUtils.js';
import type { AcademicYear, AcademicTerm } from '../../types/managebac.js';
import type { ApiResponse } from '../../types/managebac.js';

export class BaseManageBacService {
  protected currentSchoolId: number | null = null;
  protected studentsSyncedFromYearGroups = false;

  /**
   * Generic method for making HTTP requests to the ManageBac API
   */
  protected async makeRequest<T>(
    endpoint: string,
    apiKey: string,
    options: RequestInit = {},
    baseUrl?: string
  ): Promise<ApiResponse<T>> {
    const result = await this.makeRequestRaw(endpoint, apiKey, options, baseUrl);
    return validateApiResponse<T>(result);
  }

  /**
   * Make request and return raw response (including meta for pagination)
   */
  protected async makeRequestRaw(
    endpoint: string,
    apiKey: string,
    options: RequestInit = {},
    baseUrl?: string
  ): Promise<any> {
    const url = baseUrl
      ? this.buildManageBacUrl(endpoint, baseUrl)
      : this.buildManageBacUrl(endpoint, MANAGEBAC_CONFIG.DEFAULT_BASE_URL);
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
      ...getManageBacHeaders(apiKey, method),
      ...options.headers,
    };

    const requestOptions: RequestInit = {
      ...options,
      headers,
      method,
    };

    try {
      const response = await retryOperation(async () => {
        const res = await fetch(url, requestOptions);

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`HTTP ${res.status}: ${res.statusText}. Response: ${errorText.substring(0, 200)}`);
        }

        return await res.json();
      }, 3);

      return response;
    } catch (error) {
      console.error('💥 ManageBac API request failed:', error);
      throw handleApiError(error);
    }
  }

  /**
   * Fetch all pages for a paginated ManageBac list endpoint
   */
  protected async fetchAllPaginated<T>(
    endpointBase: string,
    dataKey: string,
    apiKey: string,
    baseUrl: string | undefined,
    existingParams: Record<string, string> = {},
    logLabel: string = 'Items'
  ): Promise<T[]> {
    const allItems: T[] = [];
    let page = 1;
    let totalPages = 1;
    const perPage = 250;

    do {
      const params = new URLSearchParams({ ...existingParams, page: String(page), per_page: String(perPage) });
      const endpoint = `${endpointBase}?${params.toString()}`;
      const rawResponse = await this.makeRequestRaw(endpoint, apiKey, {}, baseUrl);

      const raw = rawResponse.data ?? rawResponse;
      const items = (Array.isArray(raw) ? raw : (raw?.[dataKey] ?? [])) as T[];
      allItems.push(...items);

      const meta = rawResponse.meta ?? raw?.meta;
      totalPages = meta?.total_pages ?? 1;
      if (items.length > 0) {
        console.log(`   📄 ${logLabel} page ${page}/${totalPages} (${items.length} items)`);
      }
      page++;
    } while (page <= totalPages);

    return allItems;
  }

  /**
   * Build ManageBac URL with custom base URL
   */
  protected buildManageBacUrl(endpoint: string, baseUrl: string): string {
    let cleanBaseUrl = baseUrl.replace(/\/$/, '');

    if (cleanBaseUrl.includes('.managebac.com') && !cleanBaseUrl.includes('api.managebac.com')) {
      console.log(`   ⚠️  Detected school subdomain, converting to api.managebac.com`);
      cleanBaseUrl = 'https://api.managebac.com';
    }

    if (!cleanBaseUrl.startsWith('http://') && !cleanBaseUrl.startsWith('https://')) {
      cleanBaseUrl = `https://${cleanBaseUrl}`;
    }

    if (!cleanBaseUrl.includes('/v2')) {
      cleanBaseUrl = `${cleanBaseUrl}/v2`;
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const finalUrl = `${cleanBaseUrl}${cleanEndpoint}`;
    console.log(`   🔗 Built URL: ${finalUrl}`);
    return finalUrl;
  }

  getCurrentSchoolId(): number | null {
    return this.currentSchoolId;
  }

  setCurrentSchoolId(schoolId: number): void {
    this.currentSchoolId = schoolId;
    this.studentsSyncedFromYearGroups = false;
  }

  /**
   * Normalize date string (YYYY-MM-DD)
   */
  protected normalizeDate(date?: string | null): string | null {
    if (!date) return null;
    return date.split('T')[0];
  }

  /**
   * Get normalized start/end dates for an academic year
   */
  protected getAcademicYearDates(year: AcademicYear): { startsOn: string; endsOn: string } {
    let startsOn = this.normalizeDate(year.starts_on);
    let endsOn = this.normalizeDate(year.ends_on);

    if (!startsOn || !endsOn) {
      const yearMatch = year.name?.match(/(\d{4})/);
      if (yearMatch) {
        const startYear = parseInt(yearMatch[1], 10);
        startsOn = startsOn || `${startYear}-08-01`;
        endsOn = endsOn || `${startYear + 1}-07-31`;
      } else {
        const currentYear = new Date().getFullYear();
        startsOn = startsOn || `${currentYear}-08-01`;
        endsOn = endsOn || `${currentYear + 1}-07-31`;
      }
    }

    return { startsOn, endsOn };
  }

  /**
   * Get normalized start/end dates for an academic term
   */
  protected getAcademicTermDates(
    term: AcademicTerm,
    defaultStart: string,
    defaultEnd: string
  ): { startsOn: string; endsOn: string } {
    const startsOn = this.normalizeDate(term.starts_on) || defaultStart;
    const endsOn = this.normalizeDate(term.ends_on) || defaultEnd;
    return { startsOn, endsOn };
  }

  /**
   * Resolve program code to API key
   */
  protected resolveProgramKey(requestedCode: string, academicData: Record<string, any>): string | null {
    if (!requestedCode) return null;

    const normalized = requestedCode.toLowerCase();
    if (academicData[normalized]) return normalized;

    const aliasMap: Record<string, string> = {
      ib: 'diploma', dp: 'diploma', ibdp: 'diploma', 'ib diploma': 'diploma', diploma: 'diploma',
      pyp: 'pyp', ibpyp: 'ibpyp', myp: 'myp', ibmyp: 'myp', ms: 'ms', hs: 'hs'
    };

    const mapped = aliasMap[normalized];
    if (mapped && academicData[mapped]) return mapped;
    return null;
  }

  /**
   * Map program names/codes to canonical API codes
   */
  protected resolveProgramCodeFromName(program?: string | null): string | null {
    if (!program) return null;

    const normalized = program.toLowerCase().trim();
    const aliasMap: Record<string, string> = {
      'ib diploma': 'diploma', diploma: 'diploma', 'ib middle years': 'myp', 'middle years': 'myp',
      myp: 'myp', 'ib primary years': 'pyp', 'primary years': 'pyp', pyp: 'pyp',
      ibpyp: 'pyp', 'ib pyp': 'pyp', ms: 'ms', hs: 'hs'
    };

    return aliasMap[normalized] || normalized;
  }
}
