/**
 * Staff Methods
 * Handles fetching and saving staff/teachers from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { NexquareUser } from '../../types/nexquare.js';
import type { BaseNexquareService } from './BaseNexquareService.js';
/**
 * Get staff/teachers with pagination and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getStaff(this: BaseNexquareService, config: NexquareConfig, schoolId?: string, filter?: string): Promise<NexquareUser[]>;
//# sourceMappingURL=staff.d.ts.map