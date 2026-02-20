/**
 * Classes Methods
 * Handles fetching and saving classes from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { NexquareClass } from '../../types/nexquare.js';
import type { BaseNexquareService } from './BaseNexquareService.js';
/**
 * Get classes with pagination and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getClasses(this: BaseNexquareService, config: NexquareConfig, schoolId?: string, onLog?: (msg: string) => void): Promise<NexquareClass[]>;
//# sourceMappingURL=classes.d.ts.map