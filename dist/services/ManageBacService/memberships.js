/**
 * Memberships Methods
 * Handles fetching class memberships from ManageBac API
 */
import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { executeQuery } from '../../config/database.js';
export async function getMemberships(apiKey, userIds, academicYearId, termId, baseUrl, gradeNumber) {
    try {
        if (!this.currentSchoolId) {
            console.log('⚠️ School ID not set, fetching school details first...');
            await this.getSchoolDetails(apiKey, baseUrl);
        }
        let filteredUserIds = userIds;
        if (gradeNumber !== undefined && this.currentSchoolId) {
            console.log(`🔍 Filtering memberships by grade_number = ${gradeNumber}...`);
            const yearGroupsQuery = `
        SELECT id FROM MB.year_groups
        WHERE school_id = @school_id AND grade_number = @grade_number
      `;
            const yearGroupsResult = await executeQuery(yearGroupsQuery, {
                school_id: this.currentSchoolId,
                grade_number: gradeNumber
            });
            if (yearGroupsResult.error || !yearGroupsResult.data || yearGroupsResult.data.length === 0) {
                console.warn(`⚠️ No year groups found with grade_number = ${gradeNumber}`);
                return {
                    success: true,
                    message: `No year groups found with grade_number = ${gradeNumber}`,
                    memberships: [],
                    count: 0
                };
            }
            const yearGroupIds = yearGroupsResult.data.map(yg => yg.id);
            console.log(`   Found ${yearGroupIds.length} year group(s) with grade_number = ${gradeNumber}`);
            const yearGroupIdsStr = yearGroupIds.join(',');
            const studentsQuery = `
        SELECT DISTINCT student_id
        FROM MB.year_group_students
        WHERE year_group_id IN (${yearGroupIdsStr})
      `;
            const studentsResult = await executeQuery(studentsQuery, {});
            if (studentsResult.error || !studentsResult.data) {
                console.warn(`⚠️ Failed to get students for year groups with grade_number = ${gradeNumber}`);
                return {
                    success: true,
                    message: `Failed to get students for grade_number = ${gradeNumber}`,
                    memberships: [],
                    count: 0
                };
            }
            filteredUserIds = studentsResult.data.map(s => s.student_id);
            console.log(`   Found ${filteredUserIds.length} student(s) in year groups with grade_number = ${gradeNumber}`);
        }
        const existingParams = { classes: 'active' };
        if (filteredUserIds && filteredUserIds.length > 0) {
            existingParams.user_ids = filteredUserIds.join(',');
        }
        if (academicYearId)
            existingParams.academic_year_id = academicYearId;
        if (termId)
            existingParams.term_id = termId;
        const memberships = await this.fetchAllPaginated(MANAGEBAC_ENDPOINTS.MEMBERSHIPS, 'memberships', apiKey, baseUrl, existingParams, 'Memberships');
        return { memberships, count: memberships.length };
    }
    catch (error) {
        console.error('Failed to fetch memberships:', error);
        throw error;
    }
}
//# sourceMappingURL=memberships.js.map