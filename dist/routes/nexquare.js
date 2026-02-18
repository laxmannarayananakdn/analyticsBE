/**
 * Nexquare API Routes
 * Exposes Nexquare operations via REST API
 */
import { Router } from 'express';
import { nexquareService } from '../services/NexquareService/index.js';
import { loadNexquareConfig } from '../middleware/configLoader.js';
import { executeQuery } from '../config/database.js';
const router = Router();
/**
 * POST /api/nexquare/authenticate
 * Authenticate with Nexquare API (get OAuth token)
 * Requires: config_id in query or body
 */
router.post('/authenticate', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query or body.'
            });
        }
        const isValid = await nexquareService.authenticate(req.nexquareConfig);
        if (isValid) {
            // Fetch schools so we can return the first school's ID for the sync UI to pre-fill
            try {
                await nexquareService.getSchools(req.nexquareConfig);
            }
            catch (_) {
                // Ignore; schoolId will be null and user can run Get Schools or enter manually
            }
            res.json({
                success: true,
                message: 'Authentication successful',
                schoolId: nexquareService.getCurrentSchoolId()
            });
        }
        else {
            res.status(401).json({
                success: false,
                error: 'Authentication failed'
            });
        }
    }
    catch (error) {
        console.error('Error authenticating:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/schools
 * Get schools/entities from Nexquare
 * Requires: config_id in query
 */
router.get('/schools', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const filter = req.query.filter;
        const schools = await nexquareService.getSchools(req.nexquareConfig, filter);
        // Update config's school_id if empty (use first school's sourcedId)
        if (schools.length > 0 && schools[0].sourcedId) {
            const firstSchoolId = schools[0].sourcedId;
            const updateResult = await executeQuery(`UPDATE NEX.nexquare_school_configs 
         SET school_id = @schoolId, updated_at = SYSDATETIMEOFFSET() 
         WHERE id = @configId AND (school_id IS NULL OR school_id = '')`, { configId: req.nexquareConfig.id, schoolId: firstSchoolId });
            if (!updateResult.error) {
                console.log(`✅ Updated school_id (${firstSchoolId}) for Nexquare config ID ${req.nexquareConfig.id}`);
            }
        }
        res.json({
            success: true,
            count: schools.length,
            schools,
            currentSchoolId: nexquareService.getCurrentSchoolId()
        });
    }
    catch (error) {
        console.error('Error fetching schools:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/verify-school
 * Verify access to a specific school
 * Requires: config_id and schoolId in query
 */
router.get('/verify-school', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        if (!schoolId) {
            return res.status(400).json({
                error: 'schoolId is required in query parameters'
            });
        }
        const hasAccess = await nexquareService.verifySchoolAccess(req.nexquareConfig, schoolId);
        res.json({
            success: hasAccess,
            schoolId: schoolId,
            message: hasAccess
                ? 'School access verified'
                : 'School not found or not accessible'
        });
    }
    catch (error) {
        console.error('Error verifying school access:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/status
 * Get current service status
 */
router.get('/status', async (req, res) => {
    try {
        const schoolId = nexquareService.getCurrentSchoolId();
        res.json({
            success: true,
            authenticated: true,
            schoolId: schoolId,
            message: schoolId
                ? `Connected to school: ${schoolId}`
                : 'Connected but no school ID set'
        });
    }
    catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/students
 * Get students from Nexquare
 * Requires: config_id in query
 */
router.get('/students', loadNexquareConfig, async (req, res) => {
    // Set a longer timeout for this route (10 minutes)
    req.setTimeout(600000);
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const filter = req.query.filter;
        const fetchMode = req.query.fetchMode
            ? parseInt(req.query.fetchMode)
            : 1; // 1=enrolled, 2=preadmission, 3=both
        console.log(`📥 Starting student fetch for school ${schoolId || 'default'}...`);
        const students = await nexquareService.getStudents(req.nexquareConfig, schoolId, filter, fetchMode);
        res.json({
            success: true,
            count: students.length,
            students,
            schoolId: schoolId || nexquareService.getCurrentSchoolId(),
            message: `Successfully fetched ${students.length} student(s)`
        });
    }
    catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            message: 'Failed to fetch students. Check server logs for details.'
        });
    }
});
/**
 * GET /api/nexquare/staff
 * Get staff/teachers from Nexquare
 * Requires: config_id in query
 */
router.get('/staff', loadNexquareConfig, async (req, res) => {
    // Set a longer timeout for this route (10 minutes)
    req.setTimeout(600000);
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const filter = req.query.filter;
        console.log(`📥 Starting staff fetch for school ${schoolId || 'default'}...`);
        const staff = await nexquareService.getStaff(req.nexquareConfig, schoolId, filter);
        res.json({
            success: true,
            count: staff.length,
            staff,
            schoolId: schoolId || nexquareService.getCurrentSchoolId(),
            message: `Successfully fetched ${staff.length} staff member(s)`
        });
    }
    catch (error) {
        console.error('Error fetching staff:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            message: 'Failed to fetch staff. Check server logs for details.'
        });
    }
});
/**
 * GET /api/nexquare/classes
 * Get classes from Nexquare
 * Requires: config_id in query
 */
router.get('/classes', loadNexquareConfig, async (req, res) => {
    // Set a longer timeout for this route (10 minutes)
    req.setTimeout(600000);
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        console.log(`📥 Starting classes fetch for school ${schoolId || 'default'}...`);
        const classes = await nexquareService.getClasses(req.nexquareConfig, schoolId);
        res.json({
            success: true,
            count: classes.length,
            classes,
            schoolId: schoolId || nexquareService.getCurrentSchoolId(),
            message: `Successfully fetched ${classes.length} class(es)`
        });
    }
    catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            message: 'Failed to fetch classes. Check server logs for details.'
        });
    }
});
/**
 * GET /api/nexquare/allocation-master
 * Get allocation master data from Nexquare
 * Requires: config_id in query
 */
