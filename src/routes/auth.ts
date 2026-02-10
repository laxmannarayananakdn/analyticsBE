/**
 * Authentication Routes
 */

import express from 'express';
import { authenticateUser, changePassword } from '../services/AuthService.js';
import type { ChangePasswordRequest } from '../types/auth.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /auth/login
 * Login with email/password or OAuth token
 */
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { email, password, oauthToken } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // For password authentication
    if (password) {
      const result = await authenticateUser({ email, password });
      
      if ('error' in result) {
        if (result.error === 'PASSWORD_CHANGE_REQUIRED') {
          return res.status(403).json({
            error: 'Password change required',
            code: 'PASSWORD_CHANGE_REQUIRED'
          });
        }
        return res.status(401).json({ error: result.error });
      }
      
      return res.json({
        user: {
          email: result.user.Email,
          displayName: result.user.Display_Name,
          authType: result.user.Auth_Type,
        },
        token: result.token,
      });
    }
    
    // For OAuth authentication (Microsoft App Registration)
    if (oauthToken) {
      // TODO: Verify OAuth token with Microsoft
      // For now, we'll return an error indicating OAuth is not fully implemented
      return res.status(501).json({ error: 'OAuth authentication not yet implemented' });
    }
    
    return res.status(400).json({ error: 'Password or OAuth token is required' });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/logout
 * Logout (client-side token removal, but we can track it)
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    // In a stateless JWT system, logout is handled client-side
    // We could implement token blacklisting here if needed
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/change-password
 * Change password (for temporary password reset or regular password change)
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }
    
    // If user has temporary password, currentPassword is not required
    // Otherwise, currentPassword is required
    const changeRequest: ChangePasswordRequest = {
      newPassword,
      ...(currentPassword ? { currentPassword } : {}),
    };
    
    const result = await changePassword(req.user.email, changeRequest);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
