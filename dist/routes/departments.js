/**
 * Department Management Routes (Admin only)
 */
import express from 'express';
import { getAllDepartments, getDepartmentById, createDepartment, updateDepartment, } from '../services/DepartmentService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
const router = express.Router();
// All routes require authentication and admin access
router.use(authenticate);
router.use(requireAdmin);
/**
 * POST /departments
 * Create a new department
 */
router.post('/', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { departmentId, departmentName, departmentDescription, schemaName, displayOrder } = req.body;
        if (!departmentId || !departmentName) {
            return res.status(400).json({ error: 'departmentId and departmentName are required' });
        }
        const department = await createDepartment({
            departmentId,
            departmentName,
            departmentDescription,
            schemaName,
            displayOrder,
            createdBy: req.user.email,
        });
        res.status(201).json({
            departmentId: department.Department_ID,
            departmentName: department.Department_Name,
            departmentDescription: department.Department_Description,
            schemaName: department.Schema_Name,
            displayOrder: department.Display_Order,
        });
    }
    catch (error) {
        console.error('Create department error:', error);
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /departments
 * Get all departments (ordered by Display_Order)
 */
router.get('/', async (req, res) => {
    try {
        const departments = await getAllDepartments();
        res.json(departments.map(d => ({
            departmentId: d.Department_ID,
            departmentName: d.Department_Name,
            departmentDescription: d.Department_Description,
            schemaName: d.Schema_Name,
            displayOrder: d.Display_Order,
        })));
    }
    catch (error) {
        console.error('Get departments error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /departments/:id
 * Get department by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const department = await getDepartmentById(id);
        if (!department) {
            return res.status(404).json({ error: 'Department not found' });
        }
        res.json({
            departmentId: department.Department_ID,
            departmentName: department.Department_Name,
            departmentDescription: department.Department_Description,
            schemaName: department.Schema_Name,
            displayOrder: department.Display_Order,
        });
    }
    catch (error) {
        console.error('Get department error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * PUT /departments/:id
 * Update department
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { departmentName, departmentDescription, schemaName, displayOrder } = req.body;
        const department = await updateDepartment(id, {
            departmentName,
            departmentDescription,
            schemaName,
            displayOrder,
        });
        res.json({
            departmentId: department.Department_ID,
            departmentName: department.Department_Name,
            departmentDescription: department.Department_Description,
            schemaName: department.Schema_Name,
            displayOrder: department.Display_Order,
        });
    }
    catch (error) {
        console.error('Update department error:', error);
        if (error.message === 'Department not found') {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
// Note: No DELETE endpoint - deletion is prevented by database trigger
export default router;
//# sourceMappingURL=departments.js.map