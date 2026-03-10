/**
 * ManageBac School Configuration Routes
 * Admin-only routes for managing ManageBac API tokens per school
 * + Term Grade Rubric Config (admin.mb_term_grade_rubric_config)
 */

import { Router, Request, Response } from 'express';
import { executeQuery, getConnection, sql } from '../config/database.js';

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

// =============================================
// Term Grade Rubric Config (admin.mb_term_grade_rubric_config)
// =============================================

/**
 * GET /api/managebac-config/term-grade-rubric-config/schools
 * Get MB schools (from managebac_school_configs where school_id is set)
 */
router.get('/term-grade-rubric-config/schools', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT school_id, school_name
      FROM MB.managebac_school_configs
      WHERE school_id IS NOT NULL AND is_active = 1
      ORDER BY school_name
    `;
    const result = await executeQuery<{ school_id: number; school_name: string }>(query);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ success: true, data: result.data || [] });
  } catch (error: any) {
    console.error('Error fetching MB schools:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac-config/term-grade-rubric-config
 * List config by school_id, academic_year, grade_number
 */
router.get('/term-grade-rubric-config', async (req: Request, res: Response) => {
  try {
    const { school_id, academic_year, grade_number } = req.query;
    let query = `
      SELECT id, school_id, academic_year, grade_number, rubric_title, term_id, display_order, created_at, updated_at
      FROM admin.mb_term_grade_rubric_config
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};
    if (school_id != null && school_id !== '') {
      query += ` AND school_id = @school_id`;
      params.school_id = parseInt(String(school_id), 10);
    }
    if (academic_year != null && academic_year !== '') {
      query += ` AND academic_year = @academic_year`;
      params.academic_year = String(academic_year);
    }
    if (grade_number != null && grade_number !== '') {
      query += ` AND grade_number = @grade_number`;
      params.grade_number = parseInt(String(grade_number), 10);
    }
    query += ` ORDER BY grade_number, display_order, rubric_title`;
    const result = await executeQuery<any>(query, params);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ success: true, data: result.data || [] });
  } catch (error: any) {
    console.error('Error fetching term grade rubric config:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/managebac-config/term-grade-rubric-config
 * Bulk upsert config rows
 */
router.post('/term-grade-rubric-config', async (req: Request, res: Response) => {
  try {
    const { configs } = req.body;
    if (!Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: 'configs array is required' });
    }
    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();
    let successCount = 0;
    const errors: string[] = [];
    for (const c of configs) {
      const { id, school_id, academic_year, grade_number, rubric_title, term_id, display_order } = c;
      if (!school_id || academic_year == null || grade_number == null || !rubric_title || !term_id) {
        errors.push(`Missing required fields: ${JSON.stringify(c)}`);
        continue;
      }
      try {
        const request = transaction.request();
        request.input('school_id', sql.BigInt, school_id);
        request.input('academic_year', sql.NVarChar(200), String(academic_year));
        request.input('grade_number', sql.Int, parseInt(String(grade_number), 10));
        request.input('rubric_title', sql.NVarChar(500), rubric_title);
        request.input('term_id', sql.BigInt, term_id);
        request.input('display_order', sql.Int, display_order ?? 0);
        if (id) {
          request.input('id', sql.BigInt, id);
          await request.query(`
            UPDATE admin.mb_term_grade_rubric_config
            SET school_id=@school_id, academic_year=@academic_year, grade_number=@grade_number,
                rubric_title=@rubric_title, term_id=@term_id, display_order=@display_order, updated_at=SYSDATETIMEOFFSET()
            WHERE id=@id
          `);
        } else {
          await request.query(`
            MERGE admin.mb_term_grade_rubric_config AS target
            USING (SELECT @school_id AS school_id, @academic_year AS academic_year, @grade_number AS grade_number, @rubric_title AS rubric_title) AS source
            ON target.school_id = source.school_id AND target.academic_year = source.academic_year
               AND target.grade_number = source.grade_number AND target.rubric_title = source.rubric_title
            WHEN MATCHED THEN
              UPDATE SET term_id=@term_id, display_order=@display_order, updated_at=SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN
              INSERT (school_id, academic_year, grade_number, rubric_title, term_id, display_order)
              VALUES (@school_id, @academic_year, @grade_number, @rubric_title, @term_id, @display_order);
          `);
        }
        successCount++;
      } catch (err: any) {
        errors.push(`Error processing ${JSON.stringify(c)}: ${err.message}`);
      }
    }
    await transaction.commit();
    res.json({ success: true, successCount, errorCount: errors.length, errors: errors.length ? errors : undefined });
  } catch (error: any) {
    console.error('Error saving term grade rubric config:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/managebac-config/term-grade-rubric-config/:id
 */
router.delete('/term-grade-rubric-config/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const result = await executeQuery('DELETE FROM admin.mb_term_grade_rubric_config WHERE id = @id', { id });
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ success: true, message: 'Deleted' });
  } catch (error: any) {
    console.error('Error deleting term grade rubric config:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

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
        school_id,
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
        school_id,
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
