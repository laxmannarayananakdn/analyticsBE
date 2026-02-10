/**
 * Nexquare API Service
 * Main service class that composes all API methods
 *
 * This class extends BaseNexquareService and includes all API endpoint methods
 * extracted from the original monolithic NexquareService.ts file.
 */
import { BaseNexquareService } from './BaseNexquareService';
import { authenticate } from './auth';
import { getSchools, verifySchoolAccess } from './schools';
import { getStudents } from './students';
import { getStaff } from './staff';
import { getClasses } from './classes';
import { getAllocationMaster } from './allocationMaster';
import { getStudentAllocations } from './studentAllocations';
import { getStaffAllocations } from './staffAllocations';
import { getDailyPlans } from './dailyPlans';
import { getDailyAttendance } from './dailyAttendance';
import { getStudentAssessments, saveAssessmentBatch } from './studentAssessments';
import { bulkGetStudentIds, bulkGetGroupIds } from './helpers';
/**
 * NexquareService class
 * Composes all API methods into a single service class
 */
export class NexquareService extends BaseNexquareService {
    // Authentication and School Management
    authenticate = authenticate.bind(this);
    getSchools = getSchools.bind(this);
    verifySchoolAccess = verifySchoolAccess.bind(this);
    // Students and Staff
    getStudents = getStudents.bind(this);
    getStaff = getStaff.bind(this);
    // Classes
    getClasses = getClasses.bind(this);
    // Allocations
    getAllocationMaster = getAllocationMaster.bind(this);
    getStudentAllocations = getStudentAllocations.bind(this);
    getStaffAllocations = getStaffAllocations.bind(this);
    // Attendance
    getDailyPlans = getDailyPlans.bind(this);
    getDailyAttendance = getDailyAttendance.bind(this);
    // Assessments
    getStudentAssessments = getStudentAssessments.bind(this);
    saveAssessmentBatch = saveAssessmentBatch.bind(this);
    // Helper methods
    bulkGetStudentIds = bulkGetStudentIds.bind(this);
    bulkGetGroupIds = bulkGetGroupIds.bind(this);
}
// Export singleton instance (maintains backward compatibility)
export const nexquareService = new NexquareService();
//# sourceMappingURL=index.js.map