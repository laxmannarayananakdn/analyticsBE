/**
 * Authentication Methods
 * Handles authentication with Nexquare API
 */
/**
 * Authentication method
 * Can be added to a class that extends BaseNexquareService
 */
export async function authenticate(config) {
    try {
        console.log('🔐 Authenticating with Nexquare API...');
        await this.getAccessToken(config);
        console.log('✅ Authentication successful');
        return true;
    }
    catch (error) {
        console.error('❌ Authentication failed:', error);
        return false;
    }
}
//# sourceMappingURL=auth.js.map