/**
 * Access Groups Routes (Admin only)
 */

import express from 'express';
import {
  getAllGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupNodeAccess,
  setGroupNodeAccess,
  getGroupPageAccess,
  setGroupPageAccess,
} from '../services/GroupService.js';
import { ADMIN_ITEMS } from '../services/SidebarAccessService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/access-groups/available-pages
 * Must be before /:id so "available-pages" is not captured as id.
 */
router.get('/available-pages', (req, res) => {
  res.json({ items: ADMIN_ITEMS });
});

/**
 * GET /api/access-groups
 */
router.get('/', async (req, res) => {
  try {
    const groups = await getAllGroups();
    res.json(
      groups.map((g) => ({
        groupId: g.Group_ID,
        groupName: g.Group_Name,
        groupDescription: g.Group_Description,
      }))
    );
  } catch (error: any) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * POST /api/access-groups
 */
router.post('/', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { groupId, groupName, groupDescription } = req.body;
    if (!groupId || !groupName) {
      return res.status(400).json({ error: 'groupId and groupName are required' });
    }
    const group = await createGroup(groupId, groupName, groupDescription || null, req.user.email);
    res.status(201).json({ groupId: group.Group_ID, groupName: group.Group_Name, groupDescription: group.Group_Description });
  } catch (error: any) {
    console.error('Create group error:', error);
    if (error.message.includes('already exists') || error.message.includes('PRIMARY KEY')) {
      return res.status(400).json({ error: 'Group ID already exists' });
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/access-groups/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const group = await getGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json({ groupId: group.Group_ID, groupName: group.Group_Name, groupDescription: group.Group_Description });
  } catch (error: any) {
    console.error('Get group error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * PUT /api/access-groups/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { groupName, groupDescription } = req.body;
    if (!groupName) return res.status(400).json({ error: 'groupName is required' });
    const group = await updateGroup(req.params.id, groupName, groupDescription || null);
    res.json({ groupId: group.Group_ID, groupName: group.Group_Name, groupDescription: group.Group_Description });
  } catch (error: any) {
    console.error('Update group error:', error);
    if (error.message === 'Group not found') return res.status(404).json({ error: error.message });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/access-groups/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    await deleteGroup(req.params.id);
    res.json({ message: 'Group deleted successfully' });
  } catch (error: any) {
    console.error('Delete group error:', error);
    if (error.message === 'Group not found') return res.status(404).json({ error: error.message });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/access-groups/:id/nodes
 */
router.get('/:id/nodes', async (req, res) => {
  try {
    const access = await getGroupNodeAccess(req.params.id);
    res.json(access);
  } catch (error: any) {
    console.error('Get group nodes error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * PUT /api/access-groups/:id/nodes
 * Body: { nodeAccess: Array<{ nodeId: string; departmentIds: string[] }> }
 */
router.put('/:id/nodes', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { nodeAccess } = req.body;
    if (!Array.isArray(nodeAccess)) {
      return res.status(400).json({ error: 'nodeAccess array is required' });
    }
    await setGroupNodeAccess(req.params.id, nodeAccess, req.user.email);
    const access = await getGroupNodeAccess(req.params.id);
    res.json({ message: 'Group node access updated', access });
  } catch (error: any) {
    console.error('Set group nodes error:', error);
    if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/access-groups/:id/pages
 * Get sidebar pages the group grants access to
 */
router.get('/:id/pages', async (req, res) => {
  try {
    const group = await getGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const itemIds = await getGroupPageAccess(req.params.id);
    res.json({ itemIds });
  } catch (error: any) {
    console.error('Get group pages error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * PUT /api/access-groups/:id/pages
 * Body: { itemIds: string[] } - dashboard, admin:nodes, etc. (not report:uuid)
 */
router.put('/:id/pages', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds array is required' });
    }
    await setGroupPageAccess(req.params.id, itemIds, req.user.email);
    const pages = await getGroupPageAccess(req.params.id);
    res.json({ message: 'Group page access updated', itemIds: pages });
  } catch (error: any) {
    console.error('Set group pages error:', error);
    if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
