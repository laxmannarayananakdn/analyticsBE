/**
 * ManageBac API Routes
 * Exposes ManageBac operations via REST API
 */
import { Router } from 'express';
import { manageBacService } from '../services/ManageBacService';
import { loadManageBacConfig } from '../middleware/configLoader';
const router = Router();
/**
 * Helper to get API key from request (for backward compatibility when config_id not provided)
 */
const getApiKeyFromRequest = (req) => {
    // Try header first
    const headerKey = req.headers['auth-token'] || req.headers['x-api-key'];
    if (headerKey && typeof headerKey === 'string') {
        return headerKey;
    }
    // Try body
    if (req.body && req.body.apiKey) {
        return req.body.apiKey;
    }
    // Try query parameter
    if (req.query && req.query.apiKey && typeof req.query.apiKey === 'string') {
        return req.query.apiKey;
    }
    return null;
};
/**
 * POST /api/managebac/authenticate
 * Authenticate with ManageBac API
 * Supports: config_id (preferred) or direct apiKey
 */
router.post('/authenticate', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            // Config loaded from database via middleware (fetched ONCE per request)
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
            console.log(`🔐 Authenticating with ManageBac config ID: ${req.manageBacConfig.id}, base URL: ${baseUrl}`);
        }
        else {
            // Fallback to direct API key
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({
                    error: 'API key or config_id is required. Provide config_id in query/body, or API key in header (auth-token or x-api-key), body (apiKey), or query (apiKey)'
                });
            }
            apiKey = directKey;
        }
        const result = await manageBacService.authenticate(apiKey, baseUrl);
        if (result.success) {
            res.json({ success: true, message: 'Authentication successful' });
        }
        else {
            res.status(401).json({
                success: false,
                error: result.error || 'Authentication failed',
                details: result.details
            });
        }
    }
    catch (error) {
        console.error('Error authenticating:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/school
 * Get school details
 * Supports: config_id (preferred) or direct apiKey
 */
router.get('/school', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({
                    error: 'API key or config_id is required'
                });
            }
            apiKey = directKey;
        }
        const school = await manageBacService.getSchoolDetails(apiKey, baseUrl);
        res.json(school);
    }
    catch (error) {
        console.error('Error fetching school:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/academic-years
 * Get academic years
 */
router.get('/academic-years', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const programCode = req.query.program_code;
        const data = await manageBacService.getAcademicYears(apiKey, programCode, baseUrl);
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching academic years:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/grades
 * Get grades
 */
router.get('/grades', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const academicYearId = req.query.academic_year_id;
        const data = await manageBacService.getGrades(apiKey, academicYearId, baseUrl);
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching grades:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/subjects
 * Get subjects
 */
router.get('/subjects', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const subjects = await manageBacService.getSubjects(apiKey, baseUrl);
        res.json(subjects);
    }
    catch (error) {
        console.error('Error fetching subjects:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/teachers
 * Get teachers
 */
router.get('/teachers', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const filters = {};
        if (req.query.department) {
            filters.department = req.query.department;
        }
        if (req.query.active_only === 'true') {
            filters.active_only = true;
        }
        const teachers = await manageBacService.getTeachers(apiKey, filters, baseUrl);
        res.json(teachers);
    }
    catch (error) {
        console.error('Error fetching teachers:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/students
 * Get students
 */
router.get('/students', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const filters = {};
        if (req.query.grade_id) {
            filters.grade_id = req.query.grade_id;
        }
        if (req.query.active_only === 'true') {
            filters.active_only = true;
        }
        if (req.query.academic_year_id) {
            filters.academic_year_id = req.query.academic_year_id;
        }
        const students = await manageBacService.getStudents(apiKey, filters, baseUrl);
        res.json(students);
    }
    catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/classes
 * Get classes
 */
router.get('/classes', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const classes = await manageBacService.getClasses(apiKey, baseUrl);
        res.json(classes);
    }
    catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/year-groups
 * Get year groups
 */
router.get('/year-groups', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const data = await manageBacService.getYearGroups(apiKey, baseUrl);
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching year groups:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/year-groups/:id/students
 * Get students in a year group
 * If id is "all", fetches students for all year groups
 */
router.get('/year-groups/:id/students', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const yearGroupId = req.params.id;
        const academicYearId = req.query.academic_year_id;
        const termId = req.query.term_id;
        // If id is "all", fetch students for all year groups
        if (yearGroupId === 'all') {
            const data = await manageBacService.getAllYearGroupStudents(apiKey, academicYearId, termId, baseUrl);
            res.json(data);
        }
        else {
            const data = await manageBacService.getYearGroupStudents(apiKey, yearGroupId, academicYearId, termId, baseUrl);
            res.json(data);
        }
    }
    catch (error) {
        console.error('Error fetching year group students:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/memberships
 * Get memberships
 */
router.get('/memberships', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const userIdsParam = req.query.user_ids;
        const userIds = userIdsParam ? userIdsParam.split(',').map(id => parseInt(id)) : [];
        const academicYearId = req.query.academic_year_id;
        const termId = req.query.term_id;
        const gradeNumber = req.query.grade_number ? parseInt(req.query.grade_number) : undefined;
        // Default to grade_number = 13 if not specified
        const finalGradeNumber = gradeNumber !== undefined ? gradeNumber : 13;
        const data = await manageBacService.getMemberships(apiKey, userIds, academicYearId, termId, baseUrl, finalGradeNumber);
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching memberships:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
/**
 * GET /api/managebac/classes/:classId/term-grades/:termId
 * Get term grades for a class and term
 */
router.get('/classes/:classId/term-grades/:termId', loadManageBacConfig, async (req, res) => {
    try {
        let apiKey;
        let baseUrl;
        if (req.manageBacConfig) {
            apiKey = req.manageBacConfig.api_token;
            baseUrl = req.manageBacConfig.base_url;
        }
        else {
            const directKey = getApiKeyFromRequest(req);
            if (!directKey) {
                return res.status(400).json({ error: 'API key or config_id is required' });
            }
            apiKey = directKey;
        }
        const classId = parseInt(req.params.classId);
        const termId = parseInt(req.params.termId);
        if (isNaN(classId) || isNaN(termId)) {
            return res.status(400).json({ error: 'Invalid class ID or term ID' });
        }
        const data = await manageBacService.getTermGrades(apiKey, classId, termId, baseUrl);
        res.json(data);
    }
    catch (error) {
        console.error('Error fetching term grades:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});
export default router;
//# sourceMappingURL=managebac.js.map