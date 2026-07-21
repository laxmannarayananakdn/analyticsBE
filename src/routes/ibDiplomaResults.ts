/**
 * IB Diploma Result / Category management (MB schools)
 * - Result / IB_category → RP.student_assessments
 * - Five profile attributes → RP.student_profile (MSNAV seeds; page edits win)
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

const PROFILE_FIELDS = [
  { key: 'community_status', column: 'community_status', length: 100 },
  { key: 'year_of_joining_academy', column: 'year_of_joining_academy', length: 100 },
  { key: 'joining_curriculum', column: 'joining_curriculum', length: 255 },
  { key: 'talent_id_prog', column: 'talent_id_prog', length: 100 },
  { key: 'rebalancing', column: 'rebalancing', length: 100 },
  { key: 'fa_status', column: 'fa_status', length: 200 },
  { key: 'fee_classification', column: 'fee_classification', length: 100 },
  { key: 'fee_code', column: 'fee_code', length: 100 },
] as const;

/** fa_percentage is numeric (DECIMAL(5,2)) and handled separately from the NVARCHAR fields. */
const FA_PERCENTAGE_KEY = 'fa_percentage';

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
 * Profile attributes come exclusively from RP.student_profile.
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
        tp.component_value AS total_points,
        CASE WHEN sp.register_number IS NULL THEN 0 ELSE 1 END AS has_profile,
        ISNULL(sp.has_msnav_source, 0) AS has_msnav_source,
        ISNULL(sp.profile_attributes_manually_edited, 0) AS profile_attributes_manually_edited,
        sp.community_status,
        sp.year_of_joining_academy,
        sp.joining_curriculum,
        sp.talent_id_prog,
        sp.rebalancing,
        sp.fa_status,
        sp.fa_percentage,
        sp.fee_classification,
        sp.fee_code
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
      LEFT JOIN RP.student_profile sp
        ON sp.school_id = r.school_id
       AND sp.academic_year = r.academic_year
       AND sp.register_number = r.register_number
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
 * Body: { updates: [{ result_id, result?, ib_category?,
 *                     community_status?, year_of_joining_academy?, joining_curriculum?,
 *                     talent_id_prog?, rebalancing?,
 *                     fa_status?, fa_percentage?, fee_classification?, fee_code? }] }
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates array is required' });
    }

    const updatedBy =
      (req as any).user?.email ||
      (typeof req.headers['x-user-email'] === 'string' ? req.headers['x-user-email'] : null) ||
      'admin';

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
        const profileUpdates = PROFILE_FIELDS.filter((f) =>
          Object.prototype.hasOwnProperty.call(row, f.key)
        );
        const hasFaPercentage = Object.prototype.hasOwnProperty.call(row, FA_PERCENTAGE_KEY);
        if (!hasResult && !hasCategory && profileUpdates.length === 0 && !hasFaPercentage) {
          errorCount++;
          errors.push(`result_id ${resultId}: nothing to update`);
          continue;
        }

        let faPercentageValue: number | null | undefined = undefined;
        if (hasFaPercentage) {
          const raw = (row as Record<string, unknown>)[FA_PERCENTAGE_KEY];
          if (raw == null || String(raw).trim() === '') {
            faPercentageValue = null;
          } else {
            const parsed = Number(String(raw).trim());
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999.99) {
              errorCount++;
              errors.push(`result_id ${resultId}: invalid fa_percentage '${raw}'`);
              continue;
            }
            faPercentageValue = parsed;
          }
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

        const keyReq = new sql.Request(transaction);
        keyReq.input('result_id', sql.BigInt, resultId);
        const keyResult = await keyReq.query<{
          school_id: string;
          register_number: string;
          academic_year: string;
          student_name: string | null;
          grade_name: string | null;
          student_status: string | null;
        }>(`
          SELECT school_id, register_number, academic_year, student_name, grade_name, student_status
          FROM RP.student_assessments
          WHERE id = @result_id
            AND LTRIM(RTRIM(COALESCE(component_name, N''))) = N'Result'
        `);

        const keys = keyResult.recordset?.[0];
        if (!keys) {
          errorCount++;
          errors.push(`result_id ${resultId}: not found or not a Result row`);
          continue;
        }

        if (hasResult || hasCategory) {
          const setParts: string[] = ['updated_at = GETDATE()'];
          const upd = new sql.Request(transaction);
          upd.input('result_id', sql.BigInt, resultId);

          if (hasResult) {
            setParts.push('component_value = @result');
            upd.input('result', sql.NVarChar(500), resultValue);
          }
          if (hasCategory) {
            setParts.push('IB_category = @ib_category');
            upd.input('ib_category', sql.NVarChar(50), categoryValue);
          }

          await upd.query(`
            UPDATE RP.student_assessments
            SET ${setParts.join(', ')}
            WHERE id = @result_id
          `);
        }

        if (hasCategory) {
          const fan = new sql.Request(transaction);
          fan.input('school_id', sql.NVarChar(100), keys.school_id);
          fan.input('register_number', sql.NVarChar(100), keys.register_number);
          fan.input('academic_year', sql.NVarChar(100), keys.academic_year);
          fan.input('ib_category', sql.NVarChar(50), categoryValue);
          fan.input('result_id', sql.BigInt, resultId);
          await fan.query(`
            UPDATE RP.student_assessments
            SET IB_category = @ib_category,
                updated_at = GETDATE()
            WHERE school_id = @school_id
              AND register_number = @register_number
              AND academic_year = @academic_year
              AND id <> @result_id
              AND (
                   (IB_category IS NULL AND @ib_category IS NOT NULL)
                OR (IB_category IS NOT NULL AND @ib_category IS NULL)
                OR (IB_category <> @ib_category)
              )
          `);
        }

        // Upsert profile attributes onto RP.student_profile only
        if (profileUpdates.length > 0 || hasFaPercentage) {
          const setParts: string[] = [
            'profile_attributes_manually_edited = 1',
            'profile_attributes_updated_at = SYSDATETIMEOFFSET()',
            'profile_attributes_updated_by = @updated_by',
          ];
          const profileParams: { name: string; length: number; value: string | null }[] = [];

          for (const f of profileUpdates) {
            const raw = (row as Record<string, unknown>)[f.key];
            const value = raw == null || String(raw).trim() === '' ? null : String(raw).trim();
            setParts.push(`[${f.column}] = @${f.key}`);
            profileParams.push({ name: f.key, length: f.length, value });
          }

          if (hasFaPercentage) {
            setParts.push('[fa_percentage] = @fa_percentage');
          }

          // Editing fee_classification also re-derives student_type (RES / DAY)
          if (profileUpdates.some((f) => f.key === 'fee_classification')) {
            setParts.push(`[student_type] = CASE
              WHEN UPPER(LTRIM(RTRIM(ISNULL(@fee_classification, '')))) LIKE N'%RES%' THEN N'RES'
              WHEN UPPER(LTRIM(RTRIM(ISNULL(@fee_classification, '')))) LIKE N'%DAY%' THEN N'DAY'
              ELSE NULL
            END`);
          }

          // Ensure profile row exists (unique grain: school + year + register)
          const ensure = new sql.Request(transaction);
          ensure.input('school_id', sql.NVarChar(100), keys.school_id);
          ensure.input('register_number', sql.NVarChar(100), keys.register_number);
          ensure.input('academic_year', sql.NVarChar(100), keys.academic_year);
          ensure.input('full_name', sql.NVarChar(500), keys.student_name);
          ensure.input('grade_name', sql.NVarChar(100), keys.grade_name);
          ensure.input('student_status', sql.NVarChar(100), keys.student_status);
          await ensure.query(`
            IF NOT EXISTS (
              SELECT 1
              FROM RP.student_profile WITH (UPDLOCK, HOLDLOCK)
              WHERE school_id = @school_id
                AND academic_year = @academic_year
                AND register_number = @register_number
            )
            BEGIN
              INSERT INTO RP.student_profile (
                school_id, academic_year, register_number,
                full_name, grade_name, student_status,
                is_eal, is_sen, is_gifted, has_support_group,
                is_fallout, is_islam,
                has_msnav_source,
                profile_attributes_manually_edited
              )
              VALUES (
                @school_id, @academic_year, @register_number,
                @full_name, @grade_name, @student_status,
                0, 0, 0, 0,
                0, 0,
                0,
                0
              );
            END
          `);

          const updProfile = new sql.Request(transaction);
          updProfile.input('school_id', sql.NVarChar(100), keys.school_id);
          updProfile.input('register_number', sql.NVarChar(100), keys.register_number);
          updProfile.input('academic_year', sql.NVarChar(100), keys.academic_year);
          updProfile.input('updated_by', sql.NVarChar(255), updatedBy);
          for (const p of profileParams) {
            updProfile.input(p.name, sql.NVarChar(p.length), p.value);
          }
          if (hasFaPercentage) {
            updProfile.input(FA_PERCENTAGE_KEY, sql.Decimal(5, 2), faPercentageValue);
          }
          const profileResult = await updProfile.query(`
            UPDATE RP.student_profile
            SET ${setParts.join(', ')}
            WHERE school_id = @school_id
              AND academic_year = @academic_year
              AND register_number = @register_number
          `);

          if (!profileResult.rowsAffected?.[0]) {
            errorCount++;
            errors.push(
              `result_id ${resultId}: failed to update RP.student_profile for ${keys.register_number}`
            );
            continue;
          }
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
