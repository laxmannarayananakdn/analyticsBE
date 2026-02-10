/**
 * Nexquare API Routes
 * Exposes Nexquare operations via REST API
 */

import { Router, Request, Response } from 'express';
import { nexquareService } from '../services/NexquareService/index.js';
import { loadNexquareConfig } from '../middleware/configLoader.js';

const router = Router();

/**
 * POST /api/nexquare/authenticate
 * Authenticate with Nexquare API (get OAuth token)
 * Requires: config_id in query or body
 */
router.post('/authenticate', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query or body.' 
      });
    }
    
    const isValid = await nexquareService.authenticate(req.nexquareConfig);
    
    if (isValid) {
      res.json({ 
        success: true, 
        message: 'Authentication successful',
        schoolId: nexquareService.getCurrentSchoolId()
      });
    } else {
      res.status(401).json({ 
        success: false, 
        error: 'Authentication failed' 
      });
    }
  } catch (error: any) {
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
router.get('/schools', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const filter = req.query.filter as string | undefined;
    const schools = await nexquareService.getSchools(req.nexquareConfig, filter);
    
    res.json({
      success: true,
      count: schools.length,
      schools,
      currentSchoolId: nexquareService.getCurrentSchoolId()
    });
  } catch (error: any) {
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
router.get('/verify-school', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;
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
  } catch (error: any) {
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
router.get('/status', async (req: Request, res: Response) => {
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
  } catch (error: any) {
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
router.get('/students', loadNexquareConfig, async (req: Request, res: Response) => {
  // Set a longer timeout for this route (10 minutes)
  req.setTimeout(600000);
  
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;
    const filter = req.query.filter as string | undefined;
    const fetchMode = req.query.fetchMode 
      ? parseInt(req.query.fetchMode as string) 
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
  } catch (error: any) {
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
router.get('/staff', loadNexquareConfig, async (req: Request, res: Response) => {
  // Set a longer timeout for this route (10 minutes)
  req.setTimeout(600000);
  
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;
    const filter = req.query.filter as string | undefined;

    console.log(`📥 Starting staff fetch for school ${schoolId || 'default'}...`);
    const staff = await nexquareService.getStaff(req.nexquareConfig, schoolId, filter);
    
    res.json({
      success: true,
      count: staff.length,
      staff,
      schoolId: schoolId || nexquareService.getCurrentSchoolId(),
      message: `Successfully fetched ${staff.length} staff member(s)`
    });
  } catch (error: any) {
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
router.get('/classes', loadNexquareConfig, async (req: Request, res: Response) => {
  // Set a longer timeout for this route (10 minutes)
  req.setTimeout(600000);
  
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;

    console.log(`📥 Starting classes fetch for school ${schoolId || 'default'}...`);
    const classes = await nexquareService.getClasses(req.nexquareConfig, schoolId);
    
    res.json({
      success: true,
      count: classes.length,
      classes,
      schoolId: schoolId || nexquareService.getCurrentSchoolId(),
      message: `Successfully fetched ${classes.length} class(es)`
    });
  } catch (error: any) {
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
router.get('/allocation-master', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;

    const allocations = await nexquareService.getAllocationMaster(req.nexquareConfig, schoolId);
    
    res.json({
      success: true,
      count: allocations.length,
      allocations,
      schoolId: schoolId || nexquareService.getCurrentSchoolId()
    });
  } catch (error: any) {
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
router.get('/student-allocations', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;

    const allocations = await nexquareService.getStudentAllocations(req.nexquareConfig, schoolId);
    
    res.json({
      success: true,
      count: allocations.length,
      allocations,
      message: 'Student allocations fetched. Subjects, cohorts, groups, and homerooms have been extracted and saved.',
      schoolId: schoolId || nexquareService.getCurrentSchoolId()
    });
  } catch (error: any) {
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
router.get('/staff-allocations', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;

    const allocations = await nexquareService.getStaffAllocations(req.nexquareConfig, schoolId);
    
    res.json({
      success: true,
      count: allocations.length,
      allocations,
      message: 'Staff allocations fetched and saved.',
      schoolId: schoolId || nexquareService.getCurrentSchoolId()
    });
  } catch (error: any) {
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
router.get('/daily-plans', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const subject = req.query.subject as string | undefined;
    const classId = req.query.classId as string | undefined;
    const cohort = req.query.cohort as string | undefined;
    const teacher = req.query.teacher as string | undefined;
    const location = req.query.location as string | undefined;

    const plans = await nexquareService.getDailyPlans(
      req.nexquareConfig,
      schoolId,
      fromDate,
      toDate,
      subject,
      classId,
      cohort,
      teacher,
      location
    );
    
    res.json({
      success: true,
      count: plans.length,
      plans,
      message: 'Daily plans fetched and saved.',
      schoolId: schoolId || nexquareService.getCurrentSchoolId()
    });
  } catch (error: any) {
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
router.get('/daily-attendance', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const categoryRequired = req.query.categoryRequired === 'true' || req.query.categoryRequired === 'True';
    const rangeType = req.query.rangeType ? parseInt(req.query.rangeType as string) : 0;
    const studentSourcedId = req.query.studentSourcedId as string | undefined;

    const attendance = await nexquareService.getDailyAttendance(
      req.nexquareConfig,
      schoolId,
      startDate,
      endDate,
      categoryRequired,
      rangeType,
      studentSourcedId
    );
    
    res.json({
      success: true,
      count: attendance.length,
      attendance,
      message: 'Daily attendance fetched and saved.',
      schoolId: schoolId || nexquareService.getCurrentSchoolId()
    });
  } catch (error: any) {
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
router.get('/lesson-attendance', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const categoryRequired = req.query.categoryRequired === 'true' || req.query.categoryRequired === 'True';
    const rangeType = req.query.rangeType ? parseInt(req.query.rangeType as string) : 0;
    const studentSourcedId = req.query.studentSourcedId as string | undefined;

    const attendance = await nexquareService.getLessonAttendance(
      req.nexquareConfig,
      schoolId,
      startDate,
      endDate,
      categoryRequired,
      rangeType,
      studentSourcedId
    );
    
    res.json({
      success: true,
      count: attendance.length,
      attendance,
      message: 'Lesson attendance fetched and saved.',
      schoolId: schoolId || nexquareService.getCurrentSchoolId()
    });
  } catch (error: any) {
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
router.get('/student-assessments', loadNexquareConfig, async (req: Request, res: Response) => {
  try {
    if (!req.nexquareConfig) {
      return res.status(400).json({ 
        error: 'config_id is required. Provide config_id in query.' 
      });
    }
    
    const schoolId = req.query.schoolId as string | undefined;
    const academicYear = req.query.academicYear as string | undefined;
    const fileName = req.query.fileName as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10000;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const assessments = await nexquareService.getStudentAssessments(
      req.nexquareConfig,
      schoolId,
      academicYear,
      fileName,
      limit,
      offset
    );
    
    res.json({
      success: true,
      count: assessments.length,
      assessments,
      message: 'Student assessments fetched and saved from CSV.',
      schoolId: schoolId || nexquareService.getCurrentSchoolId(),
      academicYear: academicYear || new Date().getFullYear().toString()
    });
  } catch (error: any) {
    console.error('Error fetching student assessments:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

export default router;
