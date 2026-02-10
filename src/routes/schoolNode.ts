/**
 * School Node Assignment Route (separate route for /schools/:id/:source/node)
 */

import express from 'express';
import { getNodeForSchool } from '../services/SchoolService';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = express.Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /schools/:schoolId/:source/node
 * Get node assignment for a school
 */
router.get('/:schoolId/:source/node', async (req, res) => {
  try {
    const { schoolId, source } = req.params;
    
    if (source !== 'nex' && source !== 'mb') {
      return res.status(400).json({ error: 'source must be "nex" or "mb"' });
    }
    
    const assignment = await getNodeForSchool(schoolId, source as 'nex' | 'mb');
    
    if (!assignment) {
      return res.status(404).json({ error: 'School is not assigned to any node' });
    }
    
    res.json({
      schoolId: assignment.School_ID,
      nodeId: assignment.Node_ID,
      schoolSource: assignment.School_Source,
    });
  } catch (error: any) {
    console.error('Get school node error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
