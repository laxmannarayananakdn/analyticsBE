/**
 * Daily Attendance Methods
 * Handles fetching and saving daily attendance records from Nexquare API
 * Fetches in monthly chunks to avoid timeout
 */
import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { BaseNexquareService } from './BaseNexquareService.js';
/**
 * Get daily attendance records
 * Fetches in monthly chunks to avoid timeout
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getDailyAttendance(this: BaseNexquareService & {
    bulkGetStudentIds: (ids: string[]) => Promise<Map<string, {
        id: number;
        sourced_id: string;
    }>>;
}, config: NexquareConfig, schoolId?: string, startDate?: string, endDate?: string, categoryRequired?: boolean, rangeType?: number, studentSourcedId?: string): Promise<any[]>;
//# sourceMappingURL=dailyAttendance.d.ts.map