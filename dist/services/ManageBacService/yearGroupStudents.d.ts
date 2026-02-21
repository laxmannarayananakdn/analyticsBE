/**
 * Year Group Students Methods
 * Handles fetching students for year group(s) from ManageBac API
 */
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function getYearGroupStudents(this: BaseManageBacService, apiKey: string, yearGroupId: string, academicYearId?: string, termId?: string, baseUrl?: string): Promise<any>;
export declare function getAllYearGroupStudents(this: BaseManageBacService, apiKey: string, academicYearId?: string, termId?: string, baseUrl?: string): Promise<any>;
//# sourceMappingURL=yearGroupStudents.d.ts.map