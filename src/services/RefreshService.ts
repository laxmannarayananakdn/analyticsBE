/**
 * RP Refresh Service
 *
 * Runs the 12-step RP refresh pipeline (stored procedures) for a school + academic year.
 * Triggered automatically when a Sync Schedule runs with "Run RP refresh after sync" checked.
 * Uses a separate connection pool with no command timeout per design guide Section 5.5.
 */

import sql from 'mssql';
import { randomUUID } from 'crypto';

const RP_REFRESH_STEPS: { proc: string; order: number }[] = [
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

let refreshPool: sql.ConnectionPool | null = null;

function getRefreshPoolConfig(): sql.config {
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

async function getRefreshPool(): Promise<sql.ConnectionPool> {
  if (!refreshPool || !refreshPool.connected) {
    refreshPool = await sql.connect(getRefreshPoolConfig());
  }
  return refreshPool;
}

/**
 * Close the refresh pool (for graceful shutdown).
 */
export async function closeRefreshPool(): Promise<void> {
  if (refreshPool) {
    try {
      await refreshPool.close();
    } catch (err) {
      console.error('[RefreshService] Error closing refresh pool:', err);
    }
    refreshPool = null;
  }
}

export interface TriggerRefreshParams {
  school_id: string;
  /** Required. Same format as Sync Schedules (e.g. "2024 - 2025"). */
  academic_year: string;
  triggered_by?: string;
}

/**
 * Execute one stored procedure step.
 */
async function execStep(
  pool: sql.ConnectionPool,
  procName: string,
  params: { school_id: string; academic_year: string; job_run_id: string; triggered_by: string }
): Promise<void> {
  const request = pool.request();
  request.input('school_id', sql.NVarChar(50), params.school_id);
  request.input('academic_year', sql.NVarChar(20), params.academic_year);
  request.input('job_run_id', sql.UniqueIdentifier, params.job_run_id);
  request.input('triggered_by', sql.NVarChar(200), params.triggered_by);
  await request.execute(procName);
}

/**
 * Run the full 12-step RP refresh pipeline.
 * Requires school_id and academic_year (same as Sync Schedules).
 * On error: stops pipeline, does NOT run step 12. Error is logged by the SP to refresh_job_log.
 */
export async function runRefreshPipeline(params: TriggerRefreshParams): Promise<{ job_run_id: string }> {
  const { school_id, academic_year, triggered_by = 'system' } = params;
  if (!academic_year?.trim()) {
    throw new Error('academic_year is required. Use the same format as Sync Schedules (e.g. "2024 - 2025").');
  }

  const job_run_id = randomUUID();
  const pool = await getRefreshPool();

  for (const { proc } of RP_REFRESH_STEPS) {
    await execStep(pool, proc, {
      school_id,
      academic_year: academic_year.trim(),
      job_run_id,
      triggered_by,
    });
  }

  return { job_run_id };
}

/**
 * Trigger the RP refresh pipeline in the background (fire-and-forget).
 * Called by SyncOrchestratorService when load_rp_schema is checked and sync completes.
 */
export async function triggerRefresh(params: TriggerRefreshParams): Promise<{ job_run_id: string }> {
  const { school_id, academic_year, triggered_by = 'system' } = params;
  if (!academic_year?.trim()) {
    throw new Error('academic_year is required. Use the same format as Sync Schedules (e.g. "2024 - 2025").');
  }

  const job_run_id = randomUUID();

  setImmediate(async () => {
    try {
      const pool = await getRefreshPool();
      for (const { proc } of RP_REFRESH_STEPS) {
        await execStep(pool, proc, {
          school_id,
          academic_year: academic_year.trim(),
          job_run_id,
          triggered_by,
        });
      }
      console.log(`[RefreshService] RP refresh completed for school=${school_id} year=${academic_year} job=${job_run_id}`);
    } catch (err: any) {
      console.error(`[RefreshService] RP refresh failed for school=${school_id} job=${job_run_id}:`, err?.message || err);
      // Error already logged to admin.refresh_job_log by the failing SP
    }
  });

  return { job_run_id };
}
