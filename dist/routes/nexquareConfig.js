/**
 * Nexquare School Configuration Routes
 * Admin-only routes for managing Nexquare API credentials per school
 */
import { Router } from 'express';
import { executeQuery } from '../config/database';
const router = Router();
/**
 * Helper function to mask sensitive data
 */
const maskSecret = (secret) => {
    return '••••••••••••••••••••';
};
/**
 * Helper function to mask client_secret in config objects
 */
const maskConfig = (config) => {
    if (!config)
        return config;
    return {
        ...config,
        client_secret: maskSecret(config.client_secret || '')
    };
};
/**
 * GET /api/nexquare-config
 * Get all Nexquare school configurations
 * Note: client_secret is always masked for security
 */
router.get('/', async (req, res) => {
    try {
        const query = `
      SELECT 
        id,
        country,
        school_name,
        client_id,
        client_secret,
        domain_url,
        is_active,
        created_at,
        updated_at,
        created_by,
        updated_by,
        notes
      FROM NEX.nexquare_school_configs
      ORDER BY country, school_name
    `;
        const result = await executeQuery(query);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        // Mask all secrets before sending to client
        const maskedConfigs = (result.data || []).map(maskConfig);
        res.json({
            success: true,
            count: maskedConfigs.length,
            configs: maskedConfigs
        });
    }
    catch (error) {
        console.error('Error fetching Nexquare configs:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare-config/:id
 * Get a specific Nexquare school configuration
 * Note: client_secret is always masked for security
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid configuration ID' });
        }
        const query = `
      SELECT 
        id,
        country,
        school_name,
        client_id,
        client_secret,
        domain_url,
        is_active,
        created_at,
        updated_at,
        created_by,
        updated_by,
        notes
      FROM NEX.nexquare_school_configs
      WHERE id = @id
    `;
        const result = await executeQuery(query, { id });
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        // Mask secret before sending to client
        const maskedConfig = maskConfig(result.data[0]);
        res.json({
            success: true,
            config: maskedConfig
        });
    }
    catch (error) {
        console.error('Error fetching Nexquare config:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * POST /api/nexquare-config
 * Create a new Nexquare school configuration
 */
router.post('/', async (req, res) => {
    try {
        const { country, school_name, client_id, client_secret, domain_url, notes, created_by } = req.body;
        // Validation
        if (!country || !school_name || !client_id || !client_secret || !domain_url) {
            return res.status(400).json({
                error: 'Missing required fields: country, school_name, client_id, client_secret, domain_url'
            });
        }
        const query = `
      INSERT INTO NEX.nexquare_school_configs 
        (country, school_name, client_id, client_secret, domain_url, notes, created_by, is_active)
      OUTPUT INSERTED.*
      VALUES 
        (@country, @school_name, @client_id, @client_secret, @domain_url, @notes, @created_by, 1)
    `;
        const result = await executeQuery(query, {
            country,
            school_name,
            client_id,
            client_secret,
            domain_url,
            notes: notes || null,
            created_by: created_by || null
        });
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        if (!result.data || result.data.length === 0) {
            return res.status(500).json({ error: 'Failed to create configuration' });
        }
        // Mask secret before sending to client
        const maskedConfig = maskConfig(result.data[0]);
        res.status(201).json({
            success: true,
            config: maskedConfig,
            message: 'Configuration created successfully'
        });
    }
    catch (error) {
        console.error('Error creating Nexquare config:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * PUT /api/nexquare-config/:id
 * Update an existing Nexquare school configuration
 * Note: client_secret is optional - if not provided or masked, existing value is preserved
 */
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid configuration ID' });
        }
        const { country, school_name, client_id, client_secret, domain_url, is_active, notes, updated_by } = req.body;
        // Validation (client_secret is optional for updates)
        if (!country || !school_name || !client_id || !domain_url) {
            return res.status(400).json({
                error: 'Missing required fields: country, school_name, client_id, domain_url'
            });
        }
        // Check if client_secret is provided and not masked
        const isSecretMasked = !client_secret || client_secret === '••••••••••••••••••••' || client_secret.trim() === '';
        // Build dynamic query based on whether secret is being updated
        let query;
        let params;
        if (isSecretMasked) {
            // Don't update client_secret - preserve existing value
            query = `
        UPDATE NEX.nexquare_school_configs
        SET 
          country = @country,
          school_name = @school_name,
          client_id = @client_id,
          domain_url = @domain_url,
          is_active = @is_active,
          notes = @notes,
          updated_by = @updated_by,
          updated_at = SYSDATETIMEOFFSET()
        OUTPUT INSERTED.*
        WHERE id = @id
      `;
            params = {
                id,
                country,
                school_name,
                client_id,
                domain_url,
                is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
                notes: notes || null,
                updated_by: updated_by || null
            };
        }
        else {
            // Update client_secret with new value
            query = `
        UPDATE NEX.nexquare_school_configs
        SET 
          country = @country,
          school_name = @school_name,
          client_id = @client_id,
          client_secret = @client_secret,
          domain_url = @domain_url,
          is_active = @is_active,
          notes = @notes,
          updated_by = @updated_by,
          updated_at = SYSDATETIMEOFFSET()
        OUTPUT INSERTED.*
        WHERE id = @id
      `;
            params = {
                id,
                country,
                school_name,
                client_id,
                client_secret,
                domain_url,
                is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
                notes: notes || null,
                updated_by: updated_by || null
            };
        }
        const result = await executeQuery(query, params);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        // Mask secret before sending to client
        const maskedConfig = maskConfig(result.data[0]);
        res.json({
            success: true,
            config: maskedConfig,
            message: 'Configuration updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating Nexquare config:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * DELETE /api/nexquare-config/:id
 * Delete a Nexquare school configuration
 */
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid configuration ID' });
        }
        const query = `
      DELETE FROM NEX.nexquare_school_configs
      OUTPUT DELETED.id
      WHERE id = @id
    `;
        const result = await executeQuery(query, { id });
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        res.json({
            success: true,
            message: 'Configuration deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting Nexquare config:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare-config/domain-url
 * Get the shared domain URL (returns the first active config's domain_url)
 */
router.get('/domain-url', async (req, res) => {
    try {
        const query = `
      SELECT TOP 1 domain_url
      FROM NEX.nexquare_school_configs
      WHERE is_active = 1
      ORDER BY updated_at DESC
    `;
        const result = await executeQuery(query);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ error: 'No active configuration found' });
        }
        res.json({
            success: true,
            domain_url: result.data[0].domain_url
        });
    }
    catch (error) {
        console.error('Error fetching domain URL:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
export default router;
//# sourceMappingURL=nexquareConfig.js.map