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
import { authenticate } from './auth.js';
import { getSchoolDetails } from './school.js';
import { getAcademicYears } from './academicYears.js';
import { getGrades } from './grades.js';
import { getSubjects } from './subjects.js';
import { getTeachers } from './teachers.js';
import { getStudents } from './students.js';
import { getClasses, getClassById } from './classes.js';
import { getYearGroups } from './yearGroups.js';
import { getYearGroupStudents, getAllYearGroupStudents } from './yearGroupStudents.js';
import { getMemberships } from './memberships.js';
import { getTermGrades, syncAllTermGrades, syncTermGradesForYearGroup } from './termGrades.js';
import { syncClassMembershipsForYearGroup } from './classMemberships.js';
/**
 * ManageBacService class (modular)
 * Composes all API methods into a single service class
 * Same interface as the original ManageBacService for drop-in replacement
 */
export class ManageBacService extends BaseManageBacService {
    constructor() {
        super();
        console.log('✅ Using modular ManageBacService (ManageBacService folder)');
    }
    // Authentication
    authenticate = authenticate.bind(this);
    // School
    getSchoolDetails = getSchoolDetails.bind(this);
    // Academic structure
    getAcademicYears = getAcademicYears.bind(this);
    getGrades = getGrades.bind(this);
    getSubjects = getSubjects.bind(this);
    // People
    getTeachers = getTeachers.bind(this);
    getStudents = getStudents.bind(this);
    // Classes
    getClasses = getClasses.bind(this);
    getClassById = getClassById.bind(this);
    // Year groups
    getYearGroups = getYearGroups.bind(this);
    getYearGroupStudents = getYearGroupStudents.bind(this);
    getAllYearGroupStudents = getAllYearGroupStudents.bind(this);
    // Memberships
    getMemberships = getMemberships.bind(this);
    // Term grades
    getTermGrades = getTermGrades.bind(this);
    syncAllTermGrades = syncAllTermGrades.bind(this);
    syncTermGradesForYearGroup = syncTermGradesForYearGroup.bind(this);
    // Sync operations
    syncClassMembershipsForYearGroup = syncClassMembershipsForYearGroup.bind(this);
}
/**
 * Singleton instance - same export name as original for drop-in replacement.
 * When ready to switch: change import from './ManageBacService.js' to './ManageBacService/index.js'
 */
export const manageBacService = new ManageBacService();
//# sourceMappingURL=index.js.map