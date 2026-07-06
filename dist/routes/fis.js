/**
 * FIS (Financial Information System) Reporting Routes
 */
import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { fisService, FISServiceError } from '../services/FISService.js';
import { listTrialBalanceEntityPeriods, getLatestTrialBalanceUploads, buildColumnsFromEntityTrialBalance, getReportOutputPreview, getReportOutputPreviewByRunKey, } from '../services/FISTrialBalanceProcessService.js';
import { getPeriodCoverage, getRunCalendar, isFisPhase4Enabled, resolveFileStatusForPeriod, } from '../services/FISRunTrackingService.js';
import { isFisPipelineV2Enabled } from '../services/FISReportV2Service.js';
import { listSftpPullLog, listReportProcessingAttempts, } from '../services/FISProcessingLogService.js';
const router = express.Router();
router.use(authenticate);
function parseId(value, name) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) {
        throw new FISServiceError(`Invalid ${name}`, 400);
    }
    return n;
}
function handleError(res, error) {
    if (error instanceof FISServiceError) {
        return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    console.error('FIS route error:', error);
    return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
    });
}
// GET /api/fis/report-types
router.get('/report-types', async (_req, res) => {
    try {
        const data = await fisService.getReportTypes();
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/report-types
router.post('/report-types', async (req, res) => {
    try {
        const reportTypeId = await fisService.createReportType({
            ...req.body,
            createdBy: req.user?.email ?? null,
        });
        return res.status(201).json({ success: true, data: { reportTypeId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// PUT /api/fis/report-types/:id
router.put('/report-types/:id', async (req, res) => {
    try {
        const reportTypeId = parseId(req.params.id, 'report type id');
        const data = await fisService.updateReportType(reportTypeId, req.body);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/report-types/:id/rows
router.get('/report-types/:id/rows', async (req, res) => {
    try {
        const reportTypeId = parseId(req.params.id, 'report type id');
        const data = await fisService.getRowsByReportType(reportTypeId);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/report-types/:id/rows
router.post('/report-types/:id/rows', async (req, res) => {
    try {
        const reportTypeId = parseId(req.params.id, 'report type id');
        const rowId = await fisService.createRow(reportTypeId, req.body);
        return res.status(201).json({ success: true, data: { rowId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/report-types/:id/column-defs/preview?as_of_period=
router.get('/report-types/:id/column-defs/preview', async (req, res) => {
    try {
        const reportTypeId = parseId(req.params.id, 'report type id');
        const asOfPeriod = String(req.query.as_of_period ?? req.query.period ?? '').trim();
        if (!asOfPeriod) {
            return res.status(400).json({ success: false, error: 'as_of_period query parameter is required' });
        }
        const data = await fisService.getColumnDefPreview(reportTypeId, asOfPeriod);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/report-types/:id/column-defs
router.get('/report-types/:id/column-defs', async (req, res) => {
    try {
        const reportTypeId = parseId(req.params.id, 'report type id');
        const activeOnly = req.query.active_only === '1' || req.query.activeOnly === 'true';
        const data = await fisService.getColumnDefsByReportType(reportTypeId, activeOnly);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/report-types/:id/column-defs
router.post('/report-types/:id/column-defs', async (req, res) => {
    try {
        const reportTypeId = parseId(req.params.id, 'report type id');
        const columnDefId = await fisService.createColumnDef(reportTypeId, req.body);
        return res.status(201).json({ success: true, data: { columnDefId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// PUT /api/fis/column-defs/reorder (before /column-defs/:id)
router.put('/column-defs/reorder', async (req, res) => {
    try {
        const updates = req.body;
        if (!Array.isArray(updates)) {
            return res.status(400).json({
                success: false,
                error: 'Body must be an array of { columnDefId, displayOrder }',
            });
        }
        const normalized = updates.map((u) => ({
            columnDefId: parseId(String(u.columnDefId), 'columnDefId'),
            displayOrder: parseId(String(u.displayOrder), 'displayOrder'),
        }));
        await fisService.reorderColumnDefs(normalized);
        return res.json({ success: true, data: { updated: normalized.length } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// PUT /api/fis/column-defs/:id
router.put('/column-defs/:id', async (req, res) => {
    try {
        const columnDefId = parseId(req.params.id, 'column def id');
        const data = await fisService.updateColumnDef(columnDefId, req.body);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// DELETE /api/fis/column-defs/:id
router.delete('/column-defs/:id', async (req, res) => {
    try {
        const columnDefId = parseId(req.params.id, 'column def id');
        await fisService.softDeleteColumnDef(columnDefId);
        return res.json({ success: true, data: { columnDefId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// PUT /api/fis/rows/reorder (before /rows/:rowId)
router.put('/rows/reorder', async (req, res) => {
    try {
        const updates = req.body;
        if (!Array.isArray(updates)) {
            return res.status(400).json({ success: false, error: 'Body must be an array of { rowId, displayOrder }' });
        }
        const normalized = updates.map((u) => ({
            rowId: parseId(String(u.rowId), 'rowId'),
            displayOrder: parseId(String(u.displayOrder), 'displayOrder'),
        }));
        await fisService.reorderRows(normalized);
        return res.json({ success: true, data: { updated: normalized.length } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// PUT /api/fis/rows/:rowId
router.put('/rows/:rowId', async (req, res) => {
    try {
        const rowId = parseId(req.params.rowId, 'row id');
        const row = await fisService.updateRow(rowId, req.body);
        return res.json({ success: true, data: row });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// DELETE /api/fis/rows/:rowId
router.delete('/rows/:rowId', async (req, res) => {
    try {
        const rowId = parseId(req.params.rowId, 'row id');
        await fisService.softDeleteRow(rowId);
        return res.json({ success: true, data: { rowId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/rows/:rowId/rules
router.get('/rows/:rowId/rules', async (req, res) => {
    try {
        const rowId = parseId(req.params.rowId, 'row id');
        const data = await fisService.getRulesForRow(rowId);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/rows/:rowId/rules
router.post('/rows/:rowId/rules', async (req, res) => {
    try {
        const rowId = parseId(req.params.rowId, 'row id');
        const ruleId = await fisService.createRule(rowId, req.body);
        return res.status(201).json({ success: true, data: { ruleId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// PUT /api/fis/rules/:ruleId
router.put('/rules/:ruleId', async (req, res) => {
    try {
        const ruleId = parseId(req.params.ruleId, 'rule id');
        await fisService.updateRule(ruleId, req.body);
        return res.json({ success: true, data: { ruleId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// DELETE /api/fis/rules/:ruleId
router.delete('/rules/:ruleId', async (req, res) => {
    try {
        const ruleId = parseId(req.params.ruleId, 'rule id');
        await fisService.softDeleteRule(ruleId);
        return res.json({ success: true, data: { ruleId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// PUT /api/fis/rules/:ruleId/criteria
router.put('/rules/:ruleId/criteria', async (req, res) => {
    try {
        const ruleId = parseId(req.params.ruleId, 'rule id');
        const criteria = (Array.isArray(req.body) ? req.body : req.body.criteria);
        if (!Array.isArray(criteria)) {
            return res.status(400).json({ success: false, error: 'Body must be a criteria array' });
        }
        await fisService.replaceRuleCriteria(ruleId, criteria);
        return res.json({ success: true, data: { ruleId, criteriaCount: criteria.length } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/config
router.get('/config', async (_req, res) => {
    try {
        return res.json({
            success: true,
            data: {
                phase4Enabled: isFisPhase4Enabled(),
                pipelineV2Enabled: isFisPipelineV2Enabled(),
            },
        });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/reports/generate-batch — NF → BS → PL → CF for selected types
router.post('/reports/generate-batch', async (req, res) => {
    try {
        const rawTypes = req.body?.reportTypeCodes ?? req.body?.report_type_codes ?? req.body?.reportTypes;
        const reportTypeCodes = Array.isArray(rawTypes)
            ? rawTypes.map((c) => String(c).trim()).filter(Boolean)
            : String(rawTypes ?? '')
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean);
        const entityCode = String(req.body?.entityCode ?? req.body?.entity_code ?? '').trim();
        const asOfPeriod = String(req.body?.asOfPeriod ?? req.body?.as_of_period ?? req.body?.period ?? '').trim();
        const { createGenerationJob, updateGenerationJobProgress, completeGenerationJob, failGenerationJob, } = await import('../services/FISReportGenerationJobService.js');
        const jobId = createGenerationJob();
        res.json({ success: true, data: { jobId, status: 'pending' } });
        void (async () => {
            try {
                const data = await fisService.generateReportsByRunKey(reportTypeCodes, entityCode, asOfPeriod, req.user?.email ?? null, (progress) => updateGenerationJobProgress(jobId, progress));
                completeGenerationJob(jobId, data);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Report generation failed';
                failGenerationJob(jobId, message);
            }
        })();
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/reports/generate-batch-v2 — parallel NF/BS/PL then CF into rp.fis_report_output_new
router.post('/reports/generate-batch-v2', async (req, res) => {
    try {
        if (!isFisPipelineV2Enabled()) {
            return res.status(400).json({
                success: false,
                error: 'FIS V2 pipeline is disabled. Set FIS_PIPELINE_V2=true in backend .env',
            });
        }
        const rawTypes = req.body?.reportTypeCodes ?? req.body?.report_type_codes ?? req.body?.reportTypes;
        const reportTypeCodes = Array.isArray(rawTypes)
            ? rawTypes.map((c) => String(c).trim()).filter(Boolean)
            : String(rawTypes ?? '')
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean);
        const entityCode = String(req.body?.entityCode ?? req.body?.entity_code ?? '').trim();
        const asOfPeriod = String(req.body?.asOfPeriod ?? req.body?.as_of_period ?? req.body?.period ?? '').trim();
        const { createGenerationJob, updateV2GenerationJobProgress, completeGenerationJob, failGenerationJob, } = await import('../services/FISReportGenerationJobService.js');
        const { fisReportV2Service } = await import('../services/FISReportV2Service.js');
        const jobId = createGenerationJob('v2');
        res.json({ success: true, data: { jobId, status: 'pending', pipeline: 'v2' } });
        void (async () => {
            try {
                const data = await fisReportV2Service.generateReportsByRunKeyV2(reportTypeCodes, entityCode, asOfPeriod, req.user?.email ?? null, (progress) => updateV2GenerationJobProgress(jobId, progress));
                completeGenerationJob(jobId, data);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Report generation failed';
                failGenerationJob(jobId, message);
            }
        })();
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/sftp/poll — manually poll SFTP unprocessed folder (loads TB into FIN.TrialBalance)
router.post('/sftp/poll', async (_req, res) => {
    try {
        const { isFisSftpPollerEnabled } = await import('../config/fisSftp.js');
        if (!isFisSftpPollerEnabled()) {
            return res.status(400).json({
                success: false,
                error: 'FIS SFTP poller is disabled. Set ENABLE_FIS_SFTP_POLLER=true in backend .env',
            });
        }
        const { pollFisSftpUnprocessedFiles } = await import('../services/FisSftpPoller.js');
        const result = await pollFisSftpUnprocessedFiles();
        return res.json({ success: true, data: result });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/reports/generate — start async batched run-key generation (single report)
router.post('/reports/generate', async (req, res) => {
    try {
        const reportTypeCode = String(req.body?.reportTypeCode ?? req.body?.report_type_code ?? '').trim();
        const entityCode = String(req.body?.entityCode ?? req.body?.entity_code ?? '').trim();
        const asOfPeriod = String(req.body?.asOfPeriod ?? req.body?.as_of_period ?? req.body?.period ?? '').trim();
        const { createGenerationJob, updateGenerationJobProgress, completeGenerationJob, failGenerationJob, } = await import('../services/FISReportGenerationJobService.js');
        const jobId = createGenerationJob();
        res.json({ success: true, data: { jobId, status: 'pending' } });
        void (async () => {
            try {
                const data = await fisService.generateReportByRunKey(reportTypeCode, entityCode, asOfPeriod, req.user?.email ?? null, (progress) => updateGenerationJobProgress(jobId, progress));
                completeGenerationJob(jobId, data);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Report generation failed';
                failGenerationJob(jobId, message);
            }
        })();
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/reports/generate/jobs/:jobId — poll generation progress
router.get('/reports/generate/jobs/:jobId', async (req, res) => {
    try {
        const { getGenerationJob } = await import('../services/FISReportGenerationJobService.js');
        const job = getGenerationJob(req.params.jobId);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Generation job not found' });
        }
        return res.json({ success: true, data: job });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/reports/generate/chunk — one step of chunked run-key generation
router.post('/reports/generate/chunk', async (req, res) => {
    req.setTimeout(120000);
    res.setTimeout(120000);
    try {
        const phase = String(req.body?.phase ?? '').trim().toLowerCase();
        const allowedPhases = new Set([
            'init',
            'row',
            'finalize-pit',
            'finalize-variance',
            'finalize-expression',
            'finalize-normalize',
        ]);
        if (!allowedPhases.has(phase)) {
            return res.status(400).json({
                success: false,
                error: 'phase must be init, row, finalize-pit, finalize-variance, finalize-expression, or finalize-normalize',
            });
        }
        const reportTypeCode = String(req.body?.reportTypeCode ?? req.body?.report_type_code ?? '').trim();
        const entityCode = String(req.body?.entityCode ?? req.body?.entity_code ?? '').trim();
        const asOfPeriod = String(req.body?.asOfPeriod ?? req.body?.as_of_period ?? req.body?.period ?? '').trim();
        const rowIdRaw = req.body?.rowId ?? req.body?.row_id;
        const rowId = rowIdRaw != null && rowIdRaw !== '' ? parseInt(String(rowIdRaw), 10) : undefined;
        const columnKeyRaw = req.body?.columnKey ?? req.body?.column_key;
        const columnKey = columnKeyRaw != null && columnKeyRaw !== '' ? parseInt(String(columnKeyRaw), 10) : undefined;
        const runIdRaw = req.body?.runId ?? req.body?.run_id;
        const runId = runIdRaw != null && runIdRaw !== '' ? parseInt(String(runIdRaw), 10) : null;
        const data = await fisService.generateReportRunKeyChunk({
            phase: phase,
            reportTypeCode,
            entityCode,
            asOfPeriod,
            rowId: Number.isNaN(rowId) ? undefined : rowId,
            columnKey: Number.isNaN(columnKey) ? undefined : columnKey,
            runId: Number.isNaN(runId) ? null : runId,
            triggeredBy: req.user?.email ?? null,
        });
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/reports/generate/rows?reportTypeCode=PL
router.get('/reports/generate/rows', async (req, res) => {
    try {
        const reportTypeCode = String(req.query.reportTypeCode ?? req.query.report_type_code ?? '').trim();
        const data = await fisService.getSumRowsForRunKey(reportTypeCode);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/reports/file-status?entity=&period=
router.get('/reports/file-status', async (req, res) => {
    try {
        const entityCode = String(req.query.entity ?? req.query.entity_code ?? '').trim();
        const period = String(req.query.period ?? req.query.as_of_period ?? '').trim();
        if (!entityCode || !period) {
            return res.status(400).json({
                success: false,
                error: 'entity and period query parameters are required',
            });
        }
        if (!isFisPhase4Enabled()) {
            return res.json({ success: true, data: { phase4Enabled: false } });
        }
        const data = await resolveFileStatusForPeriod(entityCode, period);
        return res.json({ success: true, data: { phase4Enabled: true, ...data } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/reports/calendar?entity=&year=
router.get('/reports/calendar', async (req, res) => {
    try {
        if (!isFisPhase4Enabled()) {
            return res.json({ success: true, data: [] });
        }
        const entityCode = req.query.entity ? String(req.query.entity) : undefined;
        const year = req.query.year ? String(req.query.year) : undefined;
        const data = await getRunCalendar(entityCode, year);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/reports/output?report_type=&entity=&as_of_period=&file_status=&limit=
router.get('/reports/output', async (req, res) => {
    try {
        const reportTypeCode = String(req.query.report_type ?? req.query.reportType ?? '').trim();
        const entityCode = String(req.query.entity ?? req.query.entity_code ?? '').trim();
        const asOfPeriod = String(req.query.as_of_period ?? req.query.period ?? '').trim();
        const fileStatus = req.query.file_status
            ? String(req.query.file_status).trim()
            : req.query.fileStatus
                ? String(req.query.fileStatus).trim()
                : undefined;
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
        const outputTable = String(req.query.output_table ?? req.query.outputTable ?? '').toLowerCase() === 'new'
            ? 'new'
            : 'live';
        if (!reportTypeCode || !entityCode || !asOfPeriod) {
            return res.status(400).json({
                success: false,
                error: 'report_type, entity, and as_of_period query parameters are required',
            });
        }
        const data = await getReportOutputPreviewByRunKey(reportTypeCode, entityCode, asOfPeriod, Number.isNaN(limit) ? 100 : limit, fileStatus, { outputTable });
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/instances
router.get('/instances', async (_req, res) => {
    try {
        const data = await fisService.getInstances();
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/instances
router.post('/instances', async (req, res) => {
    try {
        const body = { ...req.body };
        if (!body.createdBy && !body.created_by && req.user?.email) {
            body.createdBy = req.user.email;
        }
        const instanceId = await fisService.createInstance(body);
        return res.status(201).json({ success: true, data: { instanceId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// POST /api/fis/instances/:id/generate
router.post('/instances/:id/generate', async (req, res) => {
    try {
        const instanceId = parseId(req.params.id, 'instance id');
        const entityCode = String(req.body?.entityCode ?? req.body?.entity_code ?? '').trim();
        const period = String(req.body?.period ?? '').trim();
        const scope = entityCode && period ? { entityCode, period } : undefined;
        const data = await fisService.generateReport(instanceId, scope);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/instances/:id/output?limit= (before /instances/:id)
router.get('/instances/:id/output', async (req, res) => {
    try {
        const instanceId = parseId(req.params.id, 'instance id');
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
        const data = await getReportOutputPreview(instanceId, Number.isNaN(limit) ? 100 : limit);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/instances/:id
router.get('/instances/:id', async (req, res) => {
    try {
        const instanceId = parseId(req.params.id, 'instance id');
        const data = await fisService.getInstance(instanceId);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// PUT /api/fis/instances/:id
router.put('/instances/:id', async (req, res) => {
    try {
        const instanceId = parseId(req.params.id, 'instance id');
        await fisService.updateInstance(instanceId, req.body);
        return res.json({ success: true, data: { instanceId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// DELETE /api/fis/instances/:id
router.delete('/instances/:id', async (req, res) => {
    try {
        const instanceId = parseId(req.params.id, 'instance id');
        await fisService.softDeleteInstance(instanceId);
        return res.json({ success: true, data: { instanceId } });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/trial-balance/coverage?entity=&period=
router.get('/trial-balance/coverage', async (req, res) => {
    try {
        const entityCode = String(req.query.entity ?? req.query.entity_code ?? '').trim();
        const period = String(req.query.period ?? '').trim();
        if (!entityCode || !period) {
            return res.status(400).json({
                success: false,
                error: 'entity and period query parameters are required',
            });
        }
        const data = await getPeriodCoverage(entityCode, period);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/trial-balance/entity-periods
router.get('/trial-balance/entity-periods', async (_req, res) => {
    try {
        const data = await listTrialBalanceEntityPeriods();
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/trial-balance/uploads?entity_code=&period=
router.get('/trial-balance/uploads', async (req, res) => {
    try {
        const entityCode = String(req.query.entity_code || '').trim();
        const period = String(req.query.period || '').trim();
        if (!entityCode || !period) {
            return res.status(400).json({ success: false, error: 'entity_code and period query parameters are required' });
        }
        const data = await getLatestTrialBalanceUploads(entityCode, period);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/trial-balance/columns-for-entity?entity_code=&period=
router.get('/trial-balance/columns-for-entity', async (req, res) => {
    try {
        const entityCode = String(req.query.entity_code || '').trim();
        const period = req.query.period ? String(req.query.period).trim() : undefined;
        if (!entityCode) {
            return res.status(400).json({ success: false, error: 'entity_code query parameter is required' });
        }
        const data = await buildColumnsFromEntityTrialBalance(entityCode, period);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/logs/sftp-pulls?entity=&period=&limit=
router.get('/logs/sftp-pulls', async (req, res) => {
    try {
        const entityCode = req.query.entity ? String(req.query.entity).trim() : undefined;
        const period = req.query.period ? String(req.query.period).trim() : undefined;
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
        const data = await listSftpPullLog({ entityCode, period, limit });
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/logs/report-processing?entity=&period=&limit=
router.get('/logs/report-processing', async (req, res) => {
    try {
        const entityCode = req.query.entity ? String(req.query.entity).trim() : undefined;
        const period = req.query.period ? String(req.query.period).trim() : undefined;
        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
        const data = await listReportProcessingAttempts({ entityCode, period, limit });
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
// GET /api/fis/dictionary?dictionary_type=&entity=&search=
router.get('/dictionary', async (req, res) => {
    try {
        const dictionaryType = String(req.query.dictionary_type || '').trim();
        if (!dictionaryType) {
            return res.status(400).json({ success: false, error: 'dictionary_type query parameter is required' });
        }
        const entity = req.query.entity ? String(req.query.entity) : undefined;
        const search = req.query.search ? String(req.query.search) : undefined;
        const data = await fisService.getDictionaryCodes(dictionaryType, entity, search);
        return res.json({ success: true, data });
    }
    catch (error) {
        return handleError(res, error);
    }
});
export default router;
//# sourceMappingURL=fis.js.map