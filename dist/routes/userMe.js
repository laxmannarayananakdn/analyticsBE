/**
 * User Query Routes (for authenticated users to query their own access)
 */
import express from 'express';
import { getUserSchoolAccess, getUserAccess, getUserDepartments, getUserAccessibleNodes, } from '../services/AccessService.js';
import { getUserSidebarAccess } from '../services/SidebarAccessService.js';
import { getUserByEmail } from '../services/UserService.js';
import { authenticate } from '../middleware/auth.js';
const router = express.Router();
// All routes require authentication
router.use(authenticate);
/**
 * GET /users/me
 * Get current user profile (email, displayName)
 */
router.get('/me', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const user = await getUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            email: user.Email,
            displayName: user.Display_Name ?? null,
        });
    }
    catch (error) {
        console.error('Get current user error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /users/me/schools
 * Get schools user has access to with departments
 */
router.get('/me/schools', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const schools = await getUserSchoolAccess(req.user.email);
        res.json(schools);
    }
    catch (error) {
        console.error('Get user schools error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /users/me/nodes
 * Get nodes the user has access to (from Access Groups only).
 * Use this when you need "which nodes can this user access" - never uses Node_School.
 */
router.get('/me/nodes', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const nodes = await getUserAccessibleNodes(req.user.email);
        res.json(nodes);
    }
    catch (error) {
        console.error('Get user nodes error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /users/me/access
 * Get user's node assignments and departments
 */
router.get('/me/access', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const access = await getUserAccess(req.user.email);
        res.json(access.map(a => ({
            nodeId: a.Node_ID,
            departmentId: a.Department_ID,
        })));
    }
    catch (error) {
        console.error('Get user access error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /users/me/departments
 * Get distinct departments user has access to
 */
router.get('/me/departments', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const departments = await getUserDepartments(req.user.email);
        res.json({ departments });
    }
    catch (error) {
        console.error('Get user departments error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /users/me/sidebar-access
 * Get sidebar item IDs the user can see.
 * Empty array = full access (no restrictions).
 */
router.get('/me/sidebar-access', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const itemIds = await getUserSidebarAccess(req.user.email);
        res.json({ itemIds });
    }
    catch (error) {
        console.error('Get sidebar access error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=userMe.js.map