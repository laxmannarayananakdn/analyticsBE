/**
 * Nexquare API Service
 * Main service class that composes all API methods
 *
 * This class extends BaseNexquareService and includes all API endpoint methods
 * extracted from the original monolithic NexquareService.ts file.
 */
import { BaseNexquareService } from './BaseNexquareService.js';
/**
 * NexquareService class
 * Composes all API methods into a single service class
 */
export declare class NexquareService extends BaseNexquareService {
    constructor();
    authenticate: (config: import("../../middleware/configLoader.js").NexquareConfig) => Promise<boolean>;
    getSchools: (config: import("../../middleware/configLoader.js").NexquareConfig, filter?: string | undefined) => Promise<import("../../types/nexquare.js").NexquareSchool[]>;
    verifySchoolAccess: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId: string) => Promise<boolean>;
    getStudents: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined, filter?: string | undefined, fetchMode?: number | undefined) => Promise<import("../../types/nexquare.js").NexquareUser[]>;
    getStaff: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined, filter?: string | undefined) => Promise<import("../../types/nexquare.js").NexquareUser[]>;
    getClasses: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined) => Promise<import("../../types/nexquare.js").NexquareClass[]>;
    getAllocationMaster: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined) => Promise<any[]>;
    getStudentAllocations: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined) => Promise<import("../../types/nexquare.js").StudentAllocationResponse[]>;
    getStaffAllocations: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined) => Promise<any[]>;
    getDailyPlans: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined, fromDate?: string | undefined, toDate?: string | undefined, subject?: string | undefined, classId?: string | undefined, cohort?: string | undefined, teacher?: string | undefined, location?: string | undefined) => Promise<any[]>;
    getDailyAttendance: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined, startDate?: string | undefined, endDate?: string | undefined, categoryRequired?: boolean | undefined, rangeType?: number | undefined, studentSourcedId?: string | undefined) => Promise<any[]>;
    getLessonAttendance: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined, startDate?: string | undefined, endDate?: string | undefined, categoryRequired?: boolean | undefined, rangeType?: number | undefined, studentSourcedId?: string | undefined) => Promise<any[]>;
    getStudentAssessments: (config: import("../../middleware/configLoader.js").NexquareConfig, schoolId?: string | undefined, academicYear?: string | undefined, fileName?: string | undefined, limit?: number | undefined, offset?: number | undefined) => Promise<any[]>;
    saveAssessmentBatch: (records: any[], schoolSourcedId: string | null) => Promise<number>;
    syncStudentAssessmentsToRP: (schoolSourcedId: string) => Promise<number>;
    updateReportedSubjectForSchool: (schoolSourcedId: string) => Promise<number>;
    bulkGetStudentIds: (studentIdentifiers: string[]) => Promise<Map<string, {
        id: number;
        sourced_id: string;
    }>>;
    bulkGetGroupIds: (groupSourcedIds: string[]) => Promise<Map<string, {
        id: number;
        sourced_id: string;
    }>>;
}
export declare const nexquareService: NexquareService;
//# sourceMappingURL=index.d.ts.map