/**
 * Sync ManageBac term_grades + term_grade_rubrics to RP.student_assessments
 * via RP.usp_load_mb_term_grades.
 * Only (term_id, rubric_title) pairs from admin.mb_term_grade_rubric_config are loaded.
 *
 * Same replace semantics as NEX→RP:
 *   DELETE RP.student_assessments for school_id + academic_year (canonical RP year),
 *   then reload, update reported_subject, derive Total_Points + blank Result.
 * Does not modify MB schema tables.
 */
import type { BaseManageBacService } from './BaseManageBacService.js';
export interface LoadMbTermGradesResult {
    rows_affected: number;
    rubric_rows_inserted: number;
    class_grade_rows_inserted: number;
    /** Rows deleted from RP before reload (school + academic_year) */
    rp_rows_deleted?: number;
    /** Rows where reported_subject was set from IB DP class_name */
    reported_subject_rows_updated?: number;
    /** Students with IB Final Result and/or Core(EE+TOK) Points considered for Total_Points */
    ib_total_candidates?: number;
    /** MERGE rowcount for Total_Points upsert */
    total_points_rows_affected?: number;
    /** New blank Result rows inserted */
    result_rows_inserted?: number;
}
export interface LoadMbTermGradesOptions {
    /** MB.vw_term_grades.academic_year exact match (legacy) */
    academic_year?: string;
    /** Canonical RP year from admin.mb_term_grade_rubric_config (preferred for MB schools) */
    academic_year_rp?: string;
}
export interface InsertMbIbTotalPointsResult {
    candidates: number;
    total_points_rows_affected: number;
    result_rows_inserted: number;
}
export interface UpdateMbReportedSubjectResult {
    reported_subject_rows_updated: number;
}
/**
 * Derive reported_subject from IB DP class_name labels after term-grade load.
 * @academic_year should be the RP canonical year stored on RP.student_assessments.academic_year.
 */
export declare function updateMbReportedSubjectFromClassName(schoolId?: string | null, academicYearRp?: string | null): Promise<UpdateMbReportedSubjectResult>;
/**
 * Derive Total_Points + blank Result for MB schools after term-grade load.
 * @academic_year should be the RP canonical year stored on RP.student_assessments.academic_year.
 */
export declare function insertMbIbTotalPointsAndResult(schoolId?: string | null, academicYearRp?: string | null): Promise<InsertMbIbTotalPointsResult>;
/**
 * Load MB term grades into RP.student_assessments for configured schools.
 * When school_id + academic_year_rp are both set: delete existing RP rows for that
 * school/year first (same as NEX), then reload.
 */
export declare function syncManageBacToRP(this: BaseManageBacService, schoolId?: string, options?: string | LoadMbTermGradesOptions): Promise<LoadMbTermGradesResult>;
//# sourceMappingURL=syncToRP.d.ts.map