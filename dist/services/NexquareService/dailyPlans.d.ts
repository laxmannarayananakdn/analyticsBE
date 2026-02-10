/**
 * Daily Plans Methods
 * Handles fetching and saving daily plans (timetable data) from Nexquare API
 */
import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { BaseNexquareService } from './BaseNexquareService.js';
/**
 * Get daily plans (timetable data)
 * Note: API limits date range to 1 week, so we fetch week by week
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getDailyPlans(this: BaseNexquareService, config: NexquareConfig, schoolId?: string, fromDate?: string, toDate?: string, subject?: string, classId?: string, cohort?: string, teacher?: string, location?: string): Promise<any[]>;
//# sourceMappingURL=dailyPlans.d.ts.map