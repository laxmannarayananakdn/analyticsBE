/**
 * Nexquare School Configuration Routes
 * Admin-only routes for managing Nexquare API credentials per school
 */
import { Router } from 'express';
import { executeQuery } from '../config/database.js';
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
 * GET /api/curricula
 * Get all available curricula
 */
router.get('/curricula', async (req, res) => {
    try {
        const query = `
      SELECT 
        id,
        code,
        description,
        is_active
      FROM RP.curricula
      WHERE is_active = 1
      ORDER BY code
    `;
        const result = await executeQuery(query);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            curricula: result.data || []
        });
    }
    catch (error) {
        console.error('Error fetching curricula:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
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
        school_id,
        client_id,
        client_secret,
        domain_url,
        curriculum_id,
        curriculum_code,
        curriculum_description,
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
        school_id,
        client_id,
        client_secret,
        domain_url,
        curriculum_id,
        curriculum_code,
        curriculum_description,
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
        const { country, school_name, client_id, client_secret, domain_url, curriculum_id, notes, created_by } = req.body;
        // Validation
        if (!country || !school_name || !client_id || !client_secret || !domain_url) {
            return res.status(400).json({
                error: 'Missing required fields: country, school_name, client_id, client_secret, domain_url'
            });
        }
        // If curriculum_id is provided, fetch curriculum details to populate code and description
        let curriculumCode = null;
        let curriculumDescription = null;
        if (curriculum_id) {
            const curriculumQuery = `
        SELECT code, description
        FROM RP.curricula
        WHERE id = @curriculum_id
      `;
            const curriculumResult = await executeQuery(curriculumQuery, { curriculum_id });
            if (curriculumResult.data && curriculumResult.data.length > 0) {
                curriculumCode = curriculumResult.data[0].code;
                curriculumDescription = curriculumResult.data[0].description;
            }
        }
        const insertQuery = `
      DECLARE @InsertedTable TABLE (
        id BIGINT,
        country NVARCHAR(100),
        school_name NVARCHAR(500),
        client_id NVARCHAR(500),
        client_secret NVARCHAR(500),
        domain_url NVARCHAR(500),
        curriculum_id INT,
        curriculum_code NVARCHAR(50),
        curriculum_description NVARCHAR(500),
        is_active BIT,
        created_at DATETIMEOFFSET,
        updated_at DATETIMEOFFSET,
        created_by NVARCHAR(255),
        updated_by NVARCHAR(255),
        notes NVARCHAR(MAX)
      );

      INSERT INTO NEX.nexquare_school_configs 
        (country, school_name, client_id, client_secret, domain_url, curriculum_id, curriculum_code, curriculum_description, notes, created_by, is_active)
      OUTPUT INSERTED.id, INSERTED.country, INSERTED.school_name, INSERTED.client_id, INSERTED.client_secret, 
             INSERTED.domain_url, INSERTED.curriculum_id, INSERTED.curriculum_code, INSERTED.curriculum_description,
             INSERTED.is_active, INSERTED.created_at, INSERTED.updated_at, INSERTED.created_by, INSERTED.updated_by, INSERTED.notes
      INTO @InsertedTable
      VALUES 
        (@country, @school_name, @client_id, @client_secret, @domain_url, @curriculum_id, @curriculum_code, @curriculum_description, @notes, @created_by, 1);

      SELECT * FROM @InsertedTable;
    `;
        const insertResult = await executeQuery(insertQuery, {
            country,
            school_name,
            client_id,
            client_secret,
            domain_url,
            curriculum_id: curriculum_id || null,
            curriculum_code: curriculumCode,
            curriculum_description: curriculumDescription,
            notes: notes || null,
            created_by: created_by || null
        });
        if (insertResult.error) {
            return res.status(500).json({ error: insertResult.error });
        }
        if (!insertResult.data || insertResult.data.length === 0) {
            return res.status(500).json({ error: 'Failed to create configuration' });
        }
        const newId = insertResult.data[0].id;
        // Fetch the newly created record (trigger will have updated curriculum fields)
        // Note: The OUTPUT clause returns data before trigger execution, so we need to fetch again
        const selectQuery = `
      SELECT 
        id,
        country,
        school_name,
        client_id,
        client_secret,
        domain_url,
        curriculum_id,
        curriculum_code,
        curriculum_description,
        is_active,
        created_at,
        updated_at,
        created_by,
        updated_by,
        notes
      FROM NEX.nexquare_school_configs
      WHERE id = @id
    `;
        const selectResult = await executeQuery(selectQuery, { id: newId });
        if (selectResult.error || !selectResult.data || selectResult.data.length === 0) {
            return res.status(500).json({ error: 'Failed to retrieve created configuration' });
        }
        // The result contains curriculum_code and curriculum_description updated by the trigger
        const configWithCurriculum = selectResult.data[0];
        // Mask secret before sending to client
        const maskedConfig = maskConfig(configWithCurriculum);
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
        const { country, school_name, client_id, client_secret, domain_url, curriculum_id, is_active, notes, updated_by } = req.body;
        // Validation (client_secret is optional for updates)
        if (!country || !school_name || !client_id || !domain_url) {
            return res.status(400).json({
                error: 'Missing required fields: country, school_name, client_id, domain_url'
            });
        }
        // Check if client_secret is provided and not masked
        const isSecretMasked = !client_secret || client_secret === '••••••••••••••••••••' || client_secret.trim() === '';
        // If curriculum_id is provided, fetch curriculum details to populate code and description
        let curriculumCode = null;
        let curriculumDescription = null;
        if (curriculum_id) {
            const curriculumQuery = `
        SELECT code, description
        FROM RP.curricula
        WHERE id = @curriculum_id
      `;
            const curriculumResult = await executeQuery(curriculumQuery, { curriculum_id });
            if (curriculumResult.data && curriculumResult.data.length > 0) {
                curriculumCode = curriculumResult.data[0].code;
                curriculumDescription = curriculumResult.data[0].description;
            }
        }
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
          curriculum_id = @curriculum_id,
          curriculum_code = @curriculum_code,
          curriculum_description = @curriculum_description,
          is_active = @is_active,
          notes = @notes,
          updated_by = @updated_by,
          updated_at = SYSDATETIMEOFFSET()
        WHERE id = @id
      `;
            params = {
                id,
                country,
                school_name,
                client_id,
                domain_url,
                curriculum_id: curriculum_id || null,
                curriculum_code: curriculumCode,
                curriculum_description: curriculumDescription,
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
          curriculum_id = @curriculum_id,
          curriculum_code = @curriculum_code,
          curriculum_description = @curriculum_description,
          is_active = @is_active,
          notes = @notes,
          updated_by = @updated_by,
          updated_at = SYSDATETIMEOFFSET()
        WHERE id = @id
      `;
            params = {
                id,
                country,
                school_name,
                client_id,
                client_secret,
                domain_url,
                curriculum_id: curriculum_id || null,
                curriculum_code: curriculumCode,
                curriculum_description: curriculumDescription,
                is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
                notes: notes || null,
                updated_by: updated_by || null
            };
        }
        const updateResult = await executeQuery(query, params);
        if (updateResult.error) {
            return res.status(500).json({ error: updateResult.error });
        }
        // Fetch the updated record (trigger will have updated curriculum fields)
        const selectQuery = `
      SELECT 
        id,
        country,
        school_name,
        client_id,
        client_secret,
        domain_url,
        curriculum_id,
        curriculum_code,
        curriculum_description,
        is_active,
        created_at,
        updated_at,
        created_by,
        updated_by,
        notes
      FROM NEX.nexquare_school_configs
      WHERE id = @id
    `;
        const selectResult = await executeQuery(selectQuery, { id });
        if (selectResult.error) {
            return res.status(500).json({ error: selectResult.error });
        }
        if (!selectResult.data || selectResult.data.length === 0) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        // The result contains curriculum_code and curriculum_description updated by the trigger
        const configWithCurriculum = selectResult.data[0];
        // Mask secret before sending to client
        const maskedConfig = maskConfig(configWithCurriculum);
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
        // First check if the record exists
        const checkQuery = `
      SELECT id
      FROM NEX.nexquare_school_configs
      WHERE id = @id
    `;
        const checkResult = await executeQuery(checkQuery, { id });
        if (checkResult.error) {
            return res.status(500).json({ error: checkResult.error });
        }
        if (!checkResult.data || checkResult.data.length === 0) {
            return res.status(404).json({ error: 'Configuration not found' });
        }
        // Delete the record
        const deleteQuery = `
      DELETE FROM NEX.nexquare_school_configs
      WHERE id = @id
    `;
        const deleteResult = await executeQuery(deleteQuery, { id });
        if (deleteResult.error) {
            return res.status(500).json({ error: deleteResult.error });
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