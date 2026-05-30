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
export interface LoadMbTermGradesOptions {
    /** MB.vw_term_grades.academic_year exact match (legacy) */
    academic_year?: string;
    /** Canonical RP year from admin.mb_term_grade_rubric_config (preferred for MB schools) */
    academic_year_rp?: string;
}
/**
 * Load MB term grades into RP.student_assessments for configured schools.
 */
export declare function syncManageBacToRP(this: BaseManageBacService, schoolId?: string, options?: string | LoadMbTermGradesOptions): Promise<LoadMbTermGradesResult>;
//# sourceMappingURL=syncToRP.d.ts.map