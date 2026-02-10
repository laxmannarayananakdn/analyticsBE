/**
 * Schools Methods
 * Handles fetching and saving schools/entities from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader';
import type { NexquareSchool } from '../../types/nexquare';
import type { BaseNexquareService } from './BaseNexquareService';
/**
 * Get schools/entities and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getSchools(this: BaseNexquareService, config: NexquareConfig, filter?: string): Promise<NexquareSchool[]>;
/**
 * Verify school access by checking if school_id exists
 * Can be added to a class that extends BaseNexquareService
 */
export declare function verifySchoolAccess(this: BaseNexquareService, config: NexquareConfig, schoolId: string): Promise<boolean>;
//# sourceMappingURL=schools.d.ts.map