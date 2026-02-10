/**
 * Term Grades API Routes
 */

import { Router, Request, Response } from 'express';
import { databaseService } from '../services/DatabaseService';

const router = Router();

/**
 * POST /api/term-grades
 * Create or update term grades (bulk)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const termGrades = Array.isArray(req.body) ? req.body : [req.body];

    if (termGrades.length === 0) {
      return res.status(400).json({ error: 'No term grades provided' });
    }

    const result = await databaseService.upsertTermGrades(termGrades);

    if (result.error && !result.data) {
      return res.status(500).json({ error: result.error });
    }

    res.status(201).json({
      data: result.data,
      errors: result.error ? [result.error] : []
    });
  } catch (error: any) {
    console.error('Error upserting term grades:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

