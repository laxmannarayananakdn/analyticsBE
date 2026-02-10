/**
 * Base Nexquare Service
 * Provides shared utilities for token management and API requests
 */
import { getNexquareHeaders, getTokenRequestHeaders, NEXQUARE_ENDPOINTS, NEXQUARE_CONFIG, } from '../../config/nexquare';
import { retryOperation, handleApiError } from '../../utils/apiUtils';
import { executeQuery } from '../../config/database';
export class BaseNexquareService {
    // Token cache per config (keyed by config ID)
    tokenCache = new Map();
    currentSchoolId = null;
    /**
     * Get or refresh OAuth access token
     */
    async getAccessToken(config, forceRefresh = false) {
        const now = Math.floor(Date.now() / 1000);
        const cached = this.tokenCache.get(config.id);
        // Check if we have a valid cached token for this config
        if (!forceRefresh && cached && cached.expiresAt && now < cached.expiresAt) {
            return cached.token;
        }
        try {
            console.log(`🔐 Fetching Nexquare OAuth token for config ${config.id}...`);
            // Build token URL from config's domain_url
            const domainUrl = config.domain_url.startsWith('http')
                ? config.domain_url
                : `https://${config.domain_url}`;
            const tokenUrl = `${domainUrl}${NEXQUARE_ENDPOINTS.TOKEN}`;
            const formData = new URLSearchParams();
            formData.append('grant_type', 'client_credentials');
            formData.append('client_id', config.client_id);
            formData.append('client_secret', config.client_secret);
            const response = await retryOperation(async () => {
                const res = await fetch(tokenUrl, {
                    method: 'POST',
                    headers: getTokenRequestHeaders(),
                    body: formData.toString(),
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${res.statusText}. Response: ${errorText.substring(0, 200)}`);
                }
                return await res.json();
            }, NEXQUARE_CONFIG.RETRY_ATTEMPTS);
            const tokenData = response;
            if (!tokenData.access_token) {
                throw new Error('Invalid token response: missing access_token');
            }
            // Cache token with expiration per config
            const expiresIn = tokenData.expires_in || 86400; // Default to 24 hours
            // Set expiration time with buffer (refresh 5 minutes before expiry)
            const expiresAt = now + expiresIn - NEXQUARE_CONFIG.TOKEN_EXPIRY_BUFFER;
            this.tokenCache.set(config.id, {
                token: tokenData.access_token,
                expiresAt
            });
            console.log('✅ OAuth token obtained successfully');
            console.log(`   Token expires in: ${expiresIn} seconds`);
            return tokenData.access_token;
        }
        catch (error) {
            console.error('❌ Failed to get OAuth token:', error);
            throw handleApiError(error);
        }
    }
    /**
     * Generic method for making HTTP requests to the Nexquare API
     */
    async makeRequest(endpoint, config, options = {}, retryOnAuthError = true) {
        try {
            const token = await this.getAccessToken(config);
            // Build URL from config's domain_url
            const domainUrl = config.domain_url.startsWith('http')
                ? config.domain_url
                : `https://${config.domain_url}`;
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const url = `${domainUrl}${cleanEndpoint}`;
            const method = (options.method || 'GET').toUpperCase();
            const headers = {
                ...getNexquareHeaders(token),
                ...options.headers,
            };
            const requestOptions = {
                ...options,
                headers,
                method,
            };
            const response = await retryOperation(async () => {
                const res = await fetch(url, requestOptions);
                // Handle 401 Unauthorized - token might be expired
                if (res.status === 401 && retryOnAuthError) {
                    console.log('🔄 Token expired, refreshing...');
                    const newToken = await this.getAccessToken(config, true);
                    // Retry with new token
                    const retryHeaders = {
                        ...getNexquareHeaders(newToken),
                        ...options.headers,
                    };
                    const retryRes = await fetch(url, {
                        ...requestOptions,
                        headers: retryHeaders,
                    });
                    if (!retryRes.ok) {
                        const errorText = await retryRes.text();
                        throw new Error(`HTTP ${retryRes.status}: ${retryRes.statusText}. Response: ${errorText.substring(0, 200)}`);
                    }
                    return await retryRes.json();
                }
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${res.statusText}. Response: ${errorText.substring(0, 200)}`);
                }
                return await res.json();
            }, NEXQUARE_CONFIG.RETRY_ATTEMPTS);
            return response;
        }
        catch (error) {
            console.error('💥 Nexquare API request failed:', error);
            throw handleApiError(error);
        }
    }
    /**
     * Make HTTP request that returns file response (CSV or Excel)
     * Returns both the buffer and content type
     */
    async makeFileRequest(endpoint, config, options = {}, retryOnAuthError = true) {
        try {
            const token = await this.getAccessToken(config);
            // Build URL from config's domain_url
            const domainUrl = config.domain_url.startsWith('http')
                ? config.domain_url
                : `https://${config.domain_url}`;
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const url = `${domainUrl}${cleanEndpoint}`;
            const method = (options.method || 'GET').toUpperCase();
            const headers = {
                ...getNexquareHeaders(token),
                ...options.headers,
            };
            const requestOptions = {
                ...options,
                headers,
                method,
            };
            const response = await retryOperation(async () => {
                const res = await fetch(url, requestOptions);
                // Handle 401 Unauthorized - token might be expired
                if (res.status === 401 && retryOnAuthError) {
                    console.log('🔄 Token expired, refreshing...');
                    const newToken = await this.getAccessToken(config, true);
                    // Retry with new token
                    const retryHeaders = {
                        ...getNexquareHeaders(newToken),
                        ...options.headers,
                    };
                    const retryRes = await fetch(url, {
                        ...requestOptions,
                        headers: retryHeaders,
                    });
                    if (!retryRes.ok) {
                        const errorText = await retryRes.text();
                        throw new Error(`HTTP ${retryRes.status}: ${retryRes.statusText}. Response: ${errorText.substring(0, 200)}`);
                    }
                    const contentType = retryRes.headers.get('content-type') || 'application/octet-stream';
                    const arrayBuffer = await retryRes.arrayBuffer();
                    return {
                        buffer: Buffer.from(arrayBuffer),
                        contentType
                    };
                }
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${res.statusText}. Response: ${errorText.substring(0, 200)}`);
                }
                const contentType = res.headers.get('content-type') || 'application/octet-stream';
                const arrayBuffer = await res.arrayBuffer();
                return {
                    buffer: Buffer.from(arrayBuffer),
                    contentType
                };
            }, NEXQUARE_CONFIG.RETRY_ATTEMPTS);
            return response;
        }
        catch (error) {
            console.error('💥 Nexquare API file request failed:', error);
            throw handleApiError(error);
        }
    }
    /**
     * Get current school ID
     */
    getCurrentSchoolId() {
        return this.currentSchoolId || null;
    }
    /**
     * Set current school ID
     */
    setCurrentSchoolId(schoolId) {
        this.currentSchoolId = schoolId;
    }
    /**
     * Get school sourced_id from sourced_id
     * Returns the sourced_id (not database id) for use in school_id columns
     */
    async getSchoolSourcedId(schoolSourcedId) {
        try {
            const query = `
        SELECT sourced_id FROM NEX.schools WHERE sourced_id = @sourced_id;
      `;
            const result = await executeQuery(query, {
                sourced_id: schoolSourcedId,
            });
            if (result.error || !result.data || result.data.length === 0) {
                console.warn(`⚠️  School with sourced_id "${schoolSourcedId}" not found in database`);
                return null;
            }
            return result.data[0].sourced_id;
        }
        catch (error) {
            console.error(`Error getting school sourced_id for ${schoolSourcedId}:`, error);
            return null;
        }
    }
    /**
     * Clear cached token (useful for testing or forced refresh)
     */
    clearToken(configId) {
        if (configId) {
            this.tokenCache.delete(configId);
            console.log(`🗑️  Token cache cleared for config ${configId}`);
        }
        else {
            this.tokenCache.clear();
            console.log('🗑️  All token caches cleared');
        }
    }
    /**
     * Format date for API (YYYY-MM-DD)
     */
    formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
//# sourceMappingURL=BaseNexquareService.js.map