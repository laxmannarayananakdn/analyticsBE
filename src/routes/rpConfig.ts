/**
 * RP Configuration Routes
 * Routes for managing admin.subject_mapping, admin.assessment_component_config, admin.component_filter_config, admin.term_filter_config
 */

import { Router, Request, Response } from 'express';
import { executeQuery, getConnection, sql } from '../config/database.js';

const router = Router();

// =============================================
// SUBJECT MAPPING ROUTES
// =============================================

/**
 * GET /api/rp-config/subject-mapping
 * Get subject mappings filtered by school_id, academic_year, grade
 */
router.get('/subject-mapping', async (req: Request, res: Response) => {
  try {
    const { school_id, academic_year, grade } = req.query;

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
      FROM admin.subject_mapping
      WHERE 1=1
    `;
    const params: any = {};

    if (school_id) {
      query += ` AND school_id = @school_id`;
      params.school_id = school_id;
    }

    if (academic_year) {
      query += ` AND academic_year = @academic_year`;
      params.academic_year = academic_year;
    }

    if (grade) {
      query += ` AND grade = @grade`;
      params.grade = grade;
    }

    query += ` ORDER BY grade, subject`;

    const result = await executeQuery<any>(query, params);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      count: result.data?.length || 0,
      data: result.data || []
    });
  } catch (error: any) {
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
router.post('/subject-mapping', async (req: Request, res: Response) => {
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
      const errors: string[] = [];

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
              UPDATE admin.subject_mapping
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
          } else {
            // Insert new (using MERGE to handle duplicates)
            const mergeQuery = `
              MERGE admin.subject_mapping AS target
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
        } catch (err: any) {
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
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
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
router.delete('/subject-mapping/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid mapping ID' });
    }

    const query = `DELETE FROM admin.subject_mapping WHERE id = @id`;
    const result = await executeQuery<any>(query, { id });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      message: 'Subject mapping deleted successfully'
    });
  } catch (error: any) {
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
router.get('/assessment-component-config', async (req: Request, res: Response) => {
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
      FROM admin.assessment_component_config
      WHERE 1=1
    `;
    const params: any = {};

    if (school_id) {
      query += ` AND school_id = @school_id`;
      params.school_id = school_id;
    }

    query += ` ORDER BY component_name`;

    const result = await executeQuery<any>(query, params);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      count: result.data?.length || 0,
      data: result.data || []
    });
  } catch (error: any) {
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
router.post('/assessment-component-config', async (req: Request, res: Response) => {
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
      const errors: string[] = [];

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
              UPDATE admin.assessment_component_config
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
          } else {
            // Insert new (using MERGE to handle duplicates)
            const mergeQuery = `
              MERGE admin.assessment_component_config AS target
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
        } catch (err: any) {
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
    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
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
router.delete('/assessment-component-config/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid config ID' });
    }

    const query = `DELETE FROM admin.assessment_component_config WHERE id = @id`;
    const result = await executeQuery<any>(query, { id });

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      message: 'Assessment component config deleted successfully'
    });
  } catch (error: any) {
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
 * Get list of schools for dropdown (from NEX.schools - populated by Get Schools / Student Allocations)
 */
router.get('/schools', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        sourced_id AS school_id,
        name AS school_name
      FROM NEX.schools
      ORDER BY name
    `;

    const result = await executeQuery<any>(query);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data || []
    });
  } catch (error: any) {
    console.error('Error fetching schools:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/rp-config/academic-years
 * Get academic years from RP Config tables only (subject_mapping).
 * Optional: school_id - filter years for that school.
 */
router.get('/academic-years', async (req: Request, res: Response) => {
  try {
    const { school_id } = req.query;

    const params: any = {};
    const schoolFilter = school_id && typeof school_id === 'string' ? ' AND school_id = @school_id' : '';
    if (school_id && typeof school_id === 'string') {
      params.school_id = school_id;
    }

    const query = `
      SELECT DISTINCT academic_year
      FROM admin.subject_mapping
      WHERE academic_year IS NOT NULL AND LTRIM(RTRIM(academic_year)) != ''
      ${schoolFilter}
      ORDER BY academic_year DESC
    `;

    const result = await executeQuery<any>(query, params);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data?.map((row: any) => row.academic_year) || []
    });
  } catch (error: any) {
    console.error('Error fetching academic years:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/rp-config/grades
 * Get grades from admin.subject_mapping for school + academic year.
 */
router.get('/grades', async (req: Request, res: Response) => {
  try {
    const { school_id, academic_year } = req.query;

    if (!school_id || typeof school_id !== 'string') {
      return res.status(400).json({ error: 'school_id is required' });
    }

    const params: any = { school_id };
    let academicFilter = '';
    if (academic_year && typeof academic_year === 'string') {
      academicFilter = ' AND academic_year = @academic_year';
      params.academic_year = academic_year;
    }

    const query = `
      SELECT DISTINCT grade
      FROM admin.subject_mapping
      WHERE school_id = @school_id
        AND grade IS NOT NULL AND LTRIM(RTRIM(grade)) != ''
        ${academicFilter}
      ORDER BY grade
    `;

    const result = await executeQuery<any>(query, params);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data?.map((row: any) => row.grade) || []
    });
  } catch (error: any) {
    console.error('Error fetching grades:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/rp-config/subjects
 * Get subject names for dropdown. From admin.subject_mapping + NEX.student_assessments (assessment file).
 */
router.get('/subjects', async (req: Request, res: Response) => {
  try {
    const { school_id, academic_year, grade } = req.query;

    if (!school_id || typeof school_id !== 'string') {
      return res.status(400).json({ error: 'school_id is required' });
    }

    const params: any = { school_id };
    let ayFilter = '';
    let gradeFilter = '';
    let fromAssessments = '';

    if (academic_year && typeof academic_year === 'string') {
      ayFilter = ' AND academic_year = @academic_year';
      params.academic_year = academic_year;
    }
    if (grade && typeof grade === 'string') {
      gradeFilter = ' AND grade = @grade';
      params.grade = grade;
    }
    if (academic_year && typeof academic_year === 'string') {
      fromAssessments = `
        UNION
        SELECT DISTINCT subject_name AS subject
        FROM NEX.student_assessments
        WHERE school_id = @school_id AND academic_year = @academic_year
          AND subject_name IS NOT NULL AND LTRIM(RTRIM(ISNULL(subject_name, ''))) != ''
      `;
    }

    const query = `
      SELECT DISTINCT subject FROM (
        SELECT subject FROM admin.subject_mapping
        WHERE school_id = @school_id
          AND subject IS NOT NULL AND LTRIM(RTRIM(ISNULL(subject, ''))) != ''
          ${ayFilter}
          ${gradeFilter}
        ${fromAssessments}
      ) AS combined
      ORDER BY subject
    `;

    const result = await executeQuery<any>(query, params);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      data: result.data?.map((row: any) => row.subject) || []
    });
  } catch (error: any) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

// =============================================
// COMPONENT FILTER CONFIG ROUTES
// =============================================

/**
 * GET /api/rp-config/component-filters
 */
router.get('/component-filters', async (req: Request, res: Response) => {
  try {
    const { school_id } = req.query;
    if (!school_id || typeof school_id !== 'string') {
      return res.status(400).json({ error: 'school_id is required' });
    }

    const query = `
      SELECT id, school_id, filter_type, pattern, display_order, created_at, updated_at
      FROM admin.component_filter_config
      WHERE school_id = @school_id
      ORDER BY display_order, filter_type, id
    `;
    const result = await executeQuery<any>(query, { school_id });
    if (result.error) return res.status(500).json({ error: result.error });

    res.json({ success: true, data: result.data || [] });
  } catch (error: any) {
    console.error('Error fetching component filters:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/rp-config/component-filters
 */
router.post('/component-filters', async (req: Request, res: Response) => {
  try {
    const { filters } = req.body;
    if (!Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({ error: 'filters array is required' });
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const f of filters) {
      const { id, school_id, filter_type, pattern } = f;
      if (!school_id || !filter_type || !pattern) {
        errorCount++;
        errors.push(`Missing required fields: ${JSON.stringify(f)}`);
        continue;
      }
      if (!['include', 'exclude'].includes(filter_type)) {
        errorCount++;
        errors.push(`Invalid filter_type: ${filter_type}`);
        continue;
      }

      try {
        const request = transaction.request();
        request.input('school_id', sql.NVarChar(200), school_id);
        request.input('filter_type', sql.NVarChar(20), filter_type);
        request.input('pattern', sql.NVarChar(500), pattern);
        if (id) {
          request.input('id', sql.BigInt, id);
          await request.query(`UPDATE admin.component_filter_config SET filter_type=@filter_type, pattern=@pattern, updated_at=SYSDATETIMEOFFSET() WHERE id=@id AND school_id=@school_id`);
        } else {
          await request.query(`INSERT INTO admin.component_filter_config (school_id, filter_type, pattern) VALUES (@school_id, @filter_type, @pattern)`);
        }
        successCount++;
      } catch (err: any) {
        errorCount++;
        errors.push(err.message);
      }
    }

    await transaction.commit();
    res.json({ success: true, successCount, errorCount, errors: errors.length ? errors : undefined });
  } catch (error: any) {
    console.error('Error saving component filters:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/rp-config/component-filters/:id
 */
router.delete('/component-filters/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const result = await executeQuery('DELETE FROM admin.component_filter_config WHERE id = @id', { id });
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ success: true, message: 'Deleted' });
  } catch (error: any) {
    console.error('Error deleting component filter:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// =============================================
// TERM FILTER CONFIG ROUTES
// =============================================

/**
 * GET /api/rp-config/term-filters
 */
router.get('/term-filters', async (req: Request, res: Response) => {
  try {
    const { school_id } = req.query;
    if (!school_id || typeof school_id !== 'string') {
      return res.status(400).json({ error: 'school_id is required' });
    }

    const query = `
      SELECT id, school_id, filter_type, pattern, display_order, created_at, updated_at
      FROM admin.term_filter_config
      WHERE school_id = @school_id
      ORDER BY display_order, filter_type, id
    `;
    const result = await executeQuery<any>(query, { school_id });
    if (result.error) return res.status(500).json({ error: result.error });

    res.json({ success: true, data: result.data || [] });
  } catch (error: any) {
    console.error('Error fetching term filters:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/rp-config/term-filters
 */
router.post('/term-filters', async (req: Request, res: Response) => {
  try {
    const { filters } = req.body;
    if (!Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({ error: 'filters array is required' });
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const f of filters) {
      const { id, school_id, filter_type, pattern } = f;
      if (!school_id || !filter_type || !pattern) {
        errorCount++;
        errors.push(`Missing required fields: ${JSON.stringify(f)}`);
        continue;
      }
      if (!['include', 'exclude'].includes(filter_type)) {
        errorCount++;
        errors.push(`Invalid filter_type: ${filter_type}`);
        continue;
      }

      try {
        const request = transaction.request();
        request.input('school_id', sql.NVarChar(200), school_id);
        request.input('filter_type', sql.NVarChar(20), filter_type);
        request.input('pattern', sql.NVarChar(500), pattern);
        if (id) {
          request.input('id', sql.BigInt, id);
          await request.query(`UPDATE admin.term_filter_config SET filter_type=@filter_type, pattern=@pattern, updated_at=SYSDATETIMEOFFSET() WHERE id=@id AND school_id=@school_id`);
        } else {
          await request.query(`INSERT INTO admin.term_filter_config (school_id, filter_type, pattern) VALUES (@school_id, @filter_type, @pattern)`);
        }
        successCount++;
      } catch (err: any) {
        errorCount++;
        errors.push(err.message);
      }
    }

    await transaction.commit();
    res.json({ success: true, successCount, errorCount, errors: errors.length ? errors : undefined });
  } catch (error: any) {
    console.error('Error saving term filters:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/rp-config/term-filters/:id
 */
router.delete('/term-filters/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const result = await executeQuery('DELETE FROM admin.term_filter_config WHERE id = @id', { id });
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ success: true, message: 'Deleted' });
  } catch (error: any) {
    console.error('Error deleting term filter:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
