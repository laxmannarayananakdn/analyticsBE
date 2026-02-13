/**
 * Superset API Routes - WITH TEMPORARY TEST ENDPOINT
 * Handles Superset dashboard embedding and guest token generation
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { supersetService } from '../services/SupersetService.js';
import { authenticate } from '../middleware/auth.js';
import { getUserById } from '../services/AuthService.js';

const router = Router();

/**
 * POST /api/superset/embed-token
 * Generate guest token for embedded dashboard (requires authentication)
 * Body: { dashboardId: string }  (UUID from Superset Embed UI)
 *
 * Tries Superset API first (token signed by Superset - always accepted).
 * Falls back to self-issued JWT if API fails (requires GUEST_TOKEN_JWT_SECRET match in Superset).
 */
router.post('/embed-token', authenticate, async (req: Request, res: Response) => {
  try {
    const dashboardId = req.body.dashboardId ?? req.body.dashboard_id;

    if (!dashboardId) {
      return res.status(400).json({
        error: 'dashboardId is required',
      });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const dbUser = await getUserById(user.userId);
    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dashboardIdString = String(dashboardId);

    // 1. Try Superset API first - token is signed by Superset, so it will always be accepted
    if (process.env.SUPERSET_USERNAME || process.env.SUPERSET_API_KEY) {
      try {
        const result = await supersetService.generateGuestToken(dashboardIdString, undefined, false);
        if (result.token) {
          console.log('🔐 Guest token from Superset API for dashboard:', dashboardIdString);
          return res.json({ token: result.token, dashboardId: dashboardIdString });
        }
      } catch (apiErr: any) {
        console.warn('⚠️ Superset API token failed, falling back to JWT:', apiErr.message);
      }
    }

    // 2. Fallback: self-issued JWT (requires GUEST_TOKEN_JWT_SECRET in Superset)
    const secret = process.env.GUEST_TOKEN_JWT_SECRET;
    if (!secret) {
      return res.status(500).json({
        error: 'No token source: Configure SUPERSET_USERNAME+SUPERSET_PASSWORD (or SUPERSET_API_KEY) for API token, or GUEST_TOKEN_JWT_SECRET for JWT.',
      });
    }

    const displayName = dbUser.Display_Name || '';
    const nameParts = displayName.trim().split(/\s+/);
    const firstName = nameParts[0] || user.email.split('@')[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || '';

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      user: {
        username: user.email,
        first_name: firstName,
        last_name: lastName,
      },
      resources: [{ type: 'dashboard', id: dashboardIdString }],
      rls_rules: [] as Array<{ clause: string; dataset?: string }>,
      iat: now,
      exp: now + 60 * 60,
      aud: process.env.GUEST_TOKEN_JWT_AUDIENCE || 'superset',
      type: 'guest',
    };

    const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
    console.log('🔐 Guest token (JWT) for dashboard:', dashboardIdString);

    res.json({ token, dashboardId: dashboardIdString });
  } catch (error: any) {
    console.error('Error generating embed token:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate embed token',
    });
  }
});

/**
 * POST /api/superset/test-token
 * TEMPORARY TEST ENDPOINT - Generate token WITHOUT authentication
 * ⚠️ WARNING: Remove this endpoint in production!
 * Body: { dashboardId: number, email?: string }
 */
router.post('/test-token', async (req: Request, res: Response) => {
  try {
    const dashboardId = req.body.dashboardId ?? req.body.dashboard_id ?? 1;
    const testEmail = req.body.email || 'test@example.com';
    const secret = process.env.GUEST_TOKEN_JWT_SECRET;

    console.log('⚠️ TEST ENDPOINT CALLED - Remove in production!');

    if (!secret) {
      return res.status(500).json({
        error: 'GUEST_TOKEN_JWT_SECRET is not configured in backend environment',
      });
    }

    // FIXED: Use dashboard ID as string
    const dashboardIdString = String(dashboardId);

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      user: { username: testEmail, first_name: 'Test', last_name: 'User' },
      resources: [{ type: 'dashboard', id: dashboardIdString }],
      rls_rules: [],
      iat: now,
      exp: now + 60 * 60,
      aud: process.env.GUEST_TOKEN_JWT_AUDIENCE || 'superset',
      type: 'guest',
    };

    console.log('🔐 TEST: Generating guest token for dashboard:', dashboardIdString);
    console.log('   Token payload:', JSON.stringify(payload, null, 2));

    const token = jwt.sign(payload, secret, { algorithm: 'HS256' });

    // Decode to verify
    const decoded = jwt.decode(token) as any;
    console.log('✅ TEST: Token generated and decoded successfully');
    console.log('   Dashboard ID in token:', decoded.resources[0].id);
    console.log('   Expires:', new Date(decoded.exp * 1000).toISOString());

    res.json({ 
      token,
      dashboardId: dashboardIdString,
      decoded: decoded,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error: any) {
    console.error('Error generating test token:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate test token',
    });
  }
});

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