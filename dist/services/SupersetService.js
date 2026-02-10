/**
 * Superset Service
 * Handles Superset API authentication and guest token generation
 */
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
     * Get CSRF token from Superset
     * Note: Some Superset instances may require authentication for this endpoint
     */
    async getCsrfToken() {
        try {
            console.log(`🔐 Fetching CSRF token from ${this.config.baseUrl}/api/v1/security/csrf_token/`);
            const response = await fetch(`${this.config.baseUrl}/api/v1/security/csrf_token/`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ CSRF token endpoint returned ${response.status}: ${errorText.substring(0, 200)}`);
                if (response.status === 401 || response.status === 403) {
                    throw new Error(`CSRF token endpoint requires authentication. Consider using SUPERSET_API_KEY instead of username/password. Status: ${response.status}`);
                }
                throw new Error(`Failed to get CSRF token: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            console.log('✅ CSRF token obtained successfully');
            return data.result;
        }
        catch (error) {
            console.error('Error getting CSRF token:', error);
            throw error; // Re-throw to preserve error message
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
            const csrfToken = await this.getCsrfToken();
            console.log(`🔐 Logging in to Superset...`);
            const response = await fetch(`${this.config.baseUrl}/api/v1/security/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                    'Accept': 'application/json',
                },
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
     * If a pre-generated guest token is provided in config, returns it directly
     * Otherwise, generates a new one using authentication
     */
    async generateGuestToken(dashboardId, resources) {
        try {
            // If a pre-generated guest token is provided, use it directly
            if (this.config.guestToken) {
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
            const guestTokenRequest = {
                resources: resources || [{ type: 'dashboard', id: String(dashboardId) }],
                rls: [],
                user: {
                    username: 'guest',
                    first_name: 'Guest',
                    last_name: 'User',
                },
            };
            const response = await fetch(`${this.config.baseUrl}/api/v1/security/guest_token/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify(guestTokenRequest),
            });
            if (!response.ok) {
                const errorText = await response.text();
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