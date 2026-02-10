/**
 * Nexquare API Configuration
 * Note: Credentials are now loaded from database via config_id parameter
 * These are only constants used by the service
 */
export declare const NEXQUARE_CONFIG: {
    readonly TIMEOUT: 30000;
    readonly RETRY_ATTEMPTS: 3;
    readonly TOKEN_EXPIRY_BUFFER: 300;
};
export declare const NEXQUARE_ENDPOINTS: {
    readonly TOKEN: "/oauth2/v1/token";
    readonly SCHOOLS: "/nexquare/ims/oneroster/v1p1/schools";
    readonly ALLOCATION_MASTER: "/ims/oneroster/v1p1/allocationMaster";
    readonly STUDENTS: "/ims/oneroster/v1p1/schools";
    readonly STUDENT_DETAILS: "/ims/oneroster/v1p1/users";
    readonly STUDENT_ALLOCATIONS: "/ims/oneroster/v1p1/schools";
    readonly STAFF: "/ims/oneroster/v1p1/schools";
    readonly STAFF_ALLOCATIONS: "/ims/oneroster/v1p1/schools";
    readonly CLASSES: "/ims/oneroster/v1p1/schools";
    readonly DAILY_PLAN: "/ims/oneroster/v1p1/dailyPlan";
    readonly TIMETABLE_LESSON_STUDENTS: "/ims/oneroster/v1p1/timetableLesson";
    readonly DAILY_ATTENDANCE: "/ims/oneroster/v1p1/getDailyAttendance";
    readonly LESSON_ATTENDANCE: "/ims/oneroster/v1p1/getLessonAttendance";
    readonly STUDENT_ASSESSMENTS: "/ims/oneroster/v1p1/assessment/students";
};
/**
 * Note: URL building functions removed - URLs are now built from config.domain_url
 * in the service methods directly
 */
/**
 * Get headers for Nexquare API requests (with Bearer token)
 */
export declare const getNexquareHeaders: (accessToken: string, contentType?: string) => Record<string, string>;
/**
 * Get form data headers for OAuth token request
 */
export declare const getTokenRequestHeaders: () => Record<string, string>;
//# sourceMappingURL=nexquare.d.ts.map