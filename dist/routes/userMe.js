/**
 * User Query Routes (for authenticated users to query their own access)
 */
import express from 'express';
import { getUserSchoolAccess, getUserAccess, getUserDepartments, } from '../services/AccessService';
import { authenticate } from '../middleware/auth';
const router = express.Router();
// All routes require authentication
router.use(authenticate);
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
export default router;
//# sourceMappingURL=userMe.js.map