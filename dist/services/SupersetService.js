/**
 * Superset Service
 * Handles Superset API authentication and guest token generation
 */
/** Thrown when Superset returns 403 for guest token (user has no access to dashboard) */
export class SupersetAccessDeniedError extends Error {
    userEmail;
    constructor(userEmail) {
        super(`User ${userEmail} does not have access to this dashboard.`);
        this.userEmail = userEmail;
        this.name = 'SupersetAccessDeniedError';
    }
}
export class SupersetService {
    config;
    accessTokenCache = null;
    constructor() {
        // Get Superset configuration from environment variables
        this.config = {
            baseUrl: process.env.SUPERSET_URL || 'https://superset-edtech-app.azurewebsites.net',
            username: process.env.SUPERSET_USERNAME || 'admin',
            password: process.env.SUPERSET_PASSWORD || '',
            apiKey: process.env.SUPERSET_API_KEY,
            guestToken: process.env.SUPERSET_GUEST_TOKEN,
        };
        // Log configuration (without sensitive data)
        console.log('🔧 Superset Service initialized:');
        console.log(`   Base URL: ${this.config.baseUrl}`);
        console.log(`   Using Guest Token: ${!!this.config.guestToken}`);
        console.log(`   Using API Key: ${!!this.config.apiKey}`);
        if (!this.config.guestToken && !this.config.apiKey) {
            console.log(`   Username: ${this.config.username}`);
        }
    }
    /**
     * Get CSRF token from Superset, plus session cookie for subsequent POSTs.
     * @param bearerToken - When provided, use Bearer auth (required by some Superset instances).
     *                      When absent, fallback to Basic auth.
     */
    async getCsrfToken(bearerToken) {
        const baseHeaders = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (bearerToken) {
            baseHeaders['Authorization'] = `Bearer ${bearerToken}`;
        }
        else {
            const basicCreds = Buffer.from(`${this.config.username}:${this.config.password}`, 'utf-8').toString('base64');
            baseHeaders['Authorization'] = `Basic ${basicCreds}`;
        }
        try {
            console.log(`🔐 Fetching CSRF token from ${this.config.baseUrl}/api/v1/security/csrf_token/`);
            const response = await fetch(`${this.config.baseUrl}/api/v1/security/csrf_token/`, { method: 'GET', headers: baseHeaders, redirect: 'follow' });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ CSRF token endpoint returned ${response.status}: ${errorText.substring(0, 200)}`);
                if (response.status === 401 || response.status === 403) {
                    throw new Error(`CSRF endpoint returned ${response.status}. This Superset instance may require Bearer token.`);
                }
                throw new Error(`Failed to get CSRF token: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            const getSetCookie = response.headers.getSetCookie;
            const setCookies = getSetCookie ? getSetCookie.call(response.headers) : null;
            const cookieHeader = setCookies?.length
                ? setCookies.map((c) => c.split(';')[0].trim()).join('; ')
                : response.headers.get('set-cookie')?.split(';')[0].trim();
            console.log('✅ CSRF token obtained successfully');
            return { token: data.result, cookieHeader };
        }
        catch (error) {
            console.error('Error getting CSRF token:', error);
            throw error;
        }
    }
    /**
     * Authenticate with Superset and get access token
     * Uses API key if available, otherwise uses username/password
     */
    async getAccessToken(forceRefresh = false) {
        // Check cache
        const now = Date.now();
        if (!forceRefresh && this.accessTokenCache && this.accessTokenCache.expiresAt > now) {
            return this.accessTokenCache.token;
        }
        try {
            // If API key is available, use it directly
            if (this.config.apiKey) {
                this.accessTokenCache = {
                    token: this.config.apiKey,
                    expiresAt: now + 3600000, // Cache for 1 hour
                };
                return this.config.apiKey;
            }
            // Otherwise, authenticate with username/password
            console.log(`🔐 Attempting to authenticate with username: ${this.config.username}`);
            const loginHeaders = {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            };
            // Try with CSRF token first (some instances require it); fallback to login without if CSRF fails
            try {
                const { token: csrfToken } = await this.getCsrfToken();
                loginHeaders['X-CSRFToken'] = csrfToken;
            }
            catch (csrfErr) {
                console.log('   CSRF token unavailable, attempting login without it (some instances allow this)');
            }
            console.log(`🔐 Logging in to Superset...`);
            const response = await fetch(`${this.config.baseUrl}/api/v1/security/login`, {
                method: 'POST',
                headers: loginHeaders,
                body: JSON.stringify({
                    username: this.config.username,
                    password: this.config.password,
                    provider: 'db',
                    refresh: true,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Login failed: ${response.status} ${response.statusText}`);
                console.error(`   Response: ${errorText.substring(0, 200)}`);
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}. Check your SUPERSET_USERNAME and SUPERSET_PASSWORD.`);
            }
            const data = await response.json();
            const accessToken = data.access_token;
            if (!accessToken) {
                console.error('❌ No access_token in login response');
                throw new Error('No access token in response');
            }
            console.log('✅ Successfully authenticated with Superset');
            // Cache token for 50 minutes (tokens typically last 1 hour)
            this.accessTokenCache = {
                token: accessToken,
                expiresAt: now + 3000000, // 50 minutes
            };
            return accessToken;
        }
        catch (error) {
            console.error('Error authenticating with Superset:', error);
            throw new Error(`Failed to authenticate with Superset: ${error.message}`);
        }
    }
    /**
     * Generate a guest token for embedded dashboards
     * @param dashboardId - Dashboard ID (numeric or UUID string)
     * @param resources - Optional resources array
     * @param usePreGenerated - If true and SUPERSET_GUEST_TOKEN is set, return it (use only when token matches dashboard)
     * @param user - Logged-in user for Superset (username = email). Superset will apply this user's permissions.
     */
    async generateGuestToken(dashboardId, resources, usePreGenerated = false, user) {
        try {
            // Pre-generated token is dashboard-specific; only use when caller doesn't need a specific dashboard
            if (usePreGenerated && this.config.guestToken) {
                console.log('✅ Using pre-generated guest token from configuration');
                // Note: We can't determine expiry for pre-generated tokens, so we'll use a default
                // The frontend SDK will handle token refresh if needed
                return {
                    token: this.config.guestToken,
                    expires_in: 3600, // Default to 1 hour (actual expiry depends on token)
                };
            }
            // Otherwise, generate a new guest token using authentication
            console.log('🔐 Generating new guest token via authentication...');
            const accessToken = await this.getAccessToken();
            // CSRF endpoint on Azure Superset requires Bearer token, not Basic auth
            const { token: csrfToken, cookieHeader } = await this.getCsrfToken(accessToken);
            const dashboardIdStr = typeof dashboardId === 'string' ? dashboardId : String(dashboardId);
            const guestTokenRequest = {
                resources: resources || [{ type: 'dashboard', id: dashboardIdStr }],
                rls: [],
                user: user ?? {
                    username: 'guest',
                    first_name: 'Guest',
                    last_name: 'User',
                },
            };
            const guestTokenHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'X-CSRFToken': csrfToken,
                // Superset "referrer does not match the host" expects Referer to match request host (Superset URL)
                'Referer': `${this.config.baseUrl.replace(/\/$/, '')}/`,
            };
            if (cookieHeader) {
                guestTokenHeaders['Cookie'] = cookieHeader;
            }
            const response = await fetch(`${this.config.baseUrl}/api/v1/security/guest_token/`, {
                method: 'POST',
                headers: guestTokenHeaders,
                body: JSON.stringify(guestTokenRequest),
            });
            if (!response.ok) {
                const errorText = await response.text();
                if (response.status === 403 && user?.username) {
                    throw new SupersetAccessDeniedError(user.username);
                }
                throw new Error(`Failed to generate guest token: ${response.statusText}. ${errorText}`);
            }
            const data = await response.json();
            if (!data.token) {
                throw new Error('No guest token in response');
            }
            return {
                token: data.token,
                expires_in: data.expires_in || 3600, // Default to 1 hour
            };
        }
        catch (error) {
            console.error('Error generating guest token:', error);
            throw new Error(`Failed to generate guest token: ${error.message}`);
        }
    }
    /**
     * Get list of dashboards
     */
    async getDashboards() {
        try {
            const accessToken = await this.getAccessToken();
            const response = await fetch(`${this.config.baseUrl}/api/v1/dashboard/`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch dashboards: ${response.statusText}`);
            }
            const data = await response.json();
            return data.result || [];
        }
        catch (error) {
            console.error('Error fetching dashboards:', error);
            throw new Error(`Failed to fetch dashboards: ${error.message}`);
        }
    }
    /**
     * Get embedded dashboard UUID for a dashboard by its integer ID
     * Required for embedded SDK - Superset uses UUIDs for /embedded/{uuid} URLs
     * Returns 404 if embedding is not enabled for the dashboard
     */
    async getEmbeddedDashboardUuid(dashboardId) {
        try {
            const accessToken = await this.getAccessToken();
            const response = await fetch(`${this.config.baseUrl}/api/v1/dashboard/${dashboardId}/embedded`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                const text = await response.text();
                if (response.status === 404) {
                    throw new Error(`Dashboard ${dashboardId} does not have embedding enabled. Enable "Allow embedding" in Superset dashboard settings.`);
                }
                throw new Error(`Failed to get embedded dashboard UUID: ${response.status}. ${text}`);
            }
            const data = (await response.json());
            const uuid = data.result?.uuid;
            if (!uuid) {
                throw new Error(`No embedded UUID returned for dashboard ${dashboardId}`);
            }
            return uuid;
        }
        catch (error) {
            console.error('Error getting embedded dashboard UUID:', error);
            throw error;
        }
    }
    /**
     * Get dashboard by ID
     */
    async getDashboard(dashboardId) {
        try {
            const accessToken = await this.getAccessToken();
            const response = await fetch(`${this.config.baseUrl}/api/v1/dashboard/${dashboardId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch dashboard: ${response.statusText}`);
            }
            const data = await response.json();
            return data.result;
        }
        catch (error) {
            console.error('Error fetching dashboard:', error);
            throw new Error(`Failed to fetch dashboard: ${error.message}`);
        }
    }
}
// Export singleton instance
export const supersetService = new SupersetService();
//# sourceMappingURL=SupersetService.js.map