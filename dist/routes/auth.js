/**
 * Authentication Routes
 */
import express from 'express';
import { authenticateUser, changePassword, setPassword } from '../services/AuthService.js';
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
            res.cookie('session', result.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                // sameSite: 'none' needed when frontend and backend are on different domains (e.g. Azure)
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
            });
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * POST /auth/logout
 * Clear session cookie (no auth required - always clear if present)
 */
router.post('/logout', async (req, res) => {
    try {
        res.clearCookie('session');
        res.json({ message: 'Logged out successfully' });
    }
    catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * POST /auth/set-password
 * Set new password when user has temporary password (first login). No auth required.
 */
router.post('/set-password', loginRateLimiter, async (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        if (!email || !currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Email, current password, and new password are required' });
        }
        const result = await setPassword(email, currentPassword, newPassword);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({ message: 'Password set successfully. You can now log in.' });
    }
    catch (error) {
        console.error('Set password error:', error);
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
        const changeRequest = {
            newPassword,
            ...(currentPassword ? { currentPassword } : {}),
        };
        const result = await changePassword(req.user.email, changeRequest);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        res.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=auth.js.map