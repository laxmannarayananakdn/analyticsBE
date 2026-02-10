/**
 * Students Methods
 * Handles fetching and saving students from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader';
import type { NexquareUser } from '../../types/nexquare';
import type { BaseNexquareService } from './BaseNexquareService';
/**
 * Get students with pagination and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getStudents(this: BaseNexquareService, config: NexquareConfig, schoolId?: string, filter?: string, fetchMode?: number): Promise<NexquareUser[]>;
//# sourceMappingURL=students.d.ts.map