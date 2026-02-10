/**
 * Staff Allocations Methods
 * Handles fetching and saving staff allocations from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader';
import type { BaseNexquareService } from './BaseNexquareService';
/**
 * Get staff allocations and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getStaffAllocations(this: BaseNexquareService, config: NexquareConfig, schoolId?: string): Promise<any[]>;
//# sourceMappingURL=staffAllocations.d.ts.map