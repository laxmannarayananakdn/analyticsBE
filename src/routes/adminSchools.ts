/**
 * Admin Schools Routes
 * Get available schools from NEX and MB schemas for assignment
 */

import express from 'express';
import { executeQuery } from '../config/database.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/schools
 * Get all available schools from NEX and MB schemas
 */
router.get('/', async (req, res) => {
  try {
    // Get NEX schools
    const nexResult = await executeQuery<{
      sourced_id: string;
      name: string;
    }>(
      `SELECT sourced_id, name FROM NEX.schools ORDER BY name`
    );

    // Get MB schools
    const mbResult = await executeQuery<{
      id: string;
      name: string;
    }>(
      `SELECT CAST(id AS VARCHAR(50)) AS id, name FROM MB.schools ORDER BY name`
    );

    const schools: Array<{
      id: string;
      name: string;
      source: 'nex' | 'mb';
    }> = [];

    // Add NEX schools
    if (nexResult.data) {
      nexResult.data.forEach((school) => {
        schools.push({
          id: school.sourced_id,
          name: school.name || school.sourced_id,
          source: 'nex',
        });
      });
    }

    // Add MB schools
    if (mbResult.data) {
      mbResult.data.forEach((school) => {
        schools.push({
          id: school.id,
          name: school.name || school.id,
          source: 'mb',
        });
      });
    }

    res.json(schools);
  } catch (error: any) {
    console.error('Get schools error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
