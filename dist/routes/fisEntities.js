/**
 * FIS Entity Management Routes (Admin only)
 */
import express from 'express';
import { getAllFisEntities, getFisEntityByCode, createFisEntity, updateFisEntity, } from '../services/FisEntityService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);
router.get('/', async (req, res) => {
    try {
        const activeOnly = req.query.activeOnly === 'true';
        const entities = await getAllFisEntities(activeOnly);
        res.json(entities);
    }
    catch (error) {
        console.error('Get FIS entities error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
});
router.get('/:code', async (req, res) => {
    try {
        const entity = await getFisEntityByCode(req.params.code);
        if (!entity)
            return res.status(404).json({ error: 'Entity not found' });
        res.json(entity);
    }
    catch (error) {
        console.error('Get FIS entity error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
});
router.post('/', async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ error: 'Authentication required' });
        const { entityCode, entityName, status } = req.body;
        if (!entityCode || !entityName) {
            return res.status(400).json({ error: 'entityCode and entityName are required' });
        }
        const entity = await createFisEntity({
            entityCode,
            entityName,
            status,
            createdBy: req.user.email,
        });
        res.status(201).json(entity);
    }
    catch (error) {
        console.error('Create FIS entity error:', error);
        const msg = error instanceof Error ? error.message : 'Internal server error';
        if (msg.includes('already exists'))
            return res.status(400).json({ error: msg });
        res.status(500).json({ error: msg });
    }
});
router.put('/:code', async (req, res) => {
    try {
        if (!req.user)
            return res.status(401).json({ error: 'Authentication required' });
        const { entityName, status } = req.body;
        const entity = await updateFisEntity(req.params.code, {
            entityName,
            status,
            updatedBy: req.user.email,
        });
        res.json(entity);
    }
    catch (error) {
        console.error('Update FIS entity error:', error);
        const msg = error instanceof Error ? error.message : 'Internal server error';
        if (msg === 'Entity not found')
            return res.status(404).json({ error: msg });
        res.status(500).json({ error: msg });
    }
});
export default router;
//# sourceMappingURL=fisEntities.js.map