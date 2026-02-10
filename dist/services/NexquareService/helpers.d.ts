/**
 * Helper Methods
 * Utility methods used by NexquareService methods
 */
import type { BaseNexquareService } from './BaseNexquareService';
/**
 * Bulk fetch student IDs by sourced_id or identifier
 * Returns a map of student_sourced_id -> { id, sourced_id }
 * Can be added to a class that extends BaseNexquareService
 */
export declare function bulkGetStudentIds(this: BaseNexquareService, studentIdentifiers: string[]): Promise<Map<string, {
    id: number;
    sourced_id: string;
}>>;
/**
 * Bulk fetch group IDs from database by sourced_id
 * Can be added to a class that extends BaseNexquareService
 */
export declare function bulkGetGroupIds(this: BaseNexquareService, groupSourcedIds: string[]): Promise<Map<string, {
    id: number;
    sourced_id: string;
}>>;
//# sourceMappingURL=helpers.d.ts.map