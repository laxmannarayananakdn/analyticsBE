/**
 * In-memory job tracker for long-running FIS report generation.
 * Allows the API to return immediately while the server batches SP calls.
 */

export type FisGenerationJobProgress = {
  phase: 'init' | 'sum' | 'finalize';
  current: number;
  total: number;
  label?: string;
  sumStep?: 'column';
  finalizeStep?: 'pit' | 'variance' | 'expression' | 'normalize';
  reportTypeCode?: string;
  batchIndex?: number;
  batchTotal?: number;
  startedAt?: number;
};

export type FisGenerationJobStatus = 'pending' | 'running' | 'success' | 'failed';

export type FisGenerationJobReportResult = {
  reportTypeCode: string;
  outputRowCount: number;
};

export type FisGenerationJob = {
  jobId: string;
  status: FisGenerationJobStatus;
  progress: FisGenerationJobProgress | null;
  result?: {
    reportTypeCode?: string;
    entityCode: string;
    asOfPeriod: string;
    outputRowCount?: number;
    fileStatus?: 'Preliminary' | 'Final';
    isTbLocked?: boolean;
    reports?: FisGenerationJobReportResult[];
  };
  error?: string;
  startedAt: number;
  completedAt?: number;
};

const jobs = new Map<string, FisGenerationJob>();
const JOB_TTL_MS = 60 * 60 * 1000;

function pruneOldJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if ((job.completedAt ?? job.startedAt) < cutoff) {
      jobs.delete(id);
    }
  }
}

export function createGenerationJob(): string {
  pruneOldJobs();
  const jobId = `fis-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  jobs.set(jobId, {
    jobId,
    status: 'pending',
    progress: null,
    startedAt: Date.now(),
  });
  return jobId;
}

export function updateGenerationJobProgress(jobId: string, progress: FisGenerationJobProgress): void {
  const job = jobs.get(jobId);
  if (!job || job.status === 'success' || job.status === 'failed') return;
  job.status = 'running';
  job.progress = progress;
}

export function completeGenerationJob(
  jobId: string,
  result: NonNullable<FisGenerationJob['result']>
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'success';
  job.result = result;
  job.completedAt = Date.now();
}

export function failGenerationJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  job.completedAt = Date.now();
}

export function getGenerationJob(jobId: string): FisGenerationJob | null {
  return jobs.get(jobId) ?? null;
}
