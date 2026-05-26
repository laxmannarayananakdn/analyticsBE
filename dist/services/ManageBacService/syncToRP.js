/**
 * Sync ManageBac term_grades + term_grade_rubrics to RP.student_assessments
 * via RP.usp_load_mb_term_grades (idempotent INSERT with NOT EXISTS dedup).
 */
import { getConnection, sql } from '../../config/database.js';
/**
 * Load MB term grades into RP.student_assessments for configured schools.
 * @param schoolId MB.schools.id as string (e.g. "123"); omit to load all configured schools
 * @param academicYear MB academic year name (e.g. "2024-2025"); omit to load all years
 * @returns Insert counts from RP.usp_load_mb_term_grades
 */
export async function syncManageBacToRP(schoolId, academicYear) {
    const connection = await getConnection();
    const request = connection.request();
    request.timeout = 1800000;
    if (schoolId) {
        request.input('school_id', sql.NVarChar(100), schoolId);
    }
    else {
        request.input('school_id', sql.NVarChar(100), null);
    }
    if (academicYear) {
        request.input('academic_year', sql.NVarChar(200), academicYear);
    }
    else {
        request.input('academic_year', sql.NVarChar(200), null);
    }
    const result = await request.execute('RP.usp_load_mb_term_grades');
    const row = result.recordset?.[0];
    return {
        rows_affected: row?.rows_affected ?? 0,
        rubric_rows_inserted: row?.rubric_rows_inserted ?? 0,
        class_grade_rows_inserted: row?.class_grade_rows_inserted ?? 0,
    };
}
//# sourceMappingURL=syncToRP.js.map