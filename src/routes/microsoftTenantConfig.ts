/**
 * Microsoft Tenant Config Routes (Admin only)
 * CRUD for Azure AD tenant configurations
 */

import express from 'express';
import {
  getAllTenantConfigs,
  createTenantConfig,
  updateTenantConfig,
  deleteTenantConfig,
} from '../services/MicrosoftTenantService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /microsoft-tenant-config
 * List all tenant configs
 */
router.get('/', async (req, res) => {
  try {
    const configs = await getAllTenantConfigs();
    // Redact secrets for list view - only send masked value
    const safe = configs.map((c) => ({
      ...c,
      clientSecret: c.clientSecret ? '••••••••' : '',
    }));
    res.json(safe);
  } catch (error: any) {
    console.error('List tenant configs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /microsoft-tenant-config
 * Create tenant config
 */
router.post('/', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });

    const { domain, authorityTenant, clientId, clientSecret, displayName } = req.body;
    const result = await createTenantConfig({
      domain,
      authorityTenant: authorityTenant || null,
      clientId,
      clientSecret,
      displayName: displayName || null,
      createdBy: req.user.email,
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.status(201).json(result.config);
  } catch (error: any) {
    console.error('Create tenant config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /microsoft-tenant-config/:id
 * Update tenant config
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { domain, authorityTenant, clientId, clientSecret, displayName, isActive } = req.body;
    const updates: any = {};
    if (domain !== undefined) updates.domain = domain;
    if (authorityTenant !== undefined) updates.authorityTenant = authorityTenant;
    if (clientId !== undefined) updates.clientId = clientId;
    if (clientSecret !== undefined) updates.clientSecret = clientSecret;
    if (displayName !== undefined) updates.displayName = displayName;
    if (isActive !== undefined) updates.isActive = isActive;

    const result = await updateTenantConfig(id, updates);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result.config);
  } catch (error: any) {
    console.error('Update tenant config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /microsoft-tenant-config/:id
 * Delete tenant config
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const result = await deleteTenantConfig(id);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('Delete tenant config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
