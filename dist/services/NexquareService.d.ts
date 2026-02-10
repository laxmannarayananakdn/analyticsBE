/**
 * Nexquare API Service
 * Handles all interactions with Nexquare API and saves data to Azure SQL Database
 */
import type { NexquareConfig } from '../middleware/configLoader';
import type { NexquareSchool, NexquareUser, NexquareClass, StudentAllocationResponse } from '../types/nexquare';
export declare class NexquareService {
    private tokenCache;
    private currentSchoolId;
    /**
     * Get or refresh OAuth access token
     */
    private getAccessToken;
    /**
     * Generic method for making HTTP requests to the Nexquare API
     */
    private makeRequest;
    /**
     * Make HTTP request that returns file response (CSV or Excel)
     * Returns both the buffer and content type
     */
    private makeFileRequest;
    /**
     * Authenticate and verify connection
     */
    authenticate(config: NexquareConfig): Promise<boolean>;
    /**
     * Get schools/entities and verify school access
     */
    getSchools(config: NexquareConfig, filter?: string): Promise<NexquareSchool[]>;
    /**
     * Verify school access by checking if school_id exists
     */
    verifySchoolAccess(config: NexquareConfig, schoolId: string): Promise<boolean>;
    /**
     * Get current school ID
     */
    getCurrentSchoolId(): string | null;
    /**
     * Get school sourced_id from sourced_id
     * Returns the sourced_id (not database id) for use in school_id columns
     */
    private getSchoolSourcedId;
    /**
     * Clear cached token (useful for testing or forced refresh)
     */
    clearToken(configId?: number): void;
    /**
     * Get students with pagination
     */
    getStudents(config: NexquareConfig, schoolId?: string, filter?: string, fetchMode?: number): Promise<NexquareUser[]>;
    /**
     * Get staff/teachers with pagination
     */
    getStaff(config: NexquareConfig, schoolId?: string, filter?: string): Promise<NexquareUser[]>;
    /**
     * Get classes with pagination
     */
    getClasses(config: NexquareConfig, schoolId?: string): Promise<NexquareClass[]>;
    /**
     * Get allocation master data
     */
    getAllocationMaster(config: NexquareConfig, schoolId?: string): Promise<any[]>;
    /**
     * Get student allocations and extract subjects, cohorts, groups, homerooms
     */
    getStudentAllocations(config: NexquareConfig, schoolId?: string): Promise<StudentAllocationResponse[]>;
    /**
     * Get staff allocations
     */
    getStaffAllocations(config: NexquareConfig, schoolId?: string): Promise<any[]>;
    /**
     * Get student by sourced_id (helper method)
     */
    private getNexquareStudent;
    /**
     * Get staff by sourced_id (helper method)
     */
    private getNexquareStaff;
    /**
     * Bulk fetch student IDs by sourced_id or identifier
     * Returns a map of student_sourced_id -> { id, sourced_id }
     */
    private bulkGetStudentIds;
    /**
     * Bulk fetch group IDs from database by sourced_id
     */
    private bulkGetGroupIds;
    /**
     * Get daily plans (timetable data)
     * Note: API limits date range to 1 week, so we fetch week by week
     */
    getDailyPlans(config: NexquareConfig, schoolId?: string, fromDate?: string, toDate?: string, subject?: string, classId?: string, cohort?: string, teacher?: string, location?: string): Promise<any[]>;
    /**
     * Format date for API (YYYY-MM-DD)
     */
    private formatDateForAPI;
    /**
     * Get daily attendance records
     * Fetches in monthly chunks to avoid timeout
     */
    getDailyAttendance(config: NexquareConfig, schoolId?: string, startDate?: string, endDate?: string, categoryRequired?: boolean, rangeType?: number, studentSourcedId?: string): Promise<any[]>;
    /**
     * Get lesson attendance records
     * Fetches in monthly chunks to avoid timeout
     */
    getLessonAttendance(config: NexquareConfig, schoolId?: string, startDate?: string, endDate?: string, categoryRequired?: boolean, rangeType?: number, studentSourcedId?: string): Promise<any[]>;
    /**
     * Fetch student assessment/grade book data
     * Returns Excel file which is parsed and bulk inserted to database using temporary table approach
     * This is faster than batched INSERT statements as SQL Server can optimize the final insert
     * No validations - direct mapping from Excel to database
     * Processes all data efficiently using temp table and single INSERT SELECT operation
     */
    getStudentAssessments(config: NexquareConfig, schoolId?: string, academicYear?: string, fileName?: string, limit?: number, offset?: number): Promise<any[]>;
    /**
     * Save a batch of assessment records to database using temporary table approach
     * This is faster than batched INSERT statements as SQL Server can optimize the final insert
     */
    private saveAssessmentBatch;
}
export declare const nexquareService: NexquareService;
//# sourceMappingURL=NexquareService.d.ts.map