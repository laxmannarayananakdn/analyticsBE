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
export declare function authenticate(this: BaseNexquareService, config: NexquareConfig): Promise<boolean>;
//# sourceMappingURL=auth.d.ts.map