/**
 * Sidebar Access RBAC Routes (Admin only)
 */
import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { getSidebarAccessMatrix, setUserSidebarAccess, } from '../services/SidebarAccessService.js';
const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);
/**
 * GET /api/sidebar-access
 * Get full matrix: users, items, permissions (for admin UI)
 */
router.get('/', async (req, res) => {
    try {
        const matrix = await getSidebarAccessMatrix();
        res.json(matrix);
    }
    catch (error) {
        console.error('Get sidebar access matrix error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * PUT /api/sidebar-access/users/:email
 * Set sidebar permissions for a user (replaces existing)
 * Body: { itemIds: string[] }
 */
router.put('/users/:email', async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ error: 'Authentication required' });
        const { email } = req.params;
        const { itemIds } = req.body;
        if (!Array.isArray(itemIds)) {
            return res.status(400).json({ error: 'itemIds array is required' });
        }
        const decoded = decodeURIComponent(email);
        await setUserSidebarAccess(decoded, itemIds, req.user.email);
        res.json({ message: 'Sidebar access updated', itemIds });
    }
    catch (error) {
        console.error('Set sidebar access error:', error);
        if (error.message === 'User not found')
            return res.status(404).json({ error: error.message });
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=sidebarAccess.js.map