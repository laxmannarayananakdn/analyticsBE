/**
 * Classes Methods
 * Handles fetching and saving classes from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader';
import type { NexquareClass } from '../../types/nexquare';
import type { BaseNexquareService } from './BaseNexquareService';
/**
 * Get classes with pagination and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getClasses(this: BaseNexquareService, config: NexquareConfig, schoolId?: string): Promise<NexquareClass[]>;
//# sourceMappingURL=classes.d.ts.map