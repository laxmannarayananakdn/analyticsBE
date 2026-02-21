/**
 * Health Check Routes
 */

import { Router, Request, Response } from 'express';
import { testConnection } from '../config/database.js';
import { getSyncSchedulerTimezone, isSyncSchedulerEnabled } from '../scheduler/SyncScheduler.js';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const dbConnected = await testConnection();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      sync_scheduler: {
        enabled: isSyncSchedulerEnabled(),
        timezone: getSyncSchedulerTimezone(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

export default router;

