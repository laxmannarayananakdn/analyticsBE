/**
 * RP Refresh Service
 *
 * Runs the 12-step RP refresh pipeline (stored procedures) for a school + academic year.
 * Triggered automatically when a Sync Schedule runs with "Run RP refresh after sync" checked.
 * Uses a separate connection pool with no command timeout per design guide Section 5.5.
 */
import sql from 'mssql';
import { randomUUID } from 'crypto';
const RP_REFRESH_STEPS = [
    { proc: 'RP.usp_refresh_student_group_membership', order: 1 },
    { proc: 'RP.usp_refresh_student_profile', order: 2 },
    { proc: 'RP.usp_refresh_enrollment_summary', order: 3 },
    { proc: 'RP.usp_refresh_student_subject_history', order: 4 },
    { proc: 'RP.usp_refresh_subject_performance', order: 5 },
    { proc: 'RP.usp_refresh_subject_grade_distribution', order: 6 },
    { proc: 'RP.usp_refresh_group_performance', order: 7 },
    { proc: 'RP.usp_refresh_school_subject_summary', order: 8 },
    { proc: 'RP.usp_refresh_student_attendance_summary', order: 9 },
    { proc: 'RP.usp_refresh_attendance_score_corr', order: 10 },
    { proc: 'RP.usp_refresh_attendance_band_summary', order: 11 },
    { proc: 'RP.usp_truncate_nex_student_assessments', order: 12 },
];
let refreshPool = null;
const refreshQueues = new Map();
function getRefreshPoolConfig() {
    return {
        server: process.env.AZURE_SQL_SERVER || '',
        database: process.env.AZURE_SQL_DATABASE || '',
        user: process.env.AZURE_SQL_USER || '',
        password: process.env.AZURE_SQL_PASSWORD || '',
        options: {
            encrypt: true,
            trustServerCertificate: false,
            enableArithAbort: true,
            requestTimeout: 0, // no timeout on individual queries
            connectionTimeout: 30000,
        },
        pool: {
            min: 1,
            max: 3,
            idleTimeoutMillis: 0, // never evict idle connections
        },
    };
}
async function getRefreshPool() {
    if (!refreshPool || !refreshPool.connected) {
        refreshPool = await sql.connect(getRefreshPoolConfig());
    }
    return refreshPool;
}
/**
 * Close the refresh pool (for graceful shutdown).
 */
export async function closeRefreshPool() {
    if (refreshPool) {
        try {
            await refreshPool.close();
        }
        catch (err) {
            console.error('[RefreshService] Error closing refresh pool:', err);
        }
        refreshPool = null;
    }
}
/**
 * Execute one stored procedure step.
 */
async function execStep(pool, procName, params) {
    const request = pool.request();
    request.input('school_id', sql.NVarChar(50), params.school_id);
    // Keep input length aligned with flexible academic-year labels (e.g. "August 2025 - July 2026").
    request.input('academic_year', sql.NVarChar(200), params.academic_year);
    request.input('job_run_id', sql.UniqueIdentifier, params.job_run_id);
    request.input('triggered_by', sql.NVarChar(200), params.triggered_by);
    await request.execute(procName);
}
/**
 * Run the full 12-step RP refresh pipeline.
 * Requires school_id and academic_year (same as Sync Schedules).
 * On error: stops pipeline, does NOT run step 12. Error is logged by the SP to refresh_job_log.
 */
export async function runRefreshPipeline(params) {
    const { school_id, academic_year, triggered_by = 'system' } = params;
    if (!academic_year?.trim()) {
        throw new Error('academic_year is required. Use the same format as Sync Schedules (e.g. "2024 - 2025").');
    }
    const job_run_id = randomUUID();
    const pool = await getRefreshPool();
    let failedProc;
    try {
        for (const { proc } of getStepsForMode('full')) {
            failedProc = proc;
            await execStep(pool, proc, {
                school_id,
                academic_year: academic_year.trim(),
                job_run_id,
                triggered_by,
            });
        }
    }
    catch (err) {
        const procHint = failedProc ? ` at ${failedProc}` : '';
        throw new Error(`${err?.message || err}${procHint}`, { cause: err });
    }
    return { job_run_id };
}
/**
 * Trigger the RP refresh pipeline in the background (fire-and-forget).
 * Called by SyncOrchestratorService when load_rp_schema is checked and sync completes.
 */
export async function triggerRefresh(params) {
    const { school_id, academic_year, triggered_by = 'system', mode = 'full' } = params;
    if (!academic_year?.trim()) {
        throw new Error('academic_year is required. Use the same format as Sync Schedules (e.g. "2024 - 2025").');
    }
    const job_run_id = randomUUID();
    const normalizedAcademicYear = academic_year.trim();
    const queueKey = `${school_id}::${normalizedAcademicYear}`;
    const steps = getStepsForMode(mode);
    const previous = refreshQueues.get(queueKey) ?? Promise.resolve();
    const next = previous.then(async () => {
        let failedProc;
        try {
            const pool = await getRefreshPool();
            for (const { proc } of steps) {
                failedProc = proc;
                await execStep(pool, proc, {
                    school_id,
                    academic_year: normalizedAcademicYear,
                    job_run_id,
                    triggered_by,
                });
            }
            console.log(`[RefreshService] RP refresh (${mode}) completed for school=${school_id} year=${academic_year} job=${job_run_id}`);
        }
        catch (err) {
            const procHint = failedProc ? ` at ${failedProc}` : '';
            console.error(`[RefreshService] RP refresh (${mode}) failed for school=${school_id} job=${job_run_id}${procHint}:`, err?.message || err);
            // Error already logged to admin.refresh_job_log by the failing SP
        }
    });
    refreshQueues.set(queueKey, next);
    setImmediate(() => {
        next.finally(() => {
            if (refreshQueues.get(queueKey) === next) {
                refreshQueues.delete(queueKey);
            }
        }).catch(() => {
            // no-op: errors are already logged above
        });
    });
    return { job_run_id };
}
function getStepsForMode(mode) {
    switch (mode) {
        case 'non_assessment_core':
            return RP_REFRESH_STEPS.filter((s) => [1, 2, 3].includes(s.order));
        case 'attendance_only':
            return RP_REFRESH_STEPS.filter((s) => s.order === 9);
        case 'assessment_dependent':
            return RP_REFRESH_STEPS.filter((s) => [4, 5, 6, 7, 8, 10, 11, 12].includes(s.order));
        case 'full':
        default:
            return RP_REFRESH_STEPS;
    }
}
/**
 * Execute BuildStudentAssessmentsByAcademicYear stored procedure synchronously.
 * Sync run completion should wait for this call when enabled.
 */
export async function buildStudentAssessmentsByAcademicYear(params) {
    const { academic_year, node } = params;
    if (!academic_year?.trim()) {
        throw new Error('academic_year is required for BuildStudentAssessmentsByAcademicYear.');
    }
    if (!node?.trim()) {
        throw new Error('node is required for BuildStudentAssessmentsByAcademicYear.');
    }
    const pool = await getRefreshPool();
    const request = pool.request();
    // Parameter names must match the stored procedure definition exactly.
    // RP.BuildStudentAssessmentsByAcademicYear(@AcademicYear, @Node_id)
    request.input('AcademicYear', sql.NVarChar(100), academic_year.trim());
    request.input('Node_id', sql.NVarChar(100), node.trim());
    await request.execute('RP.BuildStudentAssessmentsByAcademicYear');
}
//# sourceMappingURL=RefreshService.js.map