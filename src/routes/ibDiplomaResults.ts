/**
 * IB Diploma Result / Category management (MB schools)
 * Lists diploma-grain Result rows and allows updating Result + IB_category.
 */

import { Router, Request, Response } from 'express';
import { executeQuery, getConnection, sql } from '../config/database.js';

const router = Router();

export const RESULT_OPTIONS = [
  'Diploma awarded',
  'Diploma not awarded',
  'Bilingual Diploma awarded',
] as const;

export const IB_CATEGORY_OPTIONS = [
  'Diploma',
  'Course',
  'Anticipated',
  'Retake',
] as const;

const DIPLOMA_GRAIN = `
  subject_name IS NULL
  AND term_name IS NULL
  AND class_name IS NULL
`;

/**
 * GET /api/ib-diploma-results/schools
 */
router.get('/schools', async (_req: Request, res: Response) => {
  try {
    const result = await executeQuery<{ school_id: number; school_name: string }>(`
      SELECT school_id, school_name
      FROM MB.managebac_school_configs
      WHERE school_id IS NOT NULL AND is_active = 1
      ORDER BY school_name
    `);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ success: true, data: result.data || [] });
  } catch (error: any) {
    console.error('Error fetching IB diploma schools:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/ib-diploma-results/academic-years?school_id=
 */
router.get('/academic-years', async (req: Request, res: Response) => {
  try {
    const schoolId = req.query.school_id != null ? String(req.query.school_id) : '';
    if (!schoolId) {
      return res.status(400).json({ error: 'school_id is required' });
    }

    const result = await executeQuery<{ academic_year: string }>(
      `
      SELECT DISTINCT r.academic_year
      FROM RP.student_assessments r
      WHERE r.school_id = @school_id
        AND LTRIM(RTRIM(COALESCE(r.component_name, N''))) = N'Result'
        AND ${DIPLOMA_GRAIN}
        AND r.academic_year IS NOT NULL
      ORDER BY r.academic_year DESC
      `,
      { school_id: schoolId }
    );
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({
      success: true,
      data: (result.data || []).map((r) => r.academic_year),
    });
  } catch (error: any) {
    console.error('Error fetching IB diploma academic years:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/ib-diploma-results?school_id=&academic_year=&q=
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const schoolId = req.query.school_id != null ? String(req.query.school_id) : '';
    const academicYear = req.query.academic_year != null ? String(req.query.academic_year) : '';
    const q = req.query.q != null ? String(req.query.q).trim() : '';

    if (!schoolId || !academicYear) {
      return res.status(400).json({ error: 'school_id and academic_year are required' });
    }

    let query = `
      SELECT
        r.id AS result_id,
        r.school_id,
        r.school_name,
        r.register_number,
        r.student_name,
        r.grade_name,
        r.student_status,
        r.academic_year,
        r.component_value AS result,
        r.IB_category AS ib_category,
        tp.id AS total_points_id,
        tp.component_value AS total_points
      FROM RP.student_assessments r
      LEFT JOIN RP.student_assessments tp
        ON tp.school_id = r.school_id
       AND tp.register_number = r.register_number
       AND tp.academic_year = r.academic_year
       AND LTRIM(RTRIM(COALESCE(tp.component_name, N''))) = N'Total_Points'
       AND tp.subject_name IS NULL
       AND tp.term_name IS NULL
       AND tp.class_name IS NULL
      INNER JOIN MB.managebac_school_configs cfg
        ON CAST(cfg.school_id AS NVARCHAR(100)) = r.school_id
       AND cfg.is_active = 1
      WHERE r.school_id = @school_id
        AND r.academic_year = @academic_year
        AND LTRIM(RTRIM(COALESCE(r.component_name, N''))) = N'Result'
        AND r.subject_name IS NULL
        AND r.term_name IS NULL
        AND r.class_name IS NULL
    `;
    const params: Record<string, unknown> = {
      school_id: schoolId,
      academic_year: academicYear,
    };

    if (q) {
      query += `
        AND (
          r.student_name LIKE @q
          OR r.register_number LIKE @q
        )
      `;
      params.q = `%${q}%`;
    }

    query += ` ORDER BY r.student_name, r.register_number`;

    const result = await executeQuery<any>(query, params);
    if (result.error) return res.status(500).json({ error: result.error });

    res.json({
      success: true,
      count: result.data?.length || 0,
      data: result.data || [],
      options: {
        result: RESULT_OPTIONS,
        ib_category: IB_CATEGORY_OPTIONS,
      },
    });
  } catch (error: any) {
    console.error('Error fetching IB diploma results:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * PUT /api/ib-diploma-results
 * Body: { updates: [{ result_id, result?, ib_category? }] }
 * - Updates Result.component_value on the Result row
 * - Updates IB_category on all RP.student_assessments rows for that student+year
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates array is required' });
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      await transaction.begin();

      for (const row of updates) {
        const resultId = Number(row.result_id);
        if (!Number.isFinite(resultId) || resultId <= 0) {
          errorCount++;
          errors.push('Invalid result_id');
          continue;
        }

        const hasResult = Object.prototype.hasOwnProperty.call(row, 'result');
        const hasCategory = Object.prototype.hasOwnProperty.call(row, 'ib_category');
        if (!hasResult && !hasCategory) {
          errorCount++;
          errors.push(`result_id ${resultId}: nothing to update`);
          continue;
        }

        let resultValue: string | null | undefined = undefined;
        if (hasResult) {
          const raw = row.result;
          if (raw == null || String(raw).trim() === '') {
            resultValue = null;
          } else {
            resultValue = String(raw).trim();
            if (!(RESULT_OPTIONS as readonly string[]).includes(resultValue)) {
              errorCount++;
              errors.push(`result_id ${resultId}: invalid result '${resultValue}'`);
              continue;
            }
          }
        }

        let categoryValue: string | null | undefined = undefined;
        if (hasCategory) {
          const raw = row.ib_category;
          if (raw == null || String(raw).trim() === '') {
            categoryValue = null;
          } else {
            categoryValue = String(raw).trim();
            if (!(IB_CATEGORY_OPTIONS as readonly string[]).includes(categoryValue)) {
              errorCount++;
              errors.push(`result_id ${resultId}: invalid ib_category '${categoryValue}'`);
              continue;
            }
          }
        }

        // Load identity for the Result row
        const lookupReq = new sql.Request(transaction);
        lookupReq.input('result_id', sql.BigInt, resultId);
        const lookup = await lookupReq.query(`
          SELECT school_id, register_number, academic_year, component_name
          FROM RP.student_assessments
          WHERE id = @result_id
        `);
        const existing = lookup.recordset?.[0];
        if (!existing) {
          errorCount++;
          errors.push(`result_id ${resultId}: not found`);
          continue;
        }
        if (String(existing.component_name || '').trim() !== 'Result') {
          errorCount++;
          errors.push(`result_id ${resultId}: not a Result row`);
          continue;
        }

        if (hasResult) {
          const updResult = new sql.Request(transaction);
          updResult.input('result_id', sql.BigInt, resultId);
          updResult.input('result', sql.NVarChar(500), resultValue);
          await updResult.query(`
            UPDATE RP.student_assessments
            SET component_value = @result,
                updated_at = GETDATE()
            WHERE id = @result_id
          `);
        }

        if (hasCategory) {
          const updCat = new sql.Request(transaction);
          updCat.input('school_id', sql.NVarChar(100), existing.school_id);
          updCat.input('register_number', sql.NVarChar(100), existing.register_number);
          updCat.input('academic_year', sql.NVarChar(100), existing.academic_year);
          updCat.input('ib_category', sql.NVarChar(50), categoryValue);
          await updCat.query(`
            UPDATE RP.student_assessments
            SET IB_category = @ib_category,
                updated_at = GETDATE()
            WHERE school_id = @school_id
              AND register_number = @register_number
              AND academic_year = @academic_year
          `);
        }

        successCount++;
      }

      await transaction.commit();
      res.json({
        success: errorCount === 0,
        successCount,
        errorCount,
        errors: errors.length ? errors : undefined,
      });
    } catch (txErr: any) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw txErr;
    }
  } catch (error: any) {
    console.error('Error updating IB diploma results:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
