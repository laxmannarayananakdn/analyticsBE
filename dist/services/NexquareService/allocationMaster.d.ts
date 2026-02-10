/**
 * Allocation Master Methods
 * Handles fetching and saving allocation master data from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader';
import type { BaseNexquareService } from './BaseNexquareService';
/**
 * Get allocation master data and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getAllocationMaster(this: BaseNexquareService, config: NexquareConfig, schoolId?: string): Promise<any[]>;
//# sourceMappingURL=allocationMaster.d.ts.map