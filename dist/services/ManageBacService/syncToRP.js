/**
 * Sync ManageBac term_grades + term_grade_rubrics to RP.student_assessments
 * via RP.usp_load_mb_term_grades (idempotent INSERT with NOT EXISTS dedup).
 */
import { getConnection, sql } from '../../config/database.js';
/**
 * Load MB term grades into RP.student_assessments for configured schools.
 */
export async function syncManageBacToRP(schoolId, options) {
    const resolved = typeof options === 'string' ? { academic_year: options } : options ?? {};
    const connection = await getConnection();
    const request = connection.request();
    request.timeout = 1800000;
    request.input('school_id', sql.NVarChar(100), schoolId ?? null);
    request.input('academic_year', sql.NVarChar(200), resolved.academic_year?.trim() || null);
    request.input('academic_year_rp', sql.NVarChar(20), resolved.academic_year_rp?.trim() || null);
    const result = await request.execute('RP.usp_load_mb_term_grades');
    const row = result.recordset?.[0];
    return {
        rows_affected: row?.rows_affected ?? 0,
        rubric_rows_inserted: row?.rubric_rows_inserted ?? 0,
        class_grade_rows_inserted: row?.class_grade_rows_inserted ?? 0,
    };
}
//# sourceMappingURL=syncToRP.js.map