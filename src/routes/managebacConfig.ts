/**
 * ManageBac School Configuration Routes
 * Admin-only routes for managing ManageBac API tokens per school
 */

import { Router, Request, Response } from 'express';
import { executeQuery } from '../config/database';

const router = Router();

/**
 * Helper function to mask sensitive data
 */
const maskToken = (token: string): string => {
  return '••••••••••••••••••••';
};

/**
 * Helper function to mask api_token in config objects
 */
const maskConfig = (config: any): any => {
  if (!config) return config;
  return {
    ...config,
    api_token: maskToken(config.api_token || '')
  };
};

/**
 * GET /api/managebac-config
 * Get all ManageBac school configurations
 * Note: api_token is always masked for security
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        id,
        country,
        school_name,
        api_token,
        base_url,
        is_active,
        created_at,
        updated_at,
        created_by,
        updated_by,
        notes
      FROM MB.managebac_school_configs
      ORDER BY country, school_name
    `;

    const result = await executeQuery<any>(query);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    // Mask all tokens before sending to client
    const maskedConfigs = (result.data || []).map(maskConfig);

    res.json({
      success: true,
      count: maskedConfigs.length,
      configs: maskedConfigs
    });
  } catch (error: any) {
    console.error('Error fetching ManageBac configs:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * GET /api/managebac-config/:id
 * Get a specific ManageBac school configuration
 * Note: api_token is always masked for security
 */
router.get('/:id', async (req: Request, res: Response) => {
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
        api_token,
        base_url,
        is_active,
        created_at,
        updated_at,
        created_by,
        updated_by,
        notes
      FROM MB.managebac_school_configs
      WHERE id = @id
    `;

    const result = await executeQuery<any>(query, { id });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    // Mask token before sending to client
    const maskedConfig = maskConfig(result.data[0]);

    res.json({
      success: true,
      config: maskedConfig
    });
  } catch (error: any) {
    console.error('Error fetching ManageBac config:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * POST /api/managebac-config
 * Create a new ManageBac school configuration
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { country, school_name, api_token, base_url, notes, created_by } = req.body;

    // Validation
    if (!country || !school_name || !api_token || !base_url) {
      return res.status(400).json({ 
        error: 'Missing required fields: country, school_name, api_token, base_url' 
      });
    }

    const query = `
      INSERT INTO MB.managebac_school_configs 
        (country, school_name, api_token, base_url, notes, created_by, is_active)
      OUTPUT INSERTED.*
      VALUES 
        (@country, @school_name, @api_token, @base_url, @notes, @created_by, 1)
    `;

    const result = await executeQuery<any>(query, {
      country,
      school_name,
      api_token,
      base_url,
      notes: notes || null,
      created_by: created_by || null
    });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    if (!result.data || result.data.length === 0) {
      return res.status(500).json({ error: 'Failed to create configuration' });
    }

    // Mask token before sending to client
    const maskedConfig = maskConfig(result.data[0]);

    res.status(201).json({
      success: true,
      config: maskedConfig,
      message: 'Configuration created successfully'
    });
  } catch (error: any) {
    console.error('Error creating ManageBac config:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * PUT /api/managebac-config/:id
 * Update an existing ManageBac school configuration
 * Note: api_token is optional - if not provided or masked, existing value is preserved
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid configuration ID' });
    }

    const { country, school_name, api_token, base_url, is_active, notes, updated_by } = req.body;

    // Validation (api_token and base_url are optional for updates)
    if (!country || !school_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: country, school_name' 
      });
    }

    // Check if api_token is provided and not masked
    const isTokenMasked = !api_token || api_token === '••••••••••••••••••••' || api_token.trim() === '';
    
    // Build dynamic query based on whether token is being updated
    let query: string;
    let params: Record<string, any>;

    if (isTokenMasked) {
      // Don't update api_token - preserve existing value
      // base_url is always updated if provided
      query = `
        UPDATE MB.managebac_school_configs
        SET 
          country = @country,
          school_name = @school_name,
          base_url = @base_url,
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
        base_url: base_url || 'https://api.managebac.com',
        is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
        notes: notes || null,
        updated_by: updated_by || null
      };
    } else {
      // Update api_token with new value
      query = `
        UPDATE MB.managebac_school_configs
        SET 
          country = @country,
          school_name = @school_name,
          api_token = @api_token,
          base_url = @base_url,
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
        api_token,
        base_url: base_url || 'https://api.managebac.com',
        is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
        notes: notes || null,
        updated_by: updated_by || null
      };
    }

    const result = await executeQuery<any>(query, params);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    // Mask token before sending to client
    const maskedConfig = maskConfig(result.data[0]);

    res.json({
      success: true,
      config: maskedConfig,
      message: 'Configuration updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating ManageBac config:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

/**
 * DELETE /api/managebac-config/:id
 * Delete a ManageBac school configuration
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid configuration ID' });
    }

    const query = `
      DELETE FROM MB.managebac_school_configs
      OUTPUT DELETED.id
      WHERE id = @id
    `;

    const result = await executeQuery<any>(query, { id });

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
  } catch (error: any) {
    console.error('Error deleting ManageBac config:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

export default router;
