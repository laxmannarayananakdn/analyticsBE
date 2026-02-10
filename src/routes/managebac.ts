/**
 * ManageBac API Routes
 * Exposes ManageBac operations via REST API
 */

import { Router, Request, Response } from 'express';
import { manageBacService } from '../services/ManageBacService.js';
import { databaseService } from '../services/DatabaseService.js';
import { loadManageBacConfig } from '../middleware/configLoader.js';

const router = Router();

/**
 * Helper to get API key from request (for backward compatibility when config_id not provided)
 */
const getApiKeyFromRequest = (req: Request): string | null => {
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
router.post('/authenticate', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      // Config loaded from database via middleware (fetched ONCE per request)
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
      console.log(`🔐 Authenticating with ManageBac config ID: ${req.manageBacConfig.id}, base URL: ${baseUrl}`);
    } else {
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
    } else {
      res.status(401).json({ 
        success: false, 
        error: result.error || 'Authentication failed',
        details: result.details 
      });
    }
  } catch (error: any) {
    console.error('Error authenticating:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/school
 * Get school details
 * Supports: config_id (preferred) or direct apiKey
 */
router.get('/school', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
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
  } catch (error: any) {
    console.error('Error fetching school:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/academic-years
 * Get academic years
 */
router.get('/academic-years', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const programCode = req.query.program_code as string | undefined;
    const data = await manageBacService.getAcademicYears(apiKey, programCode, baseUrl);
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching academic years:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/grades
 * Get grades
 */
router.get('/grades', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const academicYearId = req.query.academic_year_id as string | undefined;
    const data = await manageBacService.getGrades(apiKey, academicYearId, baseUrl);
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching grades:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/subjects
 * Get subjects
 */
router.get('/subjects', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const subjects = await manageBacService.getSubjects(apiKey, baseUrl);
    res.json(subjects);
  } catch (error: any) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/teachers
 * Get teachers
 */
router.get('/teachers', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const filters: { department?: string; active_only?: boolean } = {};
    if (req.query.department) {
      filters.department = req.query.department as string;
    }
    if (req.query.active_only === 'true') {
      filters.active_only = true;
    }
    
    const teachers = await manageBacService.getTeachers(apiKey, filters, baseUrl);
    res.json(teachers);
  } catch (error: any) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/students
 * Get students
 */
router.get('/students', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const filters: { grade_id?: string; active_only?: boolean; academic_year_id?: string } = {};
    if (req.query.grade_id) {
      filters.grade_id = req.query.grade_id as string;
    }
    if (req.query.active_only === 'true') {
      filters.active_only = true;
    }
    if (req.query.academic_year_id) {
      filters.academic_year_id = req.query.academic_year_id as string;
    }
    
    const students = await manageBacService.getStudents(apiKey, filters, baseUrl);
    res.json(students);
  } catch (error: any) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/classes
 * Get classes
 */
router.get('/classes', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const classes = await manageBacService.getClasses(apiKey, baseUrl);
    res.json(classes);
  } catch (error: any) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/year-groups
 * Get year groups
 */
router.get('/year-groups', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const data = await manageBacService.getYearGroups(apiKey, baseUrl);
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching year groups:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/year-groups/:id/students
 * Get students in a year group
 * If id is "all", fetches students for all year groups
 */
router.get('/year-groups/:id/students', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const yearGroupId = req.params.id;
    const academicYearId = req.query.academic_year_id as string | undefined;
    const termId = req.query.term_id as string | undefined;
    
    // If id is "all", fetch students for all year groups
    if (yearGroupId === 'all') {
      const data = await manageBacService.getAllYearGroupStudents(apiKey, academicYearId, termId, baseUrl);
      res.json(data);
    } else {
      const data = await manageBacService.getYearGroupStudents(apiKey, yearGroupId, academicYearId, termId, baseUrl);
      res.json(data);
    }
  } catch (error: any) {
    console.error('Error fetching year group students:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/memberships
 * Get memberships and save them to the database
 */
router.get('/memberships', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
      const directKey = getApiKeyFromRequest(req);
      if (!directKey) {
        return res.status(400).json({ error: 'API key or config_id is required' });
      }
      apiKey = directKey;
    }
    
    const userIdsParam = req.query.user_ids as string | undefined;
    const userIds = userIdsParam ? userIdsParam.split(',').map(id => parseInt(id)) : [];
    const academicYearId = req.query.academic_year_id as string | undefined;
    const termId = req.query.term_id as string | undefined;
    const gradeNumber = req.query.grade_number ? parseInt(req.query.grade_number as string) : undefined;
    
    // Default to grade_number = 13 if not specified
    const finalGradeNumber = gradeNumber !== undefined ? gradeNumber : 13;
    
    // Fetch memberships from API
    const data = await manageBacService.getMemberships(apiKey, userIds, academicYearId, termId, baseUrl, finalGradeNumber);
    
    // Extract memberships array from response
    let memberships: any[] = [];
    if (data?.memberships) {
      memberships = Array.isArray(data.memberships) ? data.memberships : [];
    } else if (data?.data?.memberships) {
      memberships = Array.isArray(data.data.memberships) ? data.data.memberships : [];
    } else if (Array.isArray(data)) {
      memberships = data;
    }
    
    if (memberships.length === 0) {
      console.log('No memberships found in response');
      return res.json({
        ...data,
        saved: false,
        message: 'No memberships to save'
      });
    }
    
    console.log(`💾 Processing ${memberships.length} memberships for database save...`);
    
    // Ensure school ID is set
    if (!manageBacService['currentSchoolId']) {
      console.log('⚠️ School ID not set, fetching school details first...');
      await manageBacService.getSchoolDetails(apiKey, baseUrl);
    }
    
    const schoolId = manageBacService['currentSchoolId'];
    if (!schoolId) {
      console.error('❌ Cannot save memberships: School ID is not available');
      return res.json({
        ...data,
        saved: false,
        error: 'School ID is not available'
      });
    }
    
    // Track classes we've already fetched and saved
    const fetchedClassIds = new Set<number>();
    const membershipsForDb: any[] = [];
    let totalClassesSaved = 0;
    
    // Process each membership
    for (const membership of memberships) {
      const classId = typeof membership.class_id === 'string' 
        ? parseInt(membership.class_id, 10) 
        : membership.class_id;
      
      if (!classId) {
        console.warn(`⚠️ Membership missing class_id, skipping`);
        continue;
      }
      
      // Fetch and save class if we haven't already
      if (!fetchedClassIds.has(classId)) {
        console.log(`📖 Fetching class ${classId}...`);
        
        try {
          const classData = await manageBacService.getClassById(apiKey, classId);
          if (!classData) {
            console.warn(`⚠️ Class ${classId} not found, skipping membership`);
            continue;
          }
          
          // Map ManageBac Class to database ClassRecord
          const classForDb = {
            id: typeof classData.id === 'string' ? parseInt(classData.id, 10) : classData.id,
            school_id: schoolId,
            subject_id: classData.subject_id || null,
            name: classData.name || '',
            description: classData.description || null,
            uniq_id: classData.uniq_id || null,
            class_section: classData.class_section || null,
            language: classData.language || 'en',
            program_code: classData.program_code || '',
            grade_number: classData.grade_number || null,
            start_term_id: classData.start_term_id || null,
            end_term_id: classData.end_term_id || null,
            archived: classData.archived || false,
            lock_memberships: classData.lock_memberships || null
          };
          
          // Save class immediately
          const { error: classError } = await databaseService.upsertClasses([classForDb], schoolId);
          
          if (classError) {
            console.warn(`⚠️ Failed to save class ${classId}: ${classError}`);
            continue;
          }
          
          fetchedClassIds.add(classId);
          totalClassesSaved++;
          console.log(`✅ Saved class: ${classData.name}`);
        } catch (error: any) {
          console.warn(`⚠️ Failed to fetch class ${classId}: ${error.message}`);
          continue;
        }
      }
      
      // Add membership to batch
      const userId = typeof membership.user_id === 'string' 
        ? parseInt(membership.user_id, 10) 
        : membership.user_id;
      
      if (!userId) {
        console.warn(`⚠️ Membership missing user_id, skipping`);
        continue;
      }
      
      membershipsForDb.push({
        class_id: classId,
        user_id: userId,
        role: membership.role || 'Student',
        level: membership.level !== undefined ? membership.level : null,
        show_on_reports: membership.show_on_reports !== undefined ? membership.show_on_reports : true,
        first_joined_at: membership.created_at ? new Date(membership.created_at) : null
      });
    }
    
    // Save all memberships to database
    let totalMembershipsSaved = 0;
    if (membershipsForDb.length > 0) {
      console.log(`💾 Saving ${membershipsForDb.length} memberships to database...`);
      const { error: membershipsError } = await databaseService.upsertClassMemberships(membershipsForDb);
      
      if (membershipsError) {
        console.error(`❌ Failed to save memberships: ${membershipsError}`);
        return res.json({
          ...data,
          saved: false,
          error: membershipsError,
          classesSaved: totalClassesSaved,
          membershipsProcessed: membershipsForDb.length
        });
      } else {
        totalMembershipsSaved = membershipsForDb.length;
        console.log(`✅ Successfully saved ${totalMembershipsSaved} memberships to database`);
      }
    }
    
    // Return response with save status
    res.json({
      ...data,
      saved: true,
      classesSaved: totalClassesSaved,
      membershipsSaved: totalMembershipsSaved,
      message: `Successfully saved ${totalMembershipsSaved} memberships and ${totalClassesSaved} classes`
    });
  } catch (error: any) {
    console.error('Error fetching memberships:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/managebac/classes/:classId/term-grades/:termId
 * Get term grades for a class and term
 */
router.get('/classes/:classId/term-grades/:termId', loadManageBacConfig, async (req: Request, res: Response) => {
  try {
    let apiKey: string;
    let baseUrl: string | undefined;
    
    if (req.manageBacConfig) {
      apiKey = req.manageBacConfig.api_token;
      baseUrl = req.manageBacConfig.base_url;
    } else {
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
  } catch (error: any) {
    console.error('Error fetching term grades:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;

