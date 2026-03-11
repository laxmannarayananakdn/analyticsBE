/**
 * Sync ManageBac term_grades + term_grade_rubrics to RP.student_assessments
 * Mirrors NEX -> RP flow for MB schools.
 */
import type { BaseManageBacService } from './BaseManageBacService.js';
/**
 * Sync MB data to RP.student_assessments for a school + academic year.
 * Uses admin.mb_term_grade_rubric_config when present; otherwise includes all rubrics with grade.
 * @param schoolId MB.schools.id as string (e.g. "123")
 * @param academicYear MB.academic_years.name (e.g. "2024-2025")
 * @returns Number of rows inserted
 */
export declare function syncManageBacToRP(this: BaseManageBacService, schoolId: string, academicYear: string): Promise<number>;
//# sourceMappingURL=syncToRP.d.ts.map