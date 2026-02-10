/**
 * User Management Routes (Admin only)
 */
import express from 'express';
import { getAllUsers, getUserByEmail, createUser, updateUser, deactivateUser, } from '../services/UserService';
import { resetPassword } from '../services/AuthService';
import { authenticate, requireAdmin } from '../middleware/auth';
const router = express.Router();
// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);
/**
 * POST /users
 * Create a new user
 */
router.post('/', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { email, displayName, authType, password } = req.body;
        if (!email || !authType) {
            return res.status(400).json({ error: 'Email and authType are required' });
        }
        if (authType !== 'AppRegistration' && authType !== 'Password') {
            return res.status(400).json({ error: 'authType must be AppRegistration or Password' });
        }
        if (authType === 'Password' && password) {
            // Validate password complexity
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/;
            if (!passwordRegex.test(password) || password.length < 8) {
                return res.status(400).json({
                    error: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character'
                });
            }
        }
        const result = await createUser({
            email,
            displayName,
            authType,
            password,
            createdBy: req.user.email,
        });
        if ('error' in result) {
            return res.status(400).json({ error: result.error });
        }
        const response = {
            user: {
                email: result.user.Email,
                displayName: result.user.Display_Name,
                authType: result.user.Auth_Type,
                isActive: result.user.Is_Active,
            },
        };
        // Include temporary password if generated
        if (result.temporaryPassword) {
            response.temporaryPassword = result.temporaryPassword;
        }
        res.status(201).json(response);
    }
    catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /users
 * Get all users
 */
router.get('/', async (req, res) => {
    try {
        const users = await getAllUsers();
        res.json(users.map(u => ({
            email: u.Email,
            displayName: u.Display_Name,
            authType: u.Auth_Type,
            isActive: u.Is_Active,
            isTemporaryPassword: u.Is_Temporary_Password,
            createdDate: u.Created_Date,
            lastLogin: u.Last_Login,
        })));
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /users/:email
 * Get user by email
 */
router.get('/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            email: user.Email,
            displayName: user.Display_Name,
            authType: user.Auth_Type,
            isActive: user.Is_Active,
            isTemporaryPassword: user.Is_Temporary_Password,
            createdDate: user.Created_Date,
            modifiedDate: user.Modified_Date,
            lastLogin: user.Last_Login,
        });
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * PUT /users/:email
 * Update user
 */
router.put('/:email', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { email } = req.params;
        const { displayName, isActive } = req.body;
        const user = await updateUser(email, { displayName, isActive });
        res.json({
            email: user.Email,
            displayName: user.Display_Name,
            authType: user.Auth_Type,
            isActive: user.Is_Active,
        });
    }
    catch (error) {
        console.error('Update user error:', error);
        if (error.message === 'User not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * PATCH /users/:email/deactivate
 * Deactivate user (soft delete)
 */
router.patch('/:email/deactivate', async (req, res) => {
    try {
        const { email } = req.params;
        const user = await deactivateUser(email);
        res.json({
            email: user.Email,
            displayName: user.Display_Name,
            isActive: user.Is_Active,
            message: 'User deactivated successfully',
        });
    }
    catch (error) {
        console.error('Deactivate user error:', error);
        if (error.message === 'User not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * POST /users/:email/reset-password
 * Reset user password (generates temporary password)
 */
router.post('/:email/reset-password', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { email } = req.params;
        const result = await resetPassword(email, req.user.email);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        res.json({
            temporaryPassword: result.temporaryPassword,
            message: 'Password reset successfully. Temporary password generated.',
        });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=users.js.map