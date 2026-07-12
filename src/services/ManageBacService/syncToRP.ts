/**
 * Sync ManageBac term_grades + term_grade_rubrics to RP.student_assessments
 * via RP.usp_load_mb_term_grades (idempotent INSERT with NOT EXISTS dedup).
 * Only (term_id, rubric_title) pairs from admin.mb_term_grade_rubric_config are loaded.
 * Does not modify MB schema tables.
 */

import { getConnection, sql } from '../../config/database.js';
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
export async function syncManageBacToRP(
  this: BaseManageBacService,
  schoolId?: string,
  options?: string | LoadMbTermGradesOptions
): Promise<LoadMbTermGradesResult> {
  const resolved: LoadMbTermGradesOptions =
    typeof options === 'string' ? { academic_year: options } : options ?? {};

  const connection = await getConnection();
  const request = connection.request();
  (request as { timeout?: number }).timeout = 1800000;

  request.input('school_id', sql.NVarChar(100), schoolId ?? null);
  request.input('academic_year', sql.NVarChar(200), resolved.academic_year?.trim() || null);
  request.input('academic_year_rp', sql.NVarChar(20), resolved.academic_year_rp?.trim() || null);

  const result = await request.execute('RP.usp_load_mb_term_grades');
  const row = result.recordset?.[0] as LoadMbTermGradesResult | undefined;

  return {
    rows_affected: row?.rows_affected ?? 0,
    rubric_rows_inserted: row?.rubric_rows_inserted ?? 0,
    class_grade_rows_inserted: row?.class_grade_rows_inserted ?? 0,
  };
}
