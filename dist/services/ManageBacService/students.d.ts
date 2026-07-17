/**
 * Students Methods
 * Handles fetching and saving students from ManageBac API
 */
import type { Student } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';
/**
 * MB student detail payloads expose `archived` but often omit `is_active`.
 * Using `!is_active` when is_active is undefined incorrectly marks everyone archived.
 */
export declare function resolveMbStudentArchived(s: any): boolean;
export declare function getStudents(this: BaseManageBacService, apiKey: string, filters?: {
    grade_id?: string;
    active_only?: boolean;
    academic_year_id?: string;
}, baseUrl?: string, schoolId?: number, onLog?: (msg: string) => void): Promise<Student[]>;
//# sourceMappingURL=students.d.ts.map