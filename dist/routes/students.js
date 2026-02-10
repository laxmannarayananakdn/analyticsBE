/**
 * Students API Routes
 */
import { Router } from 'express';
import { databaseService } from '../services/DatabaseService';
const router = Router();
/**
 * GET /api/students
 * Get all students with optional filters
 */
router.get('/', async (req, res) => {
    try {
        const filters = {};
        if (req.query.archived !== undefined) {
            filters.archived = req.query.archived === 'true';
        }
        if (req.query.grade_id) {
            filters.grade_id = parseInt(req.query.grade_id);
        }
        if (req.query.year_group_id) {
            filters.year_group_id = parseInt(req.query.year_group_id);
        }
        const result = await databaseService.getStudents(undefined, filters);
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        res.json(result.data || []);
    }
    catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * POST /api/students
 * Create or update students (bulk)
 */
router.post('/', async (req, res) => {
    try {
        const students = Array.isArray(req.body) ? req.body : [req.body];
        if (students.length === 0) {
            return res.status(400).json({ error: 'No students provided' });
        }
        const result = await databaseService.upsertStudents(students);
        if (result.error && !result.data) {
            return res.status(500).json({ error: result.error });
        }
        res.status(201).json({
            data: result.data,
            errors: result.error ? [result.error] : []
        });
    }
    catch (error) {
        console.error('Error upserting students:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=students.js.map