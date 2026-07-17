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
// IB Global Mean Config (admin.ib_global_avg_total_points_by_year)
// =============================================

const IB_GLOBAL_YEAR_MIN = 2000;
const IB_GLOBAL_YEAR_MAX = 2100;
const IB_GLOBAL_POINTS_MIN = 0;
const IB_GLOBAL_POINTS_MAX = 45;

function validateIbGlobalMeanRow(row: { year?: unknown; avg_total_points?: unknown }): string | null {
  const year = Number(row.year);
  if (!Number.isInteger(year) || year < IB_GLOBAL_YEAR_MIN || year > IB_GLOBAL_YEAR_MAX) {
    return `year must be an integer between ${IB_GLOBAL_YEAR_MIN} and ${IB_GLOBAL_YEAR_MAX}`;
  }
  const avg = Number(row.avg_total_points);
  if (!Number.isFinite(avg) || avg < IB_GLOBAL_POINTS_MIN || avg > IB_GLOBAL_POINTS_MAX) {
    return `avg_total_points must be between ${IB_GLOBAL_POINTS_MIN} and ${IB_GLOBAL_POINTS_MAX}`;
  }
  return null;
}

/**
 * GET /api/managebac-config/ib-global-means
 */
router.get('/ib-global-means', async (_req: Request, res: Response) => {
  try {
    const result = await executeQuery<{ year: number; avg_total_points: number }>(
      `SELECT [Year] AS year, avg_total_points
       FROM admin.ib_global_avg_total_points_by_year
       ORDER BY [Year] DESC`
    );
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ success: true, data: result.data || [] });
  } catch (error: any) {
    console.error('Error fetching IB global means:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/managebac-config/ib-global-means
 * Body: { rows: [{ year, avg_total_points }] }
 */
router.post('/ib-global-means', async (req: Request, res: Response) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    await transaction.begin();

    let successCount = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const validationError = validateIbGlobalMeanRow(row);
      if (validationError) {
        errors.push(`${JSON.stringify(row)}: ${validationError}`);
        continue;
      }

      const year = Number(row.year);
      const avg = Number(row.avg_total_points);

      try {
        const request = transaction.request();
        request.input('year', sql.Int, year);
        request.input('avg_total_points', sql.Decimal(8, 4), avg);
        await request.query(`
          MERGE admin.ib_global_avg_total_points_by_year AS target
          USING (SELECT @year AS [Year], @avg_total_points AS avg_total_points) AS source
          ON target.[Year] = source.[Year]
          WHEN MATCHED THEN
            UPDATE SET avg_total_points = source.avg_total_points
          WHEN NOT MATCHED THEN
            INSERT ([Year], avg_total_points)
            VALUES (source.[Year], source.avg_total_points);
        `);
        successCount++;
      } catch (err: any) {
        errors.push(`year ${year}: ${err.message}`);
      }
    }

    await transaction.commit();
    res.json({
      success: true,
      successCount,
      errorCount: errors.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error saving IB global means:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/managebac-config/ib-global-means/:year
 */
router.delete('/ib-global-means/:year', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (Number.isNaN(year) || year < IB_GLOBAL_YEAR_MIN || year > IB_GLOBAL_YEAR_MAX) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const result = await executeQuery(
      `DELETE FROM admin.ib_global_avg_total_points_by_year WHERE [Year] = @year`,
      { year }
    );
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ success: true, message: 'Deleted' });
  } catch (error: any) {
    console.error('Error deleting IB global mean:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// =============================================
// Term Grade Rubric Config (admin.mb_term_grade_rubric_config)
// =============================================

/** Normalize AY label for dash/space-insensitive match against MB.academic_years.name */
const AY_NORM_SQL = (expr: string) =>
  `LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(${expr})), NCHAR(160), N''), N' ', N''), N'-', N''), NCHAR(8211), N''), NCHAR(8212), N''))`;

/**
 * Resolve free-text / hyphenated academic_year to exact MB.academic_years.name for a school.
 * Returns null when no match.
 */
async function resolveMbAcademicYearName(
  schoolId: number,
  academicYear: string
): Promise<string | null> {
  const hint = String(academicYear || '').trim();
  if (!hint) return null;

  const result = await executeQuery<{ name: string }>(
    `SELECT TOP 1 ay.name
     FROM MB.academic_years ay
     WHERE ay.school_id = @school_id
       AND (
         ay.name = @academic_year
         OR ${AY_NORM_SQL('ay.name')} = ${AY_NORM_SQL('@academic_year')}
       )
     ORDER BY CASE WHEN ay.name = @academic_year THEN 0 ELSE 1 END, ay.id DESC`,
    { school_id: schoolId, academic_year: hint }
  );
  if (result.error) throw new Error(result.error);
  return result.data?.[0]?.name || null;
}

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
 * GET /api/managebac-config/term-grade-rubric-config/academic-years?school_id=
 * Distinct academic year labels from MB.academic_years (exact ManageBac names).
 */
router.get('/term-grade-rubric-config/academic-years', async (req: Request, res: Response) => {
  try {
    const schoolIdRaw = req.query.school_id;
    if (schoolIdRaw == null || schoolIdRaw === '') {
      return res.status(400).json({ error: 'school_id is required' });
    }
    const school_id = parseInt(String(schoolIdRaw), 10);
    if (Number.isNaN(school_id)) {
      return res.status(400).json({ error: 'Invalid school_id' });
    }

    const result = await executeQuery<{ academic_year: string; academic_year_id: number }>(
      `SELECT ay.name AS academic_year, ay.id AS academic_year_id
       FROM MB.academic_years ay
       WHERE ay.school_id = @school_id
         AND ay.name IS NOT NULL
         AND LTRIM(RTRIM(ay.name)) <> ''
       ORDER BY ay.id DESC`,
      { school_id }
    );
    if (result.error) return res.status(500).json({ error: result.error });

    // Dedupe by exact name (keep highest id via ORDER BY above + Map)
    const seen = new Map<string, { academic_year: string; academic_year_id: number }>();
    for (const row of result.data || []) {
      if (!seen.has(row.academic_year)) {
        seen.set(row.academic_year, row);
      }
    }
    res.json({ success: true, data: [...seen.values()] });
  } catch (error: any) {
    console.error('Error fetching MB academic years:', error);
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
      SELECT id, school_id, academic_year, academic_year_rp, grade_number, rubric_title, term_id, display_order, created_at, updated_at
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
 * Bulk upsert config rows.
 * academic_year is resolved to the exact MB.academic_years.name (dash-insensitive)
 * so hyphen/en-dash typos cannot break MB→RP sync.
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
    const resolvedAyCache = new Map<string, string | null>();

    for (const c of configs) {
      const { id, school_id, academic_year, academic_year_rp, grade_number, rubric_title, term_id, display_order } = c;
      if (!school_id || academic_year == null || grade_number == null || !rubric_title || !term_id) {
        errors.push(`Missing required fields: ${JSON.stringify(c)}`);
        continue;
      }
      try {
        const schoolIdNum = parseInt(String(school_id), 10);
        const ayKey = `${schoolIdNum}::${String(academic_year).trim()}`;
        let resolvedAy = resolvedAyCache.get(ayKey);
        if (resolvedAy === undefined) {
          resolvedAy = await resolveMbAcademicYearName(schoolIdNum, String(academic_year));
          resolvedAyCache.set(ayKey, resolvedAy);
        }
        if (!resolvedAy) {
          errors.push(
            `academic_year "${academic_year}" not found in MB.academic_years for school_id=${school_id}. Pick a year from the ManageBac list.`
          );
          continue;
        }

        const request = transaction.request();
        request.input('school_id', sql.BigInt, schoolIdNum);
        request.input('academic_year', sql.NVarChar(200), resolvedAy);
        request.input('academic_year_rp', sql.NVarChar(20), academic_year_rp != null && String(academic_year_rp).trim() !== '' ? String(academic_year_rp).trim() : null);
        request.input('grade_number', sql.Int, parseInt(String(grade_number), 10));
        request.input('rubric_title', sql.NVarChar(500), String(rubric_title).trim());
        request.input('term_id', sql.BigInt, term_id);
        request.input('display_order', sql.Int, display_order ?? 0);
        if (id) {
          request.input('id', sql.BigInt, id);
          await request.query(`
            UPDATE admin.mb_term_grade_rubric_config
            SET school_id=@school_id, academic_year=@academic_year, grade_number=@grade_number,
                academic_year_rp=@academic_year_rp, rubric_title=@rubric_title, term_id=@term_id, display_order=@display_order, updated_at=SYSDATETIMEOFFSET()
            WHERE id=@id
          `);
        } else {
          await request.query(`
            MERGE admin.mb_term_grade_rubric_config AS target
            USING (SELECT @school_id AS school_id, @academic_year AS academic_year, @grade_number AS grade_number, @rubric_title AS rubric_title) AS source
            ON target.school_id = source.school_id AND target.academic_year = source.academic_year
               AND target.grade_number = source.grade_number AND target.rubric_title = source.rubric_title
            WHEN MATCHED THEN
              UPDATE SET term_id=@term_id, academic_year_rp=@academic_year_rp, display_order=@display_order, updated_at=SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN
              INSERT (school_id, academic_year, academic_year_rp, grade_number, rubric_title, term_id, display_order)
              VALUES (@school_id, @academic_year, @academic_year_rp, @grade_number, @rubric_title, @term_id, @display_order);
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