router.get('/allocation-master', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const allocations = await nexquareService.getAllocationMaster(req.nexquareConfig, schoolId);
        res.json({
            success: true,
            count: allocations.length,
            allocations,
            schoolId: schoolId || nexquareService.getCurrentSchoolId()
        });
    }
    catch (error) {
        console.error('Error fetching allocation master:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/student-allocations
 * Get student allocations and extract subjects, cohorts, groups, homerooms
 * Requires: config_id in query
 */
router.get('/student-allocations', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const allocations = await nexquareService.getStudentAllocations(req.nexquareConfig, schoolId);
        res.json({
            success: true,
            count: allocations.length,
            allocations,
            message: 'Student allocations fetched. Subjects, cohorts, groups, and homerooms have been extracted and saved.',
            schoolId: schoolId || nexquareService.getCurrentSchoolId()
        });
    }
    catch (error) {
        console.error('Error fetching student allocations:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/staff-allocations
 * Get staff allocations
 * Requires: config_id in query
 */
router.get('/staff-allocations', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const allocations = await nexquareService.getStaffAllocations(req.nexquareConfig, schoolId);
        res.json({
            success: true,
            count: allocations.length,
            allocations,
            message: 'Staff allocations fetched and saved.',
            schoolId: schoolId || nexquareService.getCurrentSchoolId()
        });
    }
    catch (error) {
        console.error('Error fetching staff allocations:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/daily-plans
 * Get daily plans (timetable data)
 * Note: Date range limited to 1 week per API call
 * Requires: config_id in query
 */
router.get('/daily-plans', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const fromDate = req.query.fromDate;
        const toDate = req.query.toDate;
        const subject = req.query.subject;
        const classId = req.query.classId;
        const cohort = req.query.cohort;
        const teacher = req.query.teacher;
        const location = req.query.location;
        const plans = await nexquareService.getDailyPlans(req.nexquareConfig, schoolId, fromDate, toDate, subject, classId, cohort, teacher, location);
        res.json({
            success: true,
            count: plans.length,
            plans,
            message: 'Daily plans fetched and saved.',
            schoolId: schoolId || nexquareService.getCurrentSchoolId()
        });
    }
    catch (error) {
        console.error('Error fetching daily plans:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/daily-attendance
 * Get daily attendance records
 * Fetches in monthly chunks to handle large datasets
 * Requires: config_id in query
 */
router.get('/daily-attendance', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const categoryRequired = req.query.categoryRequired === 'true' || req.query.categoryRequired === 'True';
        const rangeType = req.query.rangeType ? parseInt(req.query.rangeType) : 0;
        const studentSourcedId = req.query.studentSourcedId;
        const attendance = await nexquareService.getDailyAttendance(req.nexquareConfig, schoolId, startDate, endDate, categoryRequired, rangeType, studentSourcedId);
        res.json({
            success: true,
            count: attendance.length,
            attendance,
            message: 'Daily attendance fetched and saved.',
            schoolId: schoolId || nexquareService.getCurrentSchoolId()
        });
    }
    catch (error) {
        console.error('Error fetching daily attendance:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/lesson-attendance
 * Get lesson attendance records
 * Fetches in monthly chunks to handle large datasets
 * Requires: config_id in query
 */
router.get('/lesson-attendance', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const categoryRequired = req.query.categoryRequired === 'true' || req.query.categoryRequired === 'True';
        const rangeType = req.query.rangeType ? parseInt(req.query.rangeType) : 0;
        const studentSourcedId = req.query.studentSourcedId;
        const attendance = await nexquareService.getLessonAttendance(req.nexquareConfig, schoolId, startDate, endDate, categoryRequired, rangeType, studentSourcedId);
        res.json({
            success: true,
            count: attendance.length,
            attendance,
            message: 'Lesson attendance fetched and saved.',
            schoolId: schoolId || nexquareService.getCurrentSchoolId()
        });
    }
    catch (error) {
        console.error('Error fetching lesson attendance:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
/**
 * GET /api/nexquare/student-assessments
 * Get student assessment/grade book data
 * Fetches CSV file from API, parses it, and saves to database
 * Requires: config_id in query
 */
router.get('/student-assessments', loadNexquareConfig, async (req, res) => {
    try {
        if (!req.nexquareConfig) {
            return res.status(400).json({
                error: 'config_id is required. Provide config_id in query.'
            });
        }
        const schoolId = req.query.schoolId;
        const academicYear = req.query.academicYear;
        const fileName = req.query.fileName;
        const limit = req.query.limit ? parseInt(req.query.limit) : 10000;
        const offset = req.query.offset ? parseInt(req.query.offset) : 0;
        const assessments = await nexquareService.getStudentAssessments(req.nexquareConfig, schoolId, academicYear, fileName, limit, offset);
        res.json({
            success: true,
            count: assessments.length,
            assessments,
            message: 'Student assessments fetched and saved from CSV.',
            schoolId: schoolId || nexquareService.getCurrentSchoolId(),
            academicYear: academicYear || new Date().getFullYear().toString()
        });
    }
    catch (error) {
        console.error('Error fetching student assessments:', error);
        res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
});
export default router;
//# sourceMappingURL=nexquare.js.map