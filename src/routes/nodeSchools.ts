/**
 * School Assignment Routes (Admin only)
 */

import express from 'express';
import {
  getSchoolsByNode,
  assignSchoolToNode,
  unassignSchoolFromNode,
} from '../services/SchoolService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

/**
 * POST /nodes/:nodeId/schools
 * Assign school to node
 */
router.post('/:nodeId/schools', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { nodeId } = req.params;
    const { schoolId, schoolSource } = req.body;
    
    if (!schoolId || !schoolSource) {
      return res.status(400).json({ error: 'schoolId and schoolSource are required' });
    }
    
    if (schoolSource !== 'nex' && schoolSource !== 'mb') {
      return res.status(400).json({ error: 'schoolSource must be "nex" or "mb"' });
    }
    
    const assignment = await assignSchoolToNode(nodeId, {
      schoolId,
      schoolSource,
      createdBy: req.user.email,
    });
    
    res.status(201).json({
      schoolId: assignment.School_ID,
      nodeId: assignment.Node_ID,
      schoolSource: assignment.School_Source,
    });
  } catch (error: any) {
    console.error('Assign school error:', error);
    if (error.message.includes('already assigned') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /nodes/:nodeId/schools
 * Get schools assigned to node
 */
router.get('/:nodeId/schools', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const schools = await getSchoolsByNode(nodeId);
    
    res.json(schools.map(s => ({
      schoolId: s.School_ID,
      nodeId: s.Node_ID,
      schoolSource: s.School_Source,
    })));
  } catch (error: any) {
    console.error('Get schools error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * DELETE /nodes/:nodeId/schools/:schoolId/:source
 * Unassign school from node
 */
router.delete('/:nodeId/schools/:schoolId/:source', async (req, res) => {
  try {
    const { nodeId, schoolId, source } = req.params;
    
    if (source !== 'nex' && source !== 'mb') {
      return res.status(400).json({ error: 'source must be "nex" or "mb"' });
    }
    
    await unassignSchoolFromNode(nodeId, schoolId, source as 'nex' | 'mb');
    
    res.json({ message: 'School unassigned successfully' });
  } catch (error: any) {
    console.error('Unassign school error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});


export default router;
