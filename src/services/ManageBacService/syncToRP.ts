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

import { getConnection, sql } from '../../config/database.js';
import { databaseService } from '../DatabaseService.js';
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
export async function updateMbReportedSubjectFromClassName(
  schoolId?: string | null,
  academicYearRp?: string | null
): Promise<UpdateMbReportedSubjectResult> {
  const connection = await getConnection();
  const request = connection.request();
  (request as { timeout?: number }).timeout = 1800000;

  request.input('school_id', sql.NVarChar(100), schoolId?.trim() || null);
  request.input('academic_year', sql.NVarChar(100), academicYearRp?.trim() || null);

  const result = await request.execute('RP.usp_update_mb_reported_subject_from_class_name');
  const row = result.recordset?.[0] as UpdateMbReportedSubjectResult | undefined;

  return {
    reported_subject_rows_updated: row?.reported_subject_rows_updated ?? 0,
  };
}

/**
 * Derive Total_Points + blank Result for MB schools after term-grade load.
 * @academic_year should be the RP canonical year stored on RP.student_assessments.academic_year.
 */
export async function insertMbIbTotalPointsAndResult(
  schoolId?: string | null,
  academicYearRp?: string | null
): Promise<InsertMbIbTotalPointsResult> {
  const connection = await getConnection();
  const request = connection.request();
  (request as { timeout?: number }).timeout = 1800000;

  request.input('school_id', sql.NVarChar(100), schoolId?.trim() || null);
  request.input('academic_year', sql.NVarChar(100), academicYearRp?.trim() || null);

  const result = await request.execute('RP.usp_insert_mb_ib_total_points_and_result');
  const row = result.recordset?.[0] as InsertMbIbTotalPointsResult | undefined;

  return {
    candidates: row?.candidates ?? 0,
    total_points_rows_affected: row?.total_points_rows_affected ?? 0,
    result_rows_inserted: row?.result_rows_inserted ?? 0,
  };
}

/**
 * Load MB term grades into RP.student_assessments for configured schools.
 * When school_id + academic_year_rp are both set: delete existing RP rows for that
 * school/year first (same as NEX), then reload.
 */
export async function syncManageBacToRP(
  this: BaseManageBacService,
  schoolId?: string,
  options?: string | LoadMbTermGradesOptions
): Promise<LoadMbTermGradesResult> {
  const resolved: LoadMbTermGradesOptions =
    typeof options === 'string' ? { academic_year: options } : options ?? {};

  const ayCanonical = resolved.academic_year_rp?.trim() || null;
  let rpRowsDeleted = 0;

  // Replace semantics (match NEX): require school + canonical RP year before wipe
  if (schoolId?.trim() && ayCanonical) {
    const { deleted, error } = await databaseService.deleteRPStudentAssessmentsByYear(
      schoolId.trim(),
      ayCanonical
    );
    if (error) {
      throw new Error(`Failed to delete existing RP assessments before MB->RP sync: ${error}`);
    }
    rpRowsDeleted = deleted;
    if (deleted > 0) {
      console.log(
        `   🗑️  [MB->RP] Deleted ${deleted} existing RP assessment(s) for school=${schoolId} academic_year=${ayCanonical}`
      );
    }
  } else {
    console.warn(
      `   ⚠️  [MB->RP] Skipping RP delete/replace — need school_id and academic_year_rp ` +
        `(school_id=${schoolId ?? 'null'}, academic_year_rp=${ayCanonical ?? 'null'}). ` +
        `Will append via NOT EXISTS only.`
    );
  }

  const connection = await getConnection();
  const request = connection.request();
  (request as { timeout?: number }).timeout = 1800000;

  request.input('school_id', sql.NVarChar(100), schoolId ?? null);
  request.input('academic_year', sql.NVarChar(200), resolved.academic_year?.trim() || null);
  request.input('academic_year_rp', sql.NVarChar(20), ayCanonical);

  const result = await request.execute('RP.usp_load_mb_term_grades');
  const row = result.recordset?.[0] as LoadMbTermGradesResult | undefined;

  const reportedSubject = await updateMbReportedSubjectFromClassName(schoolId, ayCanonical);
  const ibTotals = await insertMbIbTotalPointsAndResult(schoolId, ayCanonical);

  return {
    rows_affected: row?.rows_affected ?? 0,
    rubric_rows_inserted: row?.rubric_rows_inserted ?? 0,
    class_grade_rows_inserted: row?.class_grade_rows_inserted ?? 0,
    rp_rows_deleted: rpRowsDeleted,
    reported_subject_rows_updated: reportedSubject.reported_subject_rows_updated,
    ib_total_candidates: ibTotals.candidates,
    total_points_rows_affected: ibTotals.total_points_rows_affected,
    result_rows_inserted: ibTotals.result_rows_inserted,
  };
}
