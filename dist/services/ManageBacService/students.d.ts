/**
 * Students Methods
 * Handles fetching and saving students from ManageBac API
 */
import type { Student } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function getStudents(this: BaseManageBacService, apiKey: string, filters?: {
    grade_id?: string;
    active_only?: boolean;
    academic_year_id?: string;
}, baseUrl?: string, schoolId?: number, onLog?: (msg: string) => void): Promise<Student[]>;
//# sourceMappingURL=students.d.ts.map