/**
 * Base ManageBac Service
 * Provides shared utilities for API requests, pagination, and URL building
 */
import { getManageBacHeaders, MANAGEBAC_CONFIG } from '../../config/managebac.js';
import { retryOperation, validateApiResponse, handleApiError } from '../../utils/apiUtils.js';
export class BaseManageBacService {
    currentSchoolId = null;
    studentsSyncedFromYearGroups = false;
    /**
     * Generic method for making HTTP requests to the ManageBac API
     */
    async makeRequest(endpoint, apiKey, options = {}, baseUrl) {
        const result = await this.makeRequestRaw(endpoint, apiKey, options, baseUrl);
        return validateApiResponse(result);
    }
    /**
     * Make request and return raw response (including meta for pagination)
     */
    async makeRequestRaw(endpoint, apiKey, options = {}, baseUrl) {
        const url = baseUrl
            ? this.buildManageBacUrl(endpoint, baseUrl)
            : this.buildManageBacUrl(endpoint, MANAGEBAC_CONFIG.DEFAULT_BASE_URL);
        const method = (options.method || 'GET').toUpperCase();
        const headers = {
            ...getManageBacHeaders(apiKey, method),
            ...options.headers,
        };
        const requestOptions = {
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
        }
        catch (error) {
            console.error('💥 ManageBac API request failed:', error);
            throw handleApiError(error);
        }
    }
    /**
     * Fetch all pages for a paginated ManageBac list endpoint
     */
    async fetchAllPaginated(endpointBase, dataKey, apiKey, baseUrl, existingParams = {}, logLabel = 'Items') {
        const allItems = [];
        let page = 1;
        let totalPages = 1;
        const perPage = 250;
        do {
            const params = new URLSearchParams({ ...existingParams, page: String(page), per_page: String(perPage) });
            const endpoint = `${endpointBase}?${params.toString()}`;
            const rawResponse = await this.makeRequestRaw(endpoint, apiKey, {}, baseUrl);
            const raw = rawResponse.data ?? rawResponse;
            const items = (Array.isArray(raw) ? raw : (raw?.[dataKey] ?? []));
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
    buildManageBacUrl(endpoint, baseUrl) {
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
    getCurrentSchoolId() {
        return this.currentSchoolId;
    }
    setCurrentSchoolId(schoolId) {
        this.currentSchoolId = schoolId;
        this.studentsSyncedFromYearGroups = false;
    }
    /**
     * Normalize date string (YYYY-MM-DD)
     */
    normalizeDate(date) {
        if (!date)
            return null;
        return date.split('T')[0];
    }
    /**
     * Get normalized start/end dates for an academic year
     */
    getAcademicYearDates(year) {
        let startsOn = this.normalizeDate(year.starts_on);
        let endsOn = this.normalizeDate(year.ends_on);
        if (!startsOn || !endsOn) {
            const yearMatch = year.name?.match(/(\d{4})/);
            if (yearMatch) {
                const startYear = parseInt(yearMatch[1], 10);
                startsOn = startsOn || `${startYear}-08-01`;
                endsOn = endsOn || `${startYear + 1}-07-31`;
            }
            else {
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
    getAcademicTermDates(term, defaultStart, defaultEnd) {
        const startsOn = this.normalizeDate(term.starts_on) || defaultStart;
        const endsOn = this.normalizeDate(term.ends_on) || defaultEnd;
        return { startsOn, endsOn };
    }
    /**
     * Resolve program code to API key
     */
    resolveProgramKey(requestedCode, academicData) {
        if (!requestedCode)
            return null;
        const normalized = requestedCode.toLowerCase();
        if (academicData[normalized])
            return normalized;
        const aliasMap = {
            ib: 'diploma', dp: 'diploma', ibdp: 'diploma', 'ib diploma': 'diploma', diploma: 'diploma',
            pyp: 'pyp', ibpyp: 'ibpyp', myp: 'myp', ibmyp: 'myp', ms: 'ms', hs: 'hs'
        };
        const mapped = aliasMap[normalized];
        if (mapped && academicData[mapped])
            return mapped;
        return null;
    }
    /**
     * Map program names/codes to canonical API codes
     */
    resolveProgramCodeFromName(program) {
        if (!program)
            return null;
        const normalized = program.toLowerCase().trim();
        const aliasMap = {
            'ib diploma': 'diploma', diploma: 'diploma', 'ib middle years': 'myp', 'middle years': 'myp',
            myp: 'myp', 'ib primary years': 'pyp', 'primary years': 'pyp', pyp: 'pyp',
            ibpyp: 'pyp', 'ib pyp': 'pyp', ms: 'ms', hs: 'hs'
        };
        return aliasMap[normalized] || normalized;
    }
}
//# sourceMappingURL=BaseManageBacService.js.map