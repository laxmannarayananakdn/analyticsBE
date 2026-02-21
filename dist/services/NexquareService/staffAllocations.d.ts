/**
 * Staff Allocations Methods
 * Handles fetching and saving staff allocations from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { BaseNexquareService } from './BaseNexquareService.js';
/**
 * Get staff allocations and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getStaffAllocations(this: BaseNexquareService, config: NexquareConfig, schoolId?: string, academicYear?: string): Promise<any[]>;
//# sourceMappingURL=staffAllocations.d.ts.map