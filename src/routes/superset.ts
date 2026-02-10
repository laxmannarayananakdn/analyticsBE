/**
 * Superset API Routes
 * Handles Superset dashboard embedding and guest token generation
 */

import { Router, Request, Response } from 'express';
import { supersetService } from '../services/SupersetService.js';

const router = Router();

/**
 * POST /api/superset/guest-token
 * Generate a guest token for embedded dashboard access
 * Body: { dashboard_id: number, resources?: Array<{ type: string, id: string }> }
 */
router.post('/guest-token', async (req: Request, res: Response) => {
  try {
    const { dashboard_id, resources } = req.body;

    if (!dashboard_id) {
      return res.status(400).json({
        error: 'dashboard_id is required',
      });
    }

    console.log(`🔐 Generating guest token for dashboard ${dashboard_id}...`);
    
    try {
      const result = await supersetService.generateGuestToken(dashboard_id, resources);

      console.log(`✅ Guest token generated successfully for dashboard ${dashboard_id}`);
      
      res.json({
        token: result.token,
        expires_in: result.expires_in,
      });
    } catch (authError: any) {
      console.error('❌ Authentication error:', authError);
      console.error('   Error details:', authError.message);
      console.error('   Stack:', authError.stack);
      
      // Provide more helpful error message
      let errorMessage = authError.message || 'Failed to generate guest token';
      
      if (errorMessage.includes('CSRF token') || errorMessage.includes('UNAUTHORIZED')) {
        errorMessage = 'Failed to authenticate with Superset. Please check SUPERSET_USERNAME, SUPERSET_PASSWORD, or SUPERSET_API_KEY in your backend .env file.';
      }
      
      res.status(500).json({
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? authError.message : undefined,
      });
    }
  } catch (error: any) {
    console.error('Error in guest-token endpoint:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate guest token',
    });
  }
});

/**
 * GET /api/superset/dashboards
 * Get list of all dashboards
 */
router.get('/dashboards', async (req: Request, res: Response) => {
  try {
    console.log('📊 Fetching Superset dashboards...');
    
    const dashboards = await supersetService.getDashboards();
    
    console.log(`✅ Found ${dashboards.length} dashboard(s)`);
    
    res.json(dashboards);
  } catch (error: any) {
    console.error('Error fetching dashboards:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch dashboards',
    });
  }
});

/**
 * GET /api/superset/dashboards/:id
 * Get dashboard by ID
 */
router.get('/dashboards/:id', async (req: Request, res: Response) => {
  try {
    const dashboardId = parseInt(req.params.id);
    
    if (isNaN(dashboardId)) {
      return res.status(400).json({
        error: 'Invalid dashboard ID',
      });
    }

    console.log(`📊 Fetching dashboard ${dashboardId}...`);
    
    const dashboard = await supersetService.getDashboard(dashboardId);
    
    console.log(`✅ Dashboard ${dashboardId} fetched successfully`);
    
    res.json(dashboard);
  } catch (error: any) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch dashboard',
    });
  }
});

export default router;

