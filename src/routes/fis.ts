/**
 * FIS (Financial Information System) Reporting Routes
 */

import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { fisService, FISServiceError, FisRuleCriterion } from '../services/FISService.js';
import {
  listTrialBalanceEntityPeriods,
  getLatestTrialBalanceUploads,
  buildColumnsFromEntityTrialBalance,
  getReportOutputPreview,
} from '../services/FISTrialBalanceProcessService.js';

const router = express.Router();
router.use(authenticate);

function parseId(value: string, name: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) {
    throw new FISServiceError(`Invalid ${name}`, 400);
  }
  return n;
}

function handleError(res: Response, error: unknown): Response {
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
router.get('/report-types', async (_req: Request, res: Response) => {
  try {
    const data = await fisService.getReportTypes();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// POST /api/fis/report-types
router.post('/report-types', async (req: Request, res: Response) => {
  try {
    const reportTypeId = await fisService.createReportType({
      ...req.body,
      createdBy: req.user?.email ?? null,
    });
    return res.status(201).json({ success: true, data: { reportTypeId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/report-types/:id/rows
router.get('/report-types/:id/rows', async (req: Request, res: Response) => {
  try {
    const reportTypeId = parseId(req.params.id, 'report type id');
    const data = await fisService.getRowsByReportType(reportTypeId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// POST /api/fis/report-types/:id/rows
router.post('/report-types/:id/rows', async (req: Request, res: Response) => {
  try {
    const reportTypeId = parseId(req.params.id, 'report type id');
    const rowId = await fisService.createRow(reportTypeId, req.body);
    return res.status(201).json({ success: true, data: { rowId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// PUT /api/fis/rows/reorder (before /rows/:rowId)
router.put('/rows/reorder', async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: 'Body must be an array of { rowId, displayOrder }' });
    }
    const normalized = updates.map((u: { rowId?: number; displayOrder?: number }) => ({
      rowId: parseId(String(u.rowId), 'rowId'),
      displayOrder: parseId(String(u.displayOrder), 'displayOrder'),
    }));
    await fisService.reorderRows(normalized);
    return res.json({ success: true, data: { updated: normalized.length } });
  } catch (error) {
    return handleError(res, error);
  }
});

// PUT /api/fis/rows/:rowId
router.put('/rows/:rowId', async (req: Request, res: Response) => {
  try {
    const rowId = parseId(req.params.rowId, 'row id');
    const row = await fisService.updateRow(rowId, req.body);
    return res.json({ success: true, data: row });
  } catch (error) {
    return handleError(res, error);
  }
});

// DELETE /api/fis/rows/:rowId
router.delete('/rows/:rowId', async (req: Request, res: Response) => {
  try {
    const rowId = parseId(req.params.rowId, 'row id');
    await fisService.softDeleteRow(rowId);
    return res.json({ success: true, data: { rowId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/rows/:rowId/rules
router.get('/rows/:rowId/rules', async (req: Request, res: Response) => {
  try {
    const rowId = parseId(req.params.rowId, 'row id');
    const data = await fisService.getRulesForRow(rowId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// POST /api/fis/rows/:rowId/rules
router.post('/rows/:rowId/rules', async (req: Request, res: Response) => {
  try {
    const rowId = parseId(req.params.rowId, 'row id');
    const ruleId = await fisService.createRule(rowId, req.body);
    return res.status(201).json({ success: true, data: { ruleId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// PUT /api/fis/rules/:ruleId
router.put('/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const ruleId = parseId(req.params.ruleId, 'rule id');
    await fisService.updateRule(ruleId, req.body);
    return res.json({ success: true, data: { ruleId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// DELETE /api/fis/rules/:ruleId
router.delete('/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const ruleId = parseId(req.params.ruleId, 'rule id');
    await fisService.softDeleteRule(ruleId);
    return res.json({ success: true, data: { ruleId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// PUT /api/fis/rules/:ruleId/criteria
router.put('/rules/:ruleId/criteria', async (req: Request, res: Response) => {
  try {
    const ruleId = parseId(req.params.ruleId, 'rule id');
    const criteria = (Array.isArray(req.body) ? req.body : req.body.criteria) as FisRuleCriterion[];
    if (!Array.isArray(criteria)) {
      return res.status(400).json({ success: false, error: 'Body must be a criteria array' });
    }
    await fisService.replaceRuleCriteria(ruleId, criteria);
    return res.json({ success: true, data: { ruleId, criteriaCount: criteria.length } });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/instances
router.get('/instances', async (_req: Request, res: Response) => {
  try {
    const data = await fisService.getInstances();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// POST /api/fis/instances
router.post('/instances', async (req: Request, res: Response) => {
  try {
    const body = { ...req.body };
    if (!body.createdBy && !body.created_by && req.user?.email) {
      body.createdBy = req.user.email;
    }
    const instanceId = await fisService.createInstance(body);
    return res.status(201).json({ success: true, data: { instanceId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// POST /api/fis/instances/:id/generate
router.post('/instances/:id/generate', async (req: Request, res: Response) => {
  try {
    const instanceId = parseId(req.params.id, 'instance id');
    const entityCode = String(req.body?.entityCode ?? req.body?.entity_code ?? '').trim();
    const period = String(req.body?.period ?? '').trim();
    const scope = entityCode && period ? { entityCode, period } : undefined;
    const data = await fisService.generateReport(instanceId, scope);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/instances/:id/output?limit= (before /instances/:id)
router.get('/instances/:id/output', async (req: Request, res: Response) => {
  try {
    const instanceId = parseId(req.params.id, 'instance id');
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const data = await getReportOutputPreview(instanceId, Number.isNaN(limit) ? 100 : limit);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/instances/:id
router.get('/instances/:id', async (req: Request, res: Response) => {
  try {
    const instanceId = parseId(req.params.id, 'instance id');
    const data = await fisService.getInstance(instanceId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// PUT /api/fis/instances/:id
router.put('/instances/:id', async (req: Request, res: Response) => {
  try {
    const instanceId = parseId(req.params.id, 'instance id');
    await fisService.updateInstance(instanceId, req.body);
    return res.json({ success: true, data: { instanceId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// DELETE /api/fis/instances/:id
router.delete('/instances/:id', async (req: Request, res: Response) => {
  try {
    const instanceId = parseId(req.params.id, 'instance id');
    await fisService.softDeleteInstance(instanceId);
    return res.json({ success: true, data: { instanceId } });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/trial-balance/entity-periods
router.get('/trial-balance/entity-periods', async (_req: Request, res: Response) => {
  try {
    const data = await listTrialBalanceEntityPeriods();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/trial-balance/uploads?entity_code=&period=
router.get('/trial-balance/uploads', async (req: Request, res: Response) => {
  try {
    const entityCode = String(req.query.entity_code || '').trim();
    const period = String(req.query.period || '').trim();
    if (!entityCode || !period) {
      return res.status(400).json({ success: false, error: 'entity_code and period query parameters are required' });
    }
    const data = await getLatestTrialBalanceUploads(entityCode, period);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/trial-balance/columns-for-entity?entity_code=&period=
router.get('/trial-balance/columns-for-entity', async (req: Request, res: Response) => {
  try {
    const entityCode = String(req.query.entity_code || '').trim();
    const period = req.query.period ? String(req.query.period).trim() : undefined;
    if (!entityCode) {
      return res.status(400).json({ success: false, error: 'entity_code query parameter is required' });
    }
    const data = await buildColumnsFromEntityTrialBalance(entityCode, period);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/fis/dictionary?dictionary_type=&entity=&search=
router.get('/dictionary', async (req: Request, res: Response) => {
  try {
    const dictionaryType = String(req.query.dictionary_type || '').trim();
    if (!dictionaryType) {
      return res.status(400).json({ success: false, error: 'dictionary_type query parameter is required' });
    }
    const entity = req.query.entity ? String(req.query.entity) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const data = await fisService.getDictionaryCodes(dictionaryType, entity, search);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
});

export default router;
