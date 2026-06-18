/**
 * In-memory job tracker for long-running FIS report generation.
 * Allows the API to return immediately while the server batches SP calls.
 */
const jobs = new Map();
const JOB_TTL_MS = 60 * 60 * 1000;
function pruneOldJobs() {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
        if ((job.completedAt ?? job.startedAt) < cutoff) {
            jobs.delete(id);
        }
    }
}
export function createGenerationJob() {
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
export function updateGenerationJobProgress(jobId, progress) {
    const job = jobs.get(jobId);
    if (!job || job.status === 'success' || job.status === 'failed')
        return;
    job.status = 'running';
    job.progress = progress;
}
export function completeGenerationJob(jobId, result) {
    const job = jobs.get(jobId);
    if (!job)
        return;
    job.status = 'success';
    job.result = result;
    job.completedAt = Date.now();
}
export function failGenerationJob(jobId, error) {
    const job = jobs.get(jobId);
    if (!job)
        return;
    job.status = 'failed';
    job.error = error;
    job.completedAt = Date.now();
}
export function getGenerationJob(jobId) {
    return jobs.get(jobId) ?? null;
}
//# sourceMappingURL=FISReportGenerationJobService.js.map