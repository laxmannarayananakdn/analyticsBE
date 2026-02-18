/**
 * Report Groups Routes (Admin only)
 */
import express from 'express';
import { getAllReportGroups, getReportGroupById, createReportGroup, updateReportGroup, deleteReportGroup, getReportGroupReports, setReportGroupReports, } from '../services/ReportGroupService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);
/**
 * GET /api/report-groups
 */
router.get('/', async (req, res) => {
    try {
        const groups = await getAllReportGroups();
        res.json(groups.map((g) => ({
            reportGroupId: g.Report_Group_ID,
            groupName: g.Group_Name,
            groupDescription: g.Group_Description,
        })));
    }
    catch (error) {
        console.error('Get report groups error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * POST /api/report-groups
 */
router.post('/', async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ error: 'Authentication required' });
        const { reportGroupId, groupName, groupDescription } = req.body;
        if (!reportGroupId || !groupName) {
            return res.status(400).json({ error: 'reportGroupId and groupName are required' });
        }
        const group = await createReportGroup(reportGroupId, groupName, groupDescription || null, req.user.email);
        res.status(201).json({
            reportGroupId: group.Report_Group_ID,
            groupName: group.Group_Name,
            groupDescription: group.Group_Description,
        });
    }
    catch (error) {
        console.error('Create report group error:', error);
        if (error.message.includes('PRIMARY KEY') || error.message.includes('already exists')) {
            return res.status(400).json({ error: 'Report group ID already exists' });
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/report-groups/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const group = await getReportGroupById(req.params.id);
        if (!group)
            return res.status(404).json({ error: 'Report group not found' });
        res.json({
            reportGroupId: group.Report_Group_ID,
            groupName: group.Group_Name,
            groupDescription: group.Group_Description,
        });
    }
    catch (error) {
        console.error('Get report group error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * PUT /api/report-groups/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const { groupName, groupDescription } = req.body;
        if (!groupName)
            return res.status(400).json({ error: 'groupName is required' });
        const group = await updateReportGroup(req.params.id, groupName, groupDescription || null);
        res.json({
            reportGroupId: group.Report_Group_ID,
            groupName: group.Group_Name,
            groupDescription: group.Group_Description,
        });
    }
    catch (error) {
        console.error('Update report group error:', error);
        if (error.message === 'Report group not found')
            return res.status(404).json({ error: error.message });
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * DELETE /api/report-groups/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await deleteReportGroup(req.params.id);
        res.json({ message: 'Report group deleted successfully' });
    }
    catch (error) {
        console.error('Delete report group error:', error);
        if (error.message === 'Report group not found')
            return res.status(404).json({ error: error.message });
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/report-groups/:id/reports
 */
router.get('/:id/reports', async (req, res) => {
    try {
        const group = await getReportGroupById(req.params.id);
        if (!group)
            return res.status(404).json({ error: 'Report group not found' });
        const dashboardUuids = await getReportGroupReports(req.params.id);
        res.json({ dashboardUuids });
    }
    catch (error) {
        console.error('Get report group reports error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * PUT /api/report-groups/:id/reports
 * Body: { dashboardUuids: string[] }
 */
router.put('/:id/reports', async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ error: 'Authentication required' });
        const { dashboardUuids } = req.body;
        if (!Array.isArray(dashboardUuids)) {
            return res.status(400).json({ error: 'dashboardUuids array is required' });
        }
        await setReportGroupReports(req.params.id, dashboardUuids, req.user.email);
        const uuids = await getReportGroupReports(req.params.id);
        res.json({ message: 'Report group reports updated', dashboardUuids: uuids });
    }
    catch (error) {
        console.error('Set report group reports error:', error);
        if (error.message.includes('not found'))
            return res.status(404).json({ error: error.message });
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=reportGroups.js.map