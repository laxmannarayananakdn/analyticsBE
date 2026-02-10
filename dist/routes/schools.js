/**
 * Schools API Routes
 */
import { Router } from 'express';
import { databaseService } from '../services/DatabaseService';
const router = Router();
/**
 * GET /api/schools/:id
 * Get school by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const schoolId = parseInt(req.params.id);
        if (isNaN(schoolId)) {
            return res.status(400).json({ error: 'Invalid school ID' });
        }
        const result = await databaseService.getSchool(schoolId);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        if (!result.data) {
            return res.status(404).json({ error: 'School not found' });
        }
        res.json(result.data);
    }
    catch (error) {
        console.error('Error fetching school:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * POST /api/schools
 * Create or update school
 */
router.post('/', async (req, res) => {
    try {
        const school = req.body;
        if (!school.id || !school.name) {
            return res.status(400).json({ error: 'School ID and name are required' });
        }
        const result = await databaseService.upsertSchool(school);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.status(201).json(result.data);
    }
    catch (error) {
        console.error('Error upserting school:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=schools.js.map