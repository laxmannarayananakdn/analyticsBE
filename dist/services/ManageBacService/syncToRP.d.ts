/**
 * Sync ManageBac term_grades + term_grade_rubrics to RP.student_assessments
 * via RP.usp_load_mb_term_grades (idempotent INSERT with NOT EXISTS dedup).
 */
import type { BaseManageBacService } from './BaseManageBacService.js';
export interface LoadMbTermGradesResult {
    rows_affected: number;
    rubric_rows_inserted: number;
    class_grade_rows_inserted: number;
}
/**
 * Load MB term grades into RP.student_assessments for configured schools.
 * @param schoolId MB.schools.id as string (e.g. "123"); omit to load all configured schools
 * @param academicYear MB academic year name (e.g. "2024-2025"); omit to load all years
 * @returns Insert counts from RP.usp_load_mb_term_grades
 */
export declare function syncManageBacToRP(this: BaseManageBacService, schoolId?: string, academicYear?: string): Promise<LoadMbTermGradesResult>;
//# sourceMappingURL=syncToRP.d.ts.map