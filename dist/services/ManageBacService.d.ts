/**
 * ManageBac API Service
 * Handles all interactions with ManageBac API and saves data to Azure SQL Database
 */
import type { SchoolDetails, Subject, Teacher, Student, Class, YearGroup, TermGradeResponse } from '../types/managebac';
export declare class ManageBacService {
    private currentSchoolId;
    private studentsSyncedFromYearGroups;
    /**
     * Generic method for making HTTP requests to the ManageBac API
     */
    private makeRequest;
    /**
     * Build ManageBac URL with custom base URL
     */
    private buildManageBacUrl;
    /**
     * Authenticate with the ManageBac API
     */
    authenticate(apiKey: string, baseUrl?: string): Promise<{
        success: boolean;
        error?: string;
        details?: any;
    }>;
    /**
     * Get school details and save to database
     */
    getSchoolDetails(apiKey: string, baseUrl?: string): Promise<SchoolDetails>;
    /**
     * Get all academic years for the school
     */
    getAcademicYears(apiKey: string, programCode?: string, baseUrl?: string): Promise<any>;
    /**
     * Get all grades/year levels
     */
    getGrades(apiKey: string, academicYearId?: string, baseUrl?: string): Promise<any>;
    /**
     * Get all subjects
     */
    getSubjects(apiKey: string, baseUrl?: string): Promise<Subject[]>;
    /**
     * Get all teachers
     */
    getTeachers(apiKey: string, filters?: {
        department?: string;
        active_only?: boolean;
    }, baseUrl?: string): Promise<Teacher[]>;
    /**
     * Get all students in the school
     */
    getStudents(apiKey: string, filters?: {
        grade_id?: string;
        active_only?: boolean;
        academic_year_id?: string;
    }, baseUrl?: string): Promise<Student[]>;
    /**
     * Get all classes in the school
     */
    getClasses(apiKey: string, baseUrl?: string): Promise<Class[]>;
    /**
     * Get a single class by ID
     */
    getClassById(apiKey: string, classId: number): Promise<Class | null>;
    /**
     * Get all year groups in the school
     */
    getYearGroups(apiKey: string, baseUrl?: string): Promise<YearGroup[]>;
    /**
     * Get students in a specific year group
     */
    getYearGroupStudents(apiKey: string, yearGroupId: string, academicYearId?: string, termId?: string, baseUrl?: string): Promise<any>;
    /**
     * Get students for all year groups in the school
     */
    getAllYearGroupStudents(apiKey: string, academicYearId?: string, termId?: string, baseUrl?: string): Promise<any>;
    /**
     * Get all memberships
     * If gradeNumber is provided, filters by students in year groups with that grade_number
     */
    getMemberships(apiKey: string, userIds: number[], academicYearId?: string, termId?: string, baseUrl?: string, gradeNumber?: number): Promise<any>;
    /**
     * Get term grades for a class and term
     */
    getTermGrades(apiKey: string, classId: number, termId: number, baseUrl?: string): Promise<TermGradeResponse>;
    /**
     * Get current school ID
     */
    getCurrentSchoolId(): number | null;
    /**
     * Set current school ID
     */
    setCurrentSchoolId(schoolId: number): void;
    /**
     * Normalize date string (YYYY-MM-DD)
     */
    private normalizeDate;
    /**
     * Get normalized start/end dates for an academic year
     */
    private getAcademicYearDates;
    /**
     * Get normalized start/end dates for an academic term
     */
    private getAcademicTermDates;
    /**
     * Resolve program code to API key
     */
    private resolveProgramKey;
    /**
     * Map program names/codes to canonical API codes
     */
    private resolveProgramCodeFromName;
    /**
     * Synchronize students by iterating grades and matching year groups
     */
    private syncStudentsByGradesAndYearGroups;
    private fetchYearGroupStudentIds;
    /**
     * Fetch student details for a single batch and return them for immediate saving
     */
    private fetchStudentDetailsBatch;
    /**
     * Sync class memberships for a specific year group
     * Process one student at a time:
     * 1. Get students for the year group
     * 2. For each student, fetch their memberships
     * 3. For each membership, fetch and save the class if not already saved
     * 4. Save the membership
     */
    syncClassMembershipsForYearGroup(apiKey: string, yearGroupId: number): Promise<void>;
    /**
     * Sync term grades for all class memberships in a specific year group
     * 1. Get class memberships for first 10 students in the year group
     * 2. For each class, get its start_term_id and end_term_id
     * 3. Get academic terms within that range
     * 4. Fetch term grades only for valid class × term combinations
     */
    syncTermGradesForYearGroup(apiKey: string, yearGroupId: number): Promise<void>;
}
export declare const manageBacService: ManageBacService;
//# sourceMappingURL=ManageBacService.d.ts.map