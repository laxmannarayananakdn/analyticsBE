/**
 * Nexquare API Configuration
 * Note: Credentials are now loaded from database via config_id parameter
 * These are only constants used by the service
 */

export const NEXQUARE_CONFIG = {
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  TOKEN_EXPIRY_BUFFER: 300, // Refresh token 5 minutes before expiry (in seconds)
} as const;

export const NEXQUARE_ENDPOINTS = {
  // Authentication
  TOKEN: '/oauth2/v1/token',
  
  // Schools & Entities
  SCHOOLS: '/nexquare/ims/oneroster/v1p1/schools',
  ALLOCATION_MASTER: '/ims/oneroster/v1p1/allocationMaster',
  
  // Students
  STUDENTS: '/ims/oneroster/v1p1/schools',
  STUDENT_DETAILS: '/ims/oneroster/v1p1/users',
  STUDENT_ALLOCATIONS: '/ims/oneroster/v1p1/schools',
  
  // Staff
  STAFF: '/ims/oneroster/v1p1/schools',
  STAFF_ALLOCATIONS: '/ims/oneroster/v1p1/schools',
  
  // Classes
  CLASSES: '/ims/oneroster/v1p1/schools',
  
  // Timetables
  DAILY_PLAN: '/ims/oneroster/v1p1/dailyPlan',
  TIMETABLE_LESSON_STUDENTS: '/ims/oneroster/v1p1/timetableLesson',
  
  // Attendance
  DAILY_ATTENDANCE: '/ims/oneroster/v1p1/getDailyAttendance',
  LESSON_ATTENDANCE: '/ims/oneroster/v1p1/getLessonAttendance',
  
  // Assessments
  STUDENT_ASSESSMENTS: '/ims/oneroster/v1p1/assessment/students',
} as const;

/**
 * Note: URL building functions removed - URLs are now built from config.domain_url
 * in the service methods directly
 */

/**
 * Get headers for Nexquare API requests (with Bearer token)
 */
export const getNexquareHeaders = (accessToken: string, contentType: string = 'application/json'): Record<string, string> => {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': contentType,
    'Accept': 'application/json',
  };
};

/**
 * Get form data headers for OAuth token request
 */
export const getTokenRequestHeaders = (): Record<string, string> => {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  };
};
