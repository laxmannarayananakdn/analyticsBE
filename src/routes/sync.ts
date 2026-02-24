/**
 * Sync Schedules and Runs API Routes (Admin only)
 */

import { Router, Request, Response } from 'express';
import { executeQuery } from '../config/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { runSync } from '../services/SyncOrchestratorService.js';
import { getSyncSchedulerTimezone, isSyncSchedulerEnabled } from '../scheduler/SyncScheduler.js';

const router = Router();

/** Registry of AbortControllers for API-triggered runs. Cancel only works for these. */
const activeRunControllers = new Map<number, AbortController>();
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/sync/info
 * Scheduler configuration (timezone, enabled)
 */
router.get('/info', (req: Request, res: Response) => {
  res.json({
    success: true,
    scheduler: {
      enabled: isSyncSchedulerEnabled(),
      timezone: getSyncSchedulerTimezone(),
    },
  });
});

/**
 * GET /api/sync/runs
 * List sync runs with optional filters: node_id, academic_year, status, limit
 */
router.get('/runs', async (req: Request, res: Response) => {
  try {
    const { node_id, academic_year, status, limit = '50' } = req.query;
    const limitNum = Math.min(parseInt(String(limit), 10) || 50, 200);

    let query = `
      SELECT id, schedule_id, node_id, academic_year, status, started_at, completed_at,
             total_schools, schools_succeeded, schools_failed, triggered_by, error_summary, created_at
      FROM admin.sync_runs
      WHERE 1=1
    `;
    const params: Record<string, any> = { limit: limitNum };

    if (node_id && typeof node_id === 'string') {
      query += ` AND node_id = @node_id`;
      params.node_id = node_id;
    }
    if (academic_year && typeof academic_year === 'string') {
      query += ` AND academic_year = @academic_year`;
      params.academic_year = academic_year;
    }
    if (status && typeof status === 'string') {
      query += ` AND status = @status`;
      params.status = status;
    }

    query += ` ORDER BY started_at DESC OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`;

    const result = await executeQuery<any>(query, params);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      runs: result.data || [],
      count: (result.data || []).length,
    });
  } catch (error: any) {
    console.error('Get sync runs error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sync/runs/:id
 * Get sync run detail including schools
 */
router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid run ID' });
    }

    const runResult = await executeQuery<any>(
      `SELECT id, schedule_id, node_id, academic_year, status, started_at, completed_at,
              total_schools, schools_succeeded, schools_failed, triggered_by, error_summary, created_at
       FROM admin.sync_runs WHERE id = @id`,
      { id }
    );

    if (runResult.error || !runResult.data || runResult.data.length === 0) {
      return res.status(404).json({ error: 'Sync run not found' });
    }

    const schoolsResult = await executeQuery<any>(
      `SELECT id, sync_run_id, school_id, school_source, config_id, school_name, status,
              started_at, completed_at, error_message, current_endpoint
       FROM admin.sync_run_schools WHERE sync_run_id = @id ORDER BY id`,
      { id }
    );

    const run = runResult.data[0];
    run.schools = schoolsResult.error ? [] : (schoolsResult.data || []);

    res.json({
      success: true,
      run,
    });
  } catch (error: any) {
    console.error('Get sync run detail error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sync/runs/:id/schools
 * Get paginated schools for a run
 */
router.get('/runs/:id/schools', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const offset = Math.max(0, parseInt(String(req.query.offset), 10) || 0);
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 200);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid run ID' });
    }

    const result = await executeQuery<any>(
      `SELECT id, sync_run_id, school_id, school_source, config_id, school_name, status,
              started_at, completed_at, error_message, current_endpoint
       FROM admin.sync_run_schools
       WHERE sync_run_id = @id
       ORDER BY id
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      { id, offset, limit }
    );

    const countResult = await executeQuery<{ total: number }>(
      `SELECT COUNT(*) AS total FROM admin.sync_run_schools WHERE sync_run_id = @id`,
      { id }
    );

    const total = countResult.data?.[0]?.total ?? 0;

    res.json({
      success: true,
      schools: result.error ? [] : (result.data || []),
      total,
      offset,
      limit,
    });
  } catch (error: any) {
    console.error('Get sync run schools error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/sync/schedules
 * List all sync schedules
 */
router.get('/schedules', async (req: Request, res: Response) => {
  try {
    const result = await executeQuery<any>(
      `SELECT id, node_id, academic_year, cron_expression, endpoints_mb, endpoints_nex,
              include_descendants, is_active, created_at, updated_at, created_by
       FROM admin.sync_schedules
       ORDER BY node_id, academic_year`
    );

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      schedules: result.data || [],
    });
  } catch (error: any) {
    console.error('Get sync schedules error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/sync/schedules
 * Create a sync schedule
 */
router.post('/schedules', async (req: Request, res: Response) => {
  try {
    const { node_id, academic_year, cron_expression, endpoints_mb, endpoints_nex, include_descendants, created_by } = req.body;

    if (!node_id || !academic_year || !cron_expression) {
      return res.status(400).json({ error: 'node_id, academic_year, and cron_expression are required' });
    }

    const result = await executeQuery<any>(
      `INSERT INTO admin.sync_schedules (node_id, academic_year, cron_expression, endpoints_mb, endpoints_nex, include_descendants, created_by)
       OUTPUT INSERTED.id, INSERTED.node_id, INSERTED.academic_year, INSERTED.cron_expression
       VALUES (@node_id, @academic_year, @cron_expression, @endpoints_mb, @endpoints_nex, @include_descendants, @created_by)`,
      {
        node_id,
        academic_year,
        cron_expression,
        endpoints_mb: endpoints_mb ? JSON.stringify(endpoints_mb) : null,
        endpoints_nex: endpoints_nex ? JSON.stringify(endpoints_nex) : null,
        include_descendants: include_descendants ? 1 : 0,
        created_by: created_by || req.user?.email || null,
      }
    );

    if (result.error || !result.data?.[0]) {
      return res.status(500).json({ error: result.error || 'Failed to create schedule' });
    }

    res.status(201).json({
      success: true,
      schedule: result.data[0],
      message: 'Schedule created successfully',
    });
  } catch (error: any) {
    console.error('Create sync schedule error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * PUT /api/sync/schedules/:id
 * Update a sync schedule
 */
router.put('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }

    const { node_id, academic_year, cron_expression, endpoints_mb, endpoints_nex, include_descendants, is_active } = req.body;

    const updates: string[] = [];
    const params: Record<string, any> = { id };

    if (node_id !== undefined) {
      updates.push('node_id = @node_id');
      params.node_id = node_id;
    }
    if (academic_year !== undefined) {
      updates.push('academic_year = @academic_year');
      params.academic_year = academic_year;
    }
    if (cron_expression !== undefined) {
      updates.push('cron_expression = @cron_expression');
      params.cron_expression = cron_expression;
    }
    if (endpoints_mb !== undefined) {
      updates.push('endpoints_mb = @endpoints_mb');
      params.endpoints_mb = endpoints_mb ? JSON.stringify(endpoints_mb) : null;
    }
    if (endpoints_nex !== undefined) {
      updates.push('endpoints_nex = @endpoints_nex');
      params.endpoints_nex = endpoints_nex ? JSON.stringify(endpoints_nex) : null;
    }
    if (include_descendants !== undefined) {
      updates.push('include_descendants = @include_descendants');
      params.include_descendants = include_descendants ? 1 : 0;
    }
    if (is_active !== undefined) {
      updates.push('is_active = @is_active');
      params.is_active = is_active ? 1 : 0;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = SYSDATETIMEOFFSET()');

    const result = await executeQuery<any>(
      `UPDATE admin.sync_schedules SET ${updates.join(', ')} WHERE id = @id`,
      params
    );

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    const selectResult = await executeQuery<any>(
      `SELECT id, node_id, academic_year, cron_expression, endpoints_mb, endpoints_nex,
              include_descendants, is_active, updated_at
       FROM admin.sync_schedules WHERE id = @id`,
      { id }
    );

    if (!selectResult.data?.[0]) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({
      success: true,
      schedule: selectResult.data[0],
      message: 'Schedule updated successfully',
    });
  } catch (error: any) {
    console.error('Update sync schedule error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/sync/schedules/:id
 * Delete a sync schedule.
 * Sync runs that referenced this schedule are preserved with schedule_id set to NULL.
 */
router.delete('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }

    // Nullify schedule_id in sync_runs first (preserves run history, allows schedule delete)
    await executeQuery(
      `UPDATE admin.sync_runs SET schedule_id = NULL WHERE schedule_id = @id`,
      { id }
    );

    const result = await executeQuery(
      `DELETE FROM admin.sync_schedules WHERE id = @id`,
      { id }
    );

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete sync schedule error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/sync/trigger
 * Manually trigger a sync run. Starts in background, returns immediately with runId.
 * Body: { nodeIds?: string[], nodeId?: string, academicYear?: string, all?: boolean, includeDescendants?: boolean }
 */
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { nodeIds, nodeId, academicYear, all, includeDescendants, endpointsMb, endpointsNex } = req.body;
    const triggeredBy = req.user?.email || 'manual';

    const resolvedNodeIds = nodeIds ?? (nodeId ? [nodeId] : undefined);

    if (!all && (!resolvedNodeIds || resolvedNodeIds.length === 0)) {
      return res.status(400).json({
        error: 'Provide nodeIds (or nodeId), or all: true to sync all configs',
      });
    }

    const nodeIdStr = all ? 'all' : (Array.isArray(resolvedNodeIds) ? resolvedNodeIds.join(',') : (resolvedNodeIds?.[0] ?? ''));
    const academicYearStr = academicYear || new Date().getFullYear().toString();

    const insertResult = await executeQuery<{ id: number }>(
      `INSERT INTO admin.sync_runs (schedule_id, node_id, academic_year, status, started_at, total_schools, schools_succeeded, schools_failed, triggered_by)
       OUTPUT INSERTED.id
       VALUES (NULL, @nodeId, @academicYear, 'pending', SYSDATETIMEOFFSET(), 0, 0, 0, @triggeredBy)`,
      { nodeId: nodeIdStr, academicYear: academicYearStr, triggeredBy }
    );

    if (insertResult.error || !insertResult.data?.[0]?.id) {
      return res.status(500).json({ error: insertResult.error || 'Failed to create sync run' });
    }

    const runId = Number(insertResult.data[0].id);
    const abortController = new AbortController();
    activeRunControllers.set(runId, abortController);

    setImmediate(async () => {
      try {
        const result = await runSync({
          nodeIds: resolvedNodeIds,
          academicYear: academicYearStr,
          includeDescendants: !!includeDescendants,
          all: !!all,
          triggeredBy,
          existingRunId: runId,
          abortSignal: abortController.signal,
          endpointsMb: Array.isArray(endpointsMb) && endpointsMb.length > 0 ? endpointsMb : undefined,
          endpointsNex: Array.isArray(endpointsNex) && endpointsNex.length > 0 ? endpointsNex : undefined,
        });
        console.log(`✅ Sync run ${result.runId} ${result.status}: ${result.schoolsSucceeded} succeeded, ${result.schoolsFailed} failed`);
      } catch (err: any) {
        console.error('❌ Sync trigger failed:', err);
        await executeQuery(
          `UPDATE admin.sync_runs SET status = 'failed', completed_at = SYSDATETIMEOFFSET(), error_summary = @err WHERE id = @runId`,
          { err: (err as Error)?.message || 'Sync failed', runId }
        );
      } finally {
        activeRunControllers.delete(runId);
      }
    });

    res.status(202).json({
      success: true,
      runId,
      status: 'started',
      message: 'Sync job started. Poll GET /api/sync/runs/:id to check status.',
    });
  } catch (error: any) {
    console.error('Trigger sync error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/sync/runs/:id/cancel
 * Cancel a running or pending sync (only for API-triggered runs).
 */
router.post('/runs/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid run ID' });
    }

    const runResult = await executeQuery<{ status: string }>(
      `SELECT status FROM admin.sync_runs WHERE id = @id`,
      { id }
    );

    if (runResult.error || !runResult.data?.[0]) {
      return res.status(404).json({ error: 'Sync run not found' });
    }

    const status = runResult.data[0].status;
    if (status !== 'pending' && status !== 'running') {
      return res.status(400).json({
        error: `Cannot cancel run with status '${status}'. Only pending or running runs can be cancelled.`,
      });
    }

    const controller = activeRunControllers.get(id);
    if (controller) {
      controller.abort();
      return res.json({
        success: true,
        message: 'Cancel requested. The run will stop within seconds (after the current endpoint).',
      });
    }

    // No controller (run from scheduler/CLI, or backend was restarted): update DB only.
    // The actual process may still be running elsewhere, but we mark the record cancelled.
    await executeQuery(
      `UPDATE admin.sync_runs SET status = 'cancelled', completed_at = SYSDATETIMEOFFSET(), error_summary = @err WHERE id = @id`,
      { err: 'Cancelled (run was not in this process)', id }
    );
    await executeQuery(
      `UPDATE admin.sync_run_schools SET status = 'skipped', completed_at = SYSDATETIMEOFFSET(), error_message = @msg
       WHERE sync_run_id = @id AND status IN ('pending', 'running')`,
      { msg: 'Cancelled', id }
    );

    res.json({
      success: true,
      message: 'Run marked as cancelled in database. Polling will stop.',
    });
  } catch (error: any) {
    console.error('Cancel sync run error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
