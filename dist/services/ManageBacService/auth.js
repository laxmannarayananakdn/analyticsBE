/**
 * Authentication Methods
 * Handles authentication with ManageBac API
 */
import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
export async function authenticate(apiKey, baseUrl) {
    try {
        console.log('🔐 Authenticating with ManageBac API...');
        if (baseUrl) {
            console.log(`   Using base URL: ${baseUrl}`);
        }
        console.log(`   API Key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING'}`);
        await this.makeRequest(MANAGEBAC_ENDPOINTS.SCHOOL, apiKey, {}, baseUrl);
        console.log('✅ Authentication successful');
        return { success: true };
    }
    catch (error) {
        console.error('❌ Authentication failed:', error);
        const errorMessage = error?.message || 'Unknown error';
        const errorDetails = {
            message: errorMessage,
            baseUrl: baseUrl || 'https://api.managebac.com',
            endpoint: MANAGEBAC_ENDPOINTS.SCHOOL,
            hasApiKey: !!apiKey
        };
        if (errorMessage.includes('HTTP')) {
            errorDetails.httpError = errorMessage;
        }
        return { success: false, error: errorMessage, details: errorDetails };
    }
}
//# sourceMappingURL=auth.js.map