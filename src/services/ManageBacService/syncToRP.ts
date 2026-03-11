/**
 * Sync ManageBac term_grades + term_grade_rubrics to RP.student_assessments
 * Mirrors NEX -> RP flow for MB schools.
 */

import { getConnection, executeQuery, sql } from '../../config/database.js';
import { databaseService } from '../DatabaseService.js';
import type { BaseManageBacService } from './BaseManageBacService.js';

/**
 * Sync MB data to RP.student_assessments for a school + academic year.
 * Uses admin.mb_term_grade_rubric_config when present; otherwise includes all rubrics with grade.
 * @param schoolId MB.schools.id as string (e.g. "123")
 * @param academicYear MB.academic_years.name (e.g. "2024-2025")
 * @returns Number of rows inserted
 */
export async function syncManageBacToRP(
  this: BaseManageBacService,
  schoolId: string,
  academicYear: string
): Promise<number> {
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
  (request as { timeout?: number }).timeout = 1800000;

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
    ;WITH src AS (
      SELECT
        CAST(c.school_id AS NVARCHAR(50)) AS school_id,
        sch.name AS school_name,
        sch.country AS region_name,
        RTRIM(LTRIM(ISNULL(s.first_name,'') + ' ' + ISNULL(s.last_name,''))) AS student_name,
        ISNULL(s.uniq_student_id, CAST(s.id AS NVARCHAR(50))) AS register_number,
        CASE WHEN s.archived = 1 THEN 'Archived' ELSE 'Active' END AS student_status,
        CAST(c.grade_number AS NVARCHAR(50)) AS grade_name,
        c.class_section AS section_name,
        c.name AS class_name,
        ay.name AS academic_year,
        CAST(subj.id AS NVARCHAR(200)) AS subject_id,
        subj.name AS subject_name,
        CAST(tg.term_id AS NVARCHAR(200)) AS term_id,
        at.name AS term_name,
        b.title AS component_name,
        b.grade AS component_value,
        b.id AS rubric_id
      FROM MB.term_grade_rubrics b
      INNER JOIN MB.term_grades tg ON b.term_grade_id = tg.id
      INNER JOIN MB.students s ON tg.student_id = s.id
      INNER JOIN MB.classes c ON tg.class_id = c.id
      INNER JOIN MB.subjects subj ON c.subject_id = subj.id
      INNER JOIN MB.academic_terms at ON tg.term_id = at.id
      INNER JOIN MB.academic_years ay ON at.academic_year_id = ay.id
      INNER JOIN MB.schools sch ON c.school_id = sch.id
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
        )
    ),
    numbered AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY rubric_id) AS rn
      FROM src
    )
    INSERT INTO RP.student_assessments (
      nex_assessment_id, school_id, school_name, region_name, student_name, register_number,
      student_status, grade_name, section_name, class_name, academic_year, subject_id, subject_name,
      term_id, term_name, component_name, component_value, max_value, data_type, calculation_method,
      mark_grade_name, mark_rubric_name, reported_subject, created_at, updated_at
    )
    SELECT
      (SELECT ISNULL(MAX(nex_assessment_id), 0) FROM RP.student_assessments) + n.rn,
      n.school_id,
      n.school_name,
      n.region_name,
      n.student_name,
      n.register_number,
      n.student_status,
      n.grade_name,
      n.section_name,
      n.class_name,
      n.academic_year,
      n.subject_id,
      n.subject_name,
      n.term_id,
      n.term_name,
      n.component_name,
      n.component_value,
      NULL,
      'grade',
      NULL,
      n.component_value,
      n.component_name,
      n.subject_name,
      SYSDATETIMEOFFSET(),
      SYSDATETIMEOFFSET()
    FROM numbered n;
    SELECT @@ROWCOUNT AS rows_affected;
  `;

  const result = await request.query(insertQuery);
  const rowsAffected = result.recordset?.[0]?.rows_affected ?? 0;
  return rowsAffected;
}
