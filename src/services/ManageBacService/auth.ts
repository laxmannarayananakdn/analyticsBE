/**
 * Authentication Methods
 * Handles authentication with ManageBac API
 */

import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';

export async function authenticate(
  this: BaseManageBacService,
  apiKey: string,
  baseUrl?: string
): Promise<{ success: boolean; error?: string; details?: any }> {
  try {
    console.log('🔐 Authenticating with ManageBac API...');
    if (baseUrl) {
      console.log(`   Using base URL: ${baseUrl}`);
    }
    console.log(`   API Key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING'}`);

    await this.makeRequest<any>(MANAGEBAC_ENDPOINTS.SCHOOL, apiKey, {}, baseUrl);
    console.log('✅ Authentication successful');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Authentication failed:', error);
    const errorMessage = error?.message || 'Unknown error';
    const errorDetails = {
      message: errorMessage,
      baseUrl: baseUrl || 'https://api.managebac.com',
      endpoint: MANAGEBAC_ENDPOINTS.SCHOOL,
      hasApiKey: !!apiKey
    };
    if (errorMessage.includes('HTTP')) {
      (errorDetails as any).httpError = errorMessage;
    }
    return { success: false, error: errorMessage, details: errorDetails };
  }
}
