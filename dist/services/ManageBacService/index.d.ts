/**
 * ManageBac API Service (Modular)
 * Main service class that composes all API methods
 *
 * This class extends BaseManageBacService and includes all API endpoint methods
 * extracted from the original ManageBacService.ts file.
 *
 * The original ManageBacService.ts is retained for now. Once tested, imports
 * can be switched to use this modular version.
 */
import { BaseManageBacService } from './BaseManageBacService.js';
/**
 * ManageBacService class (modular)
 * Composes all API methods into a single service class
 * Same interface as the original ManageBacService for drop-in replacement
 */
export declare class ManageBacService extends BaseManageBacService {
    constructor();
    authenticate: (apiKey: string, baseUrl?: string | undefined) => Promise<{
        success: boolean;
        error?: string;
        details?: any;
    }>;
    getSchoolDetails: (apiKey: string, baseUrl?: string | undefined) => Promise<import("../../types/managebac.js").SchoolDetails>;
    getAcademicYears: (apiKey: string, programCode?: string | undefined, baseUrl?: string | undefined) => Promise<any>;
    getGrades: (apiKey: string, academicYearId?: string | undefined, baseUrl?: string | undefined) => Promise<any>;
    getSubjects: (apiKey: string, baseUrl?: string | undefined) => Promise<import("../../types/managebac.js").Subject[]>;
    getTeachers: (apiKey: string, filters?: {
        department?: string;
        active_only?: boolean;
    } | undefined, baseUrl?: string | undefined, schoolId?: number | undefined, onLog?: ((msg: string) => void) | undefined) => Promise<import("../../types/managebac.js").Teacher[]>;
    getStudents: (apiKey: string, filters?: {
        grade_id?: string;
        active_only?: boolean;
        academic_year_id?: string;
    } | undefined, baseUrl?: string | undefined, schoolId?: number | undefined, onLog?: ((msg: string) => void) | undefined) => Promise<import("../../types/managebac.js").Student[]>;
    getClasses: (apiKey: string, baseUrl?: string | undefined) => Promise<import("../../types/managebac.js").Class[]>;
    getClassById: (apiKey: string, classId: number, baseUrl?: string | undefined) => Promise<import("../../types/managebac.js").Class | null>;
    getYearGroups: (apiKey: string, baseUrl?: string | undefined) => Promise<import("../../types/managebac.js").YearGroup[]>;
    getYearGroupStudents: (apiKey: string, yearGroupId: string, academicYearId?: string | undefined, termId?: string | undefined, baseUrl?: string | undefined) => Promise<any>;
    getAllYearGroupStudents: (apiKey: string, academicYearId?: string | undefined, termId?: string | undefined, baseUrl?: string | undefined) => Promise<any>;
    getMemberships: (apiKey: string, userIds: number[], academicYearId?: string | undefined, termId?: string | undefined, baseUrl?: string | undefined, gradeNumber?: number | undefined) => Promise<any>;
    getTermGrades: (apiKey: string, classId: number, termId: number, baseUrl?: string | undefined) => Promise<import("../../types/managebac.js").TermGradeResponse>;
    syncAllTermGrades: (apiKey: string, baseUrl?: string | undefined, options?: {
        grade_number?: number;
        term_id?: number;
        class_id?: number;
        school_id?: number;
    } | undefined) => Promise<{
        classesProcessed: number;
        classesSkipped: number;
        totalCombinations: number;
        termGradesFetched: number;
        errors: number;
        details: Array<{
            classId: number;
            className: string;
            termId: number;
            termName: string;
            count: number;
            error?: string;
        }>;
    }>;
    syncTermGradesForYearGroup: (apiKey: string, yearGroupId: number) => Promise<void>;
    syncClassMembershipsForYearGroup: (apiKey: string, yearGroupId: number) => Promise<void>;
}
/**
 * Singleton instance - same export name as original for drop-in replacement.
 * When ready to switch: change import from './ManageBacService.js' to './ManageBacService/index.js'
 */
export declare const manageBacService: ManageBacService;
//# sourceMappingURL=index.d.ts.map