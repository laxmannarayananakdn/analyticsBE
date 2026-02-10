/**
 * RP Configuration Routes
 * Routes for managing RP.subject_mapping and RP.assessment_component_config tables
 */
import { Router } from 'express';
import { executeQuery, getConnection, sql } from '../config/database';
const router = Router();
// =============================================
// SUBJECT MAPPING ROUTES
// =============================================
/**
 * GET /api/rp-config/subject-mapping
 * Get subject mappings filtered by school_id and academic_year
 */
router.get('/subject-mapping', async (req, res) => {
    try {
        const { school_id, academic_year } = req.query;
        let query = `
      SELECT 
        id,
        school_id,
        academic_year,
        grade,
        subject,
        reported_subject,
        created_at,
        updated_at
      FROM RP.subject_mapping
      WHERE 1=1
    `;
        const params = {};
        if (school_id) {
            query += ` AND school_id = @school_id`;
            params.school_id = school_id;
        }
        if (academic_year) {
            query += ` AND academic_year = @academic_year`;
            params.academic_year = academic_year;
        }
        query += ` ORDER BY grade, subject`;
        const result = await executeQuery(query, params);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            count: result.data?.length || 0,
            data: result.data || []
        });
    }
    catch (error) {
        console.error('Error fetching subject mappings:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * POST /api/rp-config/subject-mapping
 * Create or update subject mappings (bulk)
 */
router.post('/subject-mapping', async (req, res) => {
    try {
        const { mappings } = req.body;
        if (!Array.isArray(mappings) || mappings.length === 0) {
            return res.status(400).json({ error: 'mappings array is required' });
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            for (const mapping of mappings) {
                const { id, school_id, academic_year, grade, subject, reported_subject } = mapping;
                if (!school_id || !academic_year || !grade || !subject) {
                    errorCount++;
                    errors.push(`Missing required fields for mapping: ${JSON.stringify(mapping)}`);
                    continue;
                }
                try {
                    if (id) {
                        // Update existing
                        const updateQuery = `
              UPDATE RP.subject_mapping
              SET 
                school_id = @school_id,
                academic_year = @academic_year,
                grade = @grade,
                subject = @subject,
                reported_subject = @reported_subject,
                updated_at = SYSDATETIMEOFFSET()
              WHERE id = @id
            `;
                        const request = transaction.request();
                        request.input('id', sql.BigInt, id);
                        request.input('school_id', sql.NVarChar(200), school_id);
                        request.input('academic_year', sql.NVarChar(200), academic_year);
                        request.input('grade', sql.NVarChar(200), grade);
                        request.input('subject', sql.NVarChar(1000), subject);
                        request.input('reported_subject', sql.NVarChar(1000), reported_subject || null);
                        await request.query(updateQuery);
                        successCount++;
                    }
                    else {
                        // Insert new (using MERGE to handle duplicates)
                        const mergeQuery = `
              MERGE RP.subject_mapping AS target
              USING (SELECT 
                @school_id AS school_id,
                @academic_year AS academic_year,
                @grade AS grade,
                @subject AS subject
              ) AS source
              ON target.school_id = source.school_id
                AND target.academic_year = source.academic_year
                AND target.grade = source.grade
                AND target.subject = source.subject
              WHEN MATCHED THEN
                UPDATE SET
                  reported_subject = @reported_subject,
                  updated_at = SYSDATETIMEOFFSET()
              WHEN NOT MATCHED THEN
                INSERT (school_id, academic_year, grade, subject, reported_subject, created_at, updated_at)
                VALUES (@school_id, @academic_year, @grade, @subject, @reported_subject, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
            `;
                        const request = transaction.request();
                        request.input('school_id', sql.NVarChar(200), school_id);
                        request.input('academic_year', sql.NVarChar(200), academic_year);
                        request.input('grade', sql.NVarChar(200), grade);
                        request.input('subject', sql.NVarChar(1000), subject);
                        request.input('reported_subject', sql.NVarChar(1000), reported_subject || null);
                        await request.query(mergeQuery);
                        successCount++;
                    }
                }
                catch (err) {
                    errorCount++;
                    errors.push(`Error processing mapping ${JSON.stringify(mapping)}: ${err.message}`);
                }
            }
            await transaction.commit();
            res.json({
                success: true,
                message: `Processed ${successCount} mapping(s) successfully${errorCount > 0 ? `, ${errorCount} error(s)` : ''}`,
                successCount,
                errorCount,
                errors: errors.length > 0 ? errors : undefined
            });
        }
        catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
    catch (error) {
        console.error('Error saving subject mappings:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * DELETE /api/rp-config/subject-mapping/:id
 * Delete a subject mapping
 */
router.delete('/subject-mapping/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid mapping ID' });
        }
        const query = `DELETE FROM RP.subject_mapping WHERE id = @id`;
        const result = await executeQuery(query, { id });
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            message: 'Subject mapping deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting subject mapping:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
// =============================================
// ASSESSMENT COMPONENT CONFIG ROUTES
// =============================================
/**
 * GET /api/rp-config/assessment-component-config
 * Get assessment component configs filtered by school_id
 */
router.get('/assessment-component-config', async (req, res) => {
    try {
        const { school_id } = req.query;
        let query = `
      SELECT 
        id,
        school_id,
        component_name,
        is_active,
        created_at,
        updated_at
      FROM RP.assessment_component_config
      WHERE 1=1
    `;
        const params = {};
        if (school_id) {
            query += ` AND school_id = @school_id`;
            params.school_id = school_id;
        }
        query += ` ORDER BY component_name`;
        const result = await executeQuery(query, params);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            count: result.data?.length || 0,
            data: result.data || []
        });
    }
    catch (error) {
        console.error('Error fetching assessment component configs:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * POST /api/rp-config/assessment-component-config
 * Create or update assessment component configs (bulk)
 */
router.post('/assessment-component-config', async (req, res) => {
    try {
        const { configs } = req.body;
        if (!Array.isArray(configs) || configs.length === 0) {
            return res.status(400).json({ error: 'configs array is required' });
        }
        const connection = await getConnection();
        const transaction = new sql.Transaction(connection);
        try {
            await transaction.begin();
            let successCount = 0;
            let errorCount = 0;
            const errors = [];
            for (const config of configs) {
                const { id, school_id, component_name, is_active } = config;
                if (!school_id || !component_name) {
                    errorCount++;
                    errors.push(`Missing required fields for config: ${JSON.stringify(config)}`);
                    continue;
                }
                try {
                    if (id) {
                        // Update existing
                        const updateQuery = `
              UPDATE RP.assessment_component_config
              SET 
                school_id = @school_id,
                component_name = @component_name,
                is_active = @is_active,
                updated_at = SYSDATETIMEOFFSET()
              WHERE id = @id
            `;
                        const request = transaction.request();
                        request.input('id', sql.Int, id);
                        request.input('school_id', sql.NVarChar(200), school_id);
                        request.input('component_name', sql.NVarChar(1000), component_name);
                        request.input('is_active', sql.Bit, is_active !== undefined ? is_active : true);
                        await request.query(updateQuery);
                        successCount++;
                    }
                    else {
                        // Insert new (using MERGE to handle duplicates)
                        const mergeQuery = `
              MERGE RP.assessment_component_config AS target
              USING (SELECT 
                @school_id AS school_id,
                @component_name AS component_name
              ) AS source
              ON target.school_id = source.school_id
                AND target.component_name = source.component_name
              WHEN MATCHED THEN
                UPDATE SET
                  is_active = @is_active,
                  updated_at = SYSDATETIMEOFFSET()
              WHEN NOT MATCHED THEN
                INSERT (school_id, component_name, is_active, created_at, updated_at)
                VALUES (@school_id, @component_name, @is_active, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
            `;
                        const request = transaction.request();
                        request.input('school_id', sql.NVarChar(200), school_id);
                        request.input('component_name', sql.NVarChar(1000), component_name);
                        request.input('is_active', sql.Bit, is_active !== undefined ? is_active : true);
                        await request.query(mergeQuery);
                        successCount++;
                    }
                }
                catch (err) {
                    errorCount++;
                    errors.push(`Error processing config ${JSON.stringify(config)}: ${err.message}`);
                }
            }
            await transaction.commit();
            res.json({
                success: true,
                message: `Processed ${successCount} config(s) successfully${errorCount > 0 ? `, ${errorCount} error(s)` : ''}`,
                successCount,
                errorCount,
                errors: errors.length > 0 ? errors : undefined
            });
        }
        catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
    catch (error) {
        console.error('Error saving assessment component configs:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * DELETE /api/rp-config/assessment-component-config/:id
 * Delete an assessment component config
 */
router.delete('/assessment-component-config/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid config ID' });
        }
        const query = `DELETE FROM RP.assessment_component_config WHERE id = @id`;
        const result = await executeQuery(query, { id });
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            message: 'Assessment component config deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting assessment component config:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
// =============================================
// HELPER ROUTES
// =============================================
/**
 * GET /api/rp-config/schools
 * Get list of schools for dropdown
 */
router.get('/schools', async (req, res) => {
    try {
        const query = `
      SELECT DISTINCT 
        school_id,
        MAX(school_name) AS school_name
      FROM RP.student_assessments
      WHERE school_id IS NOT NULL
      GROUP BY school_id
      ORDER BY school_name
    `;
        const result = await executeQuery(query);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            data: result.data || []
        });
    }
    catch (error) {
        console.error('Error fetching schools:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/rp-config/academic-years
 * Get list of academic years for dropdown
 */
router.get('/academic-years', async (req, res) => {
    try {
        const query = `
      SELECT DISTINCT academic_year
      FROM RP.student_assessments
      WHERE academic_year IS NOT NULL
      ORDER BY academic_year DESC
    `;
        const result = await executeQuery(query);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json({
            success: true,
            data: result.data?.map((row) => row.academic_year) || []
        });
    }
    catch (error) {
        console.error('Error fetching academic years:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
export default router;
//# sourceMappingURL=rpConfig.js.map