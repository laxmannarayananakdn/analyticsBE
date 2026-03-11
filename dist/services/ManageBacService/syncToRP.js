/**
 * Sync ManageBac term_grades + term_grade_rubrics to RP.student_assessments
 * Mirrors NEX -> RP flow for MB schools.
 */
import { getConnection, sql } from '../../config/database.js';
import { databaseService } from '../DatabaseService.js';
/**
 * Sync MB data to RP.student_assessments for a school + academic year.
 * Uses admin.mb_term_grade_rubric_config when present; otherwise includes all rubrics with grade.
 * @param schoolId MB.schools.id as string (e.g. "123")
 * @param academicYear MB.academic_years.name (e.g. "2024-2025")
 * @returns Number of rows inserted
 */
export async function syncManageBacToRP(schoolId, academicYear) {
    if (!schoolId || !academicYear) {
        console.warn('   ⚠️  school_id and academic_year required for MB->RP sync');
        return 0;
    }
    const schoolIdNum = parseInt(schoolId, 10);
    if (isNaN(schoolIdNum)) {
        console.warn(`   ⚠️  Invalid school_id for MB->RP: ${schoolId}`);
        return 0;
    }
    const connection = await getConnection();
    const request = connection.request();
    request.timeout = 1800000;
    request.input('school_id', sql.NVarChar(50), schoolId);
    request.input('academic_year', sql.NVarChar(200), academicYear);
    request.input('school_id_bigint', sql.BigInt, schoolIdNum);
    // Delete existing RP rows for this school+year
    const { error: deleteError } = await databaseService.deleteRPStudentAssessmentsByYear(schoolId, academicYear);
    if (deleteError) {
        console.error(`   ❌ Failed to delete RP rows: ${deleteError}`);
        throw new Error(`Delete RP failed: ${deleteError}`);
    }
    const insertQuery = `
    INSERT INTO RP.student_assessments (
      nex_assessment_id, school_id, school_name, region_name, student_name, register_number,
      student_status, grade_name, section_name, class_name, academic_year, subject_id, subject_name,
      term_id, term_name, component_name, component_value, max_value, data_type, calculation_method,
      mark_grade_name, mark_rubric_name, reported_subject, created_at, updated_at
    )
    SELECT
      NULL,
      CAST(c.school_id AS NVARCHAR(50)),
      sch.name,
      sch.country,
      RTRIM(LTRIM(ISNULL(s.first_name,'') + ' ' + ISNULL(s.last_name,''))) ,
      ISNULL(s.uniq_student_id, CAST(s.id AS NVARCHAR(50))),
      CASE WHEN s.archived = 1 THEN 'Archived' ELSE 'Active' END,
      CAST(c.grade_number AS NVARCHAR(50)),
      c.class_section,
      c.name,
      ay.name,
      CAST(subj.id AS NVARCHAR(200)),
      subj.name,
      CAST(tg.term_id AS NVARCHAR(200)),
      at.name,
      b.title,
      b.grade,
      NULL,
      'grade',
      NULL,
      b.grade,
      b.title,
      COALESCE(sm.reported_subject, subj.name),
      SYSDATETIMEOFFSET(),
      SYSDATETIMEOFFSET()
    FROM MB.term_grade_rubrics b
    INNER JOIN MB.term_grades tg ON b.term_grade_id = tg.id
    INNER JOIN MB.students s ON tg.student_id = s.id
    INNER JOIN MB.classes c ON tg.class_id = c.id
    INNER JOIN MB.subjects subj ON c.subject_id = subj.id
    INNER JOIN MB.academic_terms at ON tg.term_id = at.id
    INNER JOIN MB.academic_years ay ON at.academic_year_id = ay.id
    INNER JOIN MB.schools sch ON c.school_id = sch.id
    LEFT JOIN admin.subject_mapping sm
      ON sm.school_id = CAST(c.school_id AS NVARCHAR(200))
      AND sm.academic_year = ay.name
      AND sm.grade = CAST(c.grade_number AS NVARCHAR(200))
      AND sm.subject = subj.name
      AND sm.reported_subject IS NOT NULL AND LTRIM(RTRIM(sm.reported_subject)) != ''
    WHERE b.grade IS NOT NULL
      AND c.school_id = @school_id_bigint
      AND ay.name = @academic_year
      AND (
        EXISTS (
          SELECT 1 FROM admin.mb_term_grade_rubric_config cfg
          WHERE cfg.school_id = c.school_id
            AND cfg.academic_year = ay.name
            AND cfg.grade_number = c.grade_number
            AND cfg.rubric_title = b.title
            AND cfg.term_id = tg.term_id
        )
        OR NOT EXISTS (
          SELECT 1 FROM admin.mb_term_grade_rubric_config cfg
          WHERE cfg.school_id = c.school_id AND cfg.academic_year = ay.name
        )
      );
    SELECT @@ROWCOUNT AS rows_affected;
  `;
    const result = await request.query(insertQuery);
    const rowsAffected = result.recordset?.[0]?.rows_affected ?? 0;
    return rowsAffected;
}
//# sourceMappingURL=syncToRP.js.map