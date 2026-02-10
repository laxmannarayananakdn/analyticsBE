/**
 * Nexquare API Service
 * Main service class that composes all API methods
 *
 * This class extends BaseNexquareService and includes all API endpoint methods
 * extracted from the original monolithic NexquareService.ts file.
 */
import { BaseNexquareService } from './BaseNexquareService.js';
import { authenticate } from './auth.js';
import { getSchools, verifySchoolAccess } from './schools.js';
import { getStudents } from './students.js';
import { getStaff } from './staff.js';
import { getClasses } from './classes.js';
import { getAllocationMaster } from './allocationMaster.js';
import { getStudentAllocations } from './studentAllocations.js';
import { getStaffAllocations } from './staffAllocations.js';
import { getDailyPlans } from './dailyPlans.js';
import { getDailyAttendance } from './dailyAttendance.js';
import { getStudentAssessments, saveAssessmentBatch, syncStudentAssessmentsToRP, updateReportedSubjectForSchool } from './studentAssessments.js';
import { bulkGetStudentIds, bulkGetGroupIds } from './helpers.js';
/**
 * NexquareService class
 * Composes all API methods into a single service class
 */
export class NexquareService extends BaseNexquareService {
    constructor() {
        super();
        // Marker to verify this is the refactored service being used
        console.log('✅ Using REFACTORED NexquareService (modular structure)');
    }
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
    getLessonAttendance = getDailyAttendance.bind(this); // Alias for route compatibility
    // Assessments
    getStudentAssessments = getStudentAssessments.bind(this);
    saveAssessmentBatch = saveAssessmentBatch.bind(this);
    syncStudentAssessmentsToRP = syncStudentAssessmentsToRP.bind(this);
    updateReportedSubjectForSchool = updateReportedSubjectForSchool.bind(this);
    // Helper methods
    bulkGetStudentIds = bulkGetStudentIds.bind(this);
    bulkGetGroupIds = bulkGetGroupIds.bind(this);
}
// Export singleton instance (maintains backward compatibility)
// NOTE: This instance will log "✅ Using REFACTORED NexquareService (modular structure)" when imported
export const nexquareService = new NexquareService();
//# sourceMappingURL=index.js.map