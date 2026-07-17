/**
 * Post-MB→RP verification for RP.vw_IB_SchoolAvg_vs_Global.
 * Non-blocking: logs warnings when the view has no row for the synced school/year.
 */
import { executeQuery } from '../config/database.js';
export async function verifyIbSchoolAvgVsGlobalAfterMbSync(input) {
    const schoolId = input.schoolId?.trim();
    const academicYearRp = input.academicYearRp?.trim();
    const hints = [];
    if (!schoolId || !academicYearRp) {
        return {
            present: false,
            viewRowCount: 0,
            totalPointsCount: 0,
            hints: ['school_id or academic_year_rp missing — cannot verify view row'],
        };
    }
    const [viewResult, tpResult] = await Promise.all([
        executeQuery(`SELECT COUNT(*) AS cnt
       FROM RP.vw_IB_SchoolAvg_vs_Global v
       WHERE v.school_id = @school_id
         AND v.academic_year = @academic_year`, { school_id: schoolId, academic_year: academicYearRp }),
        executeQuery(`SELECT COUNT(*) AS cnt
       FROM RP.student_assessments sa
       WHERE sa.school_id = @school_id
         AND sa.academic_year = @academic_year
         AND LTRIM(RTRIM(COALESCE(sa.component_name, N''))) = N'Total_Points'
         AND sa.subject_name IS NULL
         AND sa.term_name IS NULL
         AND sa.class_name IS NULL`, { school_id: schoolId, academic_year: academicYearRp }),
    ]);
    const viewRowCount = viewResult.data?.[0]?.cnt ?? 0;
    const totalPointsCount = tpResult.data?.[0]?.cnt ?? 0;
    if (viewRowCount === 0) {
        if ((input.ibTotalCandidates ?? 0) === 0 || (input.totalPointsRowsAffected ?? 0) === 0) {
            hints.push('no Total_Points loaded — run MB term-grades sync and ensure IB Final Result rubrics exist');
        }
        if (totalPointsCount === 0) {
            hints.push('RP.student_assessments has no diploma-grain Total_Points for this school/year');
        }
        else if (totalPointsCount > 0) {
            hints.push('Total_Points exist but view is empty — check school is active in MB.managebac_school_configs or Node_School mapping');
        }
        hints.push('verify academic_year_rp matches RP.student_assessments.academic_year (e.g. 2025 - 2026)');
    }
    return {
        present: viewRowCount > 0,
        viewRowCount,
        totalPointsCount,
        hints,
    };
}
export function logIbSchoolAvgVerification(schoolId, academicYearRp, result) {
    if (result.present) {
        console.log(`   [MB->RP] IB SchoolAvg vs Global: row present for school=${schoolId} academic_year=${academicYearRp} ` +
            `(view_rows=${result.viewRowCount}, total_points=${result.totalPointsCount})`);
        return;
    }
    const hintText = result.hints.length ? ` Hints: ${result.hints.join('; ')}` : '';
    console.warn(`   ⚠️ [MB->RP] IB SchoolAvg vs Global: no view row for school=${schoolId} academic_year=${academicYearRp}.${hintText}`);
}
//# sourceMappingURL=IbSchoolAvgVerificationService.js.map