import {
  MB_DP_PROGRAM_CODES,
  MB_TERM_GRADES_DEFAULT_GRADE_NUMBER,
} from '../config/managebac.js';

export type MbTermGradeSyncScope = {
  grade_number: number;
  school_id: number;
  program_codes: string[];
};

/** Default scope for scheduled MB sync: DP students in grade_number 13. */
export function defaultMbTermGradeSyncScope(schoolId: number): MbTermGradeSyncScope {
  return {
    school_id: schoolId,
    grade_number: MB_TERM_GRADES_DEFAULT_GRADE_NUMBER,
    program_codes: [...MB_DP_PROGRAM_CODES],
  };
}

/** SQL fragment: restrict MB.year_groups rows to Diploma Programme. */
export function yearGroupDpProgramSql(alias = 'yg', programCodes: string[] = [...MB_DP_PROGRAM_CODES]): string {
  const codes = programCodes.map((c) => c.toLowerCase().replace(/'/g, "''"));
  const inList = codes.map((c) => `'${c}'`).join(', ');
  return `(
    LOWER(LTRIM(RTRIM(${alias}.program))) IN (${inList})
    OR LOWER(${alias}.program) LIKE '%diploma%'
    OR EXISTS (
      SELECT 1 FROM MB.grades g
      WHERE g.school_id = ${alias}.school_id
        AND g.grade_number = ${alias}.grade_number
        AND LOWER(g.program_code) IN (${inList})
    )
  )`;
}
