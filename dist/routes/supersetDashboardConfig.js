/**
 * Superset Dashboard Configuration Routes
 * CRUD for configurable Superset dashboards (embedding)
 */
import { Router } from 'express';
import { executeQuery } from '../config/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
const router = Router();
/**
 * GET /api/superset-dashboard-config
 * Get all active Superset dashboard configs (for dropdown/list)
 * No auth required for listing - used by embed page
 */
router.get('/', async (req, res) => {
    try {
        const activeOnly = req.query.active !== 'false';
        const query = `
      SELECT id, uuid, name, description, sort_order, is_active, folder
      FROM admin.superset_dashboard_configs
      ${activeOnly ? 'WHERE is_active = 1' : ''}
      ORDER BY folder ASC, sort_order ASC, name ASC
    `;
        const result = await executeQuery(query);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            dashboards: result.data || [],
        });
    }
    catch (error) {
        console.error('Error fetching Superset dashboard configs:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/superset-dashboard-config/:id
 * Get a specific dashboard config
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }
        const query = `
      SELECT id, uuid, name, description, sort_order, is_active, folder, created_at, updated_at
      FROM admin.superset_dashboard_configs
      WHERE id = @id
    `;
        const result = await executeQuery(query, { id });
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        const config = (result.data || [])[0];
        if (!config) {
            return res.status(404).json({ error: 'Dashboard config not found' });
        }
        res.json({ success: true, dashboard: config });
    }
    catch (error) {
        console.error('Error fetching dashboard config:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * POST /api/superset-dashboard-config
 * Create a new dashboard config (admin only)
 */
router.post('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const { uuid, name, description, sort_order, is_active, folder } = req.body;
        if (!uuid || !name) {
            return res.status(400).json({ error: 'uuid and name are required' });
        }
        const validFolders = ['Education', 'Finance', 'HR', 'Operations'];
        const folderValue = folder && validFolders.includes(String(folder).trim()) ? String(folder).trim() : 'Education';
        const query = `
      INSERT INTO admin.superset_dashboard_configs (uuid, name, description, sort_order, is_active, folder)
      OUTPUT INSERTED.id, INSERTED.uuid, INSERTED.name, INSERTED.description, INSERTED.sort_order, INSERTED.is_active, INSERTED.folder
      VALUES (@uuid, @name, @description, @sort_order, @is_active, @folder)
    `;
        const result = await executeQuery(query, {
            uuid: String(uuid).trim(),
            name: String(name).trim(),
            description: description ? String(description).trim() : null,
            sort_order: sort_order ?? 0,
            is_active: is_active !== false ? 1 : 0,
            folder: folderValue,
        });
        if (result.error) {
            if (result.error.includes('UNIQUE') || result.error.includes('duplicate')) {
                return res.status(409).json({ error: 'A dashboard with this UUID already exists' });
            }
            return res.status(500).json({ error: result.error });
        }
        const created = (result.data || [])[0];
        res.status(201).json({ success: true, dashboard: created });
    }
    catch (error) {
        console.error('Error creating dashboard config:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * PUT /api/superset-dashboard-config/:id
 * Update a dashboard config (admin only)
 */
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }
        const { uuid, name, description, sort_order, is_active, folder } = req.body;
        const validFolders = ['Education', 'Finance', 'HR', 'Operations'];
        const folderValue = folder !== undefined
            ? (folder && validFolders.includes(String(folder).trim()) ? String(folder).trim() : 'Education')
            : null;
        const query = `
      UPDATE admin.superset_dashboard_configs
      SET
        uuid = COALESCE(@uuid, uuid),
        name = COALESCE(@name, name),
        description = @description,
        sort_order = COALESCE(@sort_order, sort_order),
        is_active = CASE WHEN @is_active IS NULL THEN is_active ELSE @is_active END,
        folder = COALESCE(@folder, folder),
        updated_at = SYSDATETIMEOFFSET()
      OUTPUT INSERTED.id, INSERTED.uuid, INSERTED.name, INSERTED.description, INSERTED.sort_order, INSERTED.is_active, INSERTED.folder
      WHERE id = @id
    `;
        const result = await executeQuery(query, {
            id,
            uuid: uuid ? String(uuid).trim() : null,
            name: name ? String(name).trim() : null,
            description: description !== undefined ? (description ? String(description).trim() : null) : null,
            sort_order: sort_order !== undefined ? sort_order : null,
            is_active: is_active !== undefined ? (is_active ? 1 : 0) : null,
            folder: folderValue,
        });
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        const updated = (result.data || [])[0];
        if (!updated) {
            return res.status(404).json({ error: 'Dashboard config not found' });
        }
        res.json({ success: true, dashboard: updated });
    }
    catch (error) {
        console.error('Error updating dashboard config:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * DELETE /api/superset-dashboard-config/:id
 * Delete a dashboard config (admin only)
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid ID' });
        }
        const query = `DELETE FROM admin.superset_dashboard_configs WHERE id = @id`;
        const result = await executeQuery(query, { id });
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({ success: true, message: 'Dashboard config deleted' });
    }
    catch (error) {
        console.error('Error deleting dashboard config:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=supersetDashboardConfig.js.map