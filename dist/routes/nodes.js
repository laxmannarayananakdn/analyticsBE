/**
 * Node Management Routes (Admin only)
 */
import express from 'express';
import { getAllNodes, getNodeById, getNodesTree, createNode, updateNode, } from '../services/NodeService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
const router = express.Router();
// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);
/**
 * POST /nodes
 * Create a new node
 */
router.post('/', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { nodeId, nodeDescription, isHeadOffice, isSchoolNode, parentNodeId } = req.body;
        if (!nodeId || !nodeDescription) {
            return res.status(400).json({ error: 'nodeId and nodeDescription are required' });
        }
        const node = await createNode({
            nodeId,
            nodeDescription,
            isHeadOffice,
            isSchoolNode,
            parentNodeId: parentNodeId || null,
            createdBy: req.user.email,
        });
        res.status(201).json({
            nodeId: node.nodeId,
            nodeDescription: node.nodeDescription,
            isHeadOffice: node.isHeadOffice,
            isSchoolNode: node.isSchoolNode,
            parentNodeId: node.parentNodeId,
        });
    }
    catch (error) {
        console.error('Create node error:', error);
        if (error.message.includes('already exists') || error.message.includes('not found')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /nodes
 * Get all nodes (as tree structure if ?tree=true)
 */
router.get('/', async (req, res) => {
    try {
        const { tree } = req.query;
        if (tree === 'true') {
            const nodesTree = await getNodesTree();
            res.json(nodesTree);
        }
        else {
            const nodes = await getAllNodes();
            res.json(nodes);
        }
    }
    catch (error) {
        console.error('Get nodes error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /nodes/:id
 * Get node by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const node = await getNodeById(id);
        if (!node) {
            return res.status(404).json({ error: 'Node not found' });
        }
        res.json(node);
    }
    catch (error) {
        console.error('Get node error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * PUT /nodes/:id
 * Update node
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nodeDescription, isHeadOffice, isSchoolNode, parentNodeId } = req.body;
        const node = await updateNode(id, {
            nodeDescription,
            isHeadOffice,
            isSchoolNode,
            parentNodeId: parentNodeId !== undefined ? (parentNodeId || null) : undefined,
        });
        res.json(node);
    }
    catch (error) {
        console.error('Update node error:', error);
        if (error.message === 'Node not found' || error.message.includes('circular')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
// Note: No DELETE endpoint - deletion is prevented by database trigger
export default router;
//# sourceMappingURL=nodes.js.map