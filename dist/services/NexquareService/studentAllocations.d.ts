/**
 * Student Allocations Methods
 * Handles fetching and saving student allocations from Nexquare API
 *
 * NOTE: This method uses helper methods bulkGetStudentIds and bulkGetGroupIds
 * which should be available on the class that extends BaseNexquareService
 */
import type { NexquareConfig } from '../../middleware/configLoader';
import type { StudentAllocationResponse } from '../../types/nexquare';
import type { BaseNexquareService } from './BaseNexquareService';
/**
 * Get student allocations and extract subjects, cohorts, groups, homerooms
 * Can be added to a class that extends BaseNexquareService
 *
 * NOTE: Requires bulkGetStudentIds and bulkGetGroupIds helper methods
 */
export declare function getStudentAllocations(this: BaseNexquareService & {
    bulkGetStudentIds: (ids: string[]) => Promise<Map<string, {
        id: number;
        sourced_id: string;
    }>>;
    bulkGetGroupIds: (ids: string[]) => Promise<Map<string, {
        id: number;
        sourced_id: string;
    }>>;
}, config: NexquareConfig, schoolId?: string): Promise<StudentAllocationResponse[]>;
//# sourceMappingURL=studentAllocations.d.ts.map