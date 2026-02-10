/**
 * Authentication Methods
 * Handles authentication with Nexquare API
 */

import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { BaseNexquareService } from './BaseNexquareService.js';

/**
 * Authentication method
 * Can be added to a class that extends BaseNexquareService
 */
export async function authenticate(
  this: BaseNexquareService,
  config: NexquareConfig
): Promise<boolean> {
  try {
    console.log('🔐 Authenticating with Nexquare API...');
    await (this as any).getAccessToken(config);
    console.log('✅ Authentication successful');
    return true;
  } catch (error) {
    console.error('❌ Authentication failed:', error);
    return false;
  }
}
