/**
 * User Access Management Routes (Admin only)
 */
import express from 'express';
import { getUserAccess, grantAccess, updateAccess, revokeNodeAccess, revokeDepartmentAccess, } from '../services/AccessService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
const router = express.Router();
// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);
/**
 * POST /users/:email/access
 * Grant user access to node with departments
 */
router.post('/:email/access', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { email } = req.params;
        const { nodeId, departmentIds } = req.body;
        if (!nodeId || !departmentIds || !Array.isArray(departmentIds) || departmentIds.length === 0) {
            return res.status(400).json({ error: 'nodeId and departmentIds array are required' });
        }
        const access = await grantAccess(email, { nodeId, departmentIds }, req.user.email);
        res.status(201).json({
            message: 'Access granted successfully',
            access: access.map(a => ({
                userId: a.User_ID,
                nodeId: a.Node_ID,
                departmentId: a.Department_ID,
            })),
        });
    }
    catch (error) {
        console.error('Grant access error:', error);
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /users/:email/access
 * Get user's node and department access
 */
router.get('/:email/access', async (req, res) => {
    try {
        const { email } = req.params;
        const access = await getUserAccess(email);
        res.json(access.map(a => ({
            userId: a.User_ID,
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
 * PUT /users/:email/access/:nodeId
 * Update user's department access for a node (replaces existing)
 */
router.put('/:email/access/:nodeId', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { email, nodeId } = req.params;
        const { departmentIds } = req.body;
        if (!departmentIds || !Array.isArray(departmentIds)) {
            return res.status(400).json({ error: 'departmentIds array is required' });
        }
        const access = await updateAccess(email, nodeId, { departmentIds }, req.user.email);
        res.json({
            message: 'Access updated successfully',
            access: access.map(a => ({
                userId: a.User_ID,
                nodeId: a.Node_ID,
                departmentId: a.Department_ID,
            })),
        });
    }
    catch (error) {
        console.error('Update access error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * DELETE /users/:email/access/:nodeId
 * Revoke all user access to a node
 */
router.delete('/:email/access/:nodeId', async (req, res) => {
    try {
        const { email, nodeId } = req.params;
        await revokeNodeAccess(email, nodeId);
        res.json({ message: 'Access revoked successfully' });
    }
    catch (error) {
        console.error('Revoke access error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * DELETE /users/:email/access/:nodeId/departments/:departmentId
 * Revoke specific department access for a node
 */
router.delete('/:email/access/:nodeId/departments/:departmentId', async (req, res) => {
    try {
        const { email, nodeId, departmentId } = req.params;
        await revokeDepartmentAccess(email, nodeId, departmentId);
        res.json({ message: 'Department access revoked successfully' });
    }
    catch (error) {
        console.error('Revoke department access error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=userAccess.js.map