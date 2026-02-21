/**
 * Year Groups Methods
 * Handles fetching and saving year groups from ManageBac API
 */
import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService } from '../DatabaseService.js';
export async function getYearGroups(apiKey, baseUrl) {
    try {
        if (!this.currentSchoolId) {
            console.log('⚠️ School ID not set, fetching school details first...');
            try {
                await this.getSchoolDetails(apiKey, baseUrl);
            }
            catch (schoolError) {
                console.warn('⚠️ Failed to fetch school details, will try to get school ID from database:', schoolError);
            }
        }
        const yearGroupsRaw = await this.fetchAllPaginated(MANAGEBAC_ENDPOINTS.YEAR_GROUPS, 'year_groups', apiKey, baseUrl, {}, 'Year groups');
        const normalizedYearGroups = yearGroupsRaw.map((yearGroup) => ({
            ...yearGroup,
            id: typeof yearGroup.id === 'string' ? parseInt(yearGroup.id, 10) : yearGroup.id,
            grade_number: typeof yearGroup.grade_number === 'string'
                ? parseInt(yearGroup.grade_number, 10)
                : yearGroup.grade_number
        }));
        if (this.currentSchoolId && normalizedYearGroups.length > 0) {
            console.log(`💾 Saving ${normalizedYearGroups.length} year groups to database...`);
            const yearGroupsForDb = normalizedYearGroups.map((group) => ({
                id: group.id,
                school_id: this.currentSchoolId,
                name: group.name,
                short_name: group.short_name || null,
                program: group.program || 'Unknown',
                grade: group.grade || 'Unknown',
                grade_number: group.grade_number || 0
            }));
            const { error } = await databaseService.upsertYearGroups(yearGroupsForDb, this.currentSchoolId);
            if (error) {
                console.error('❌ Failed to save year groups to database:', error);
            }
            else {
                console.log('✅ Year groups saved to database');
            }
        }
        else if (!this.currentSchoolId) {
            console.warn('⚠️ No school context available; skipping year groups persistence.');
        }
        else {
            console.log('ℹ️ No year groups returned from API');
        }
        return normalizedYearGroups;
    }
    catch (error) {
        console.error('Failed to fetch year groups:', error);
        throw error;
    }
}
//# sourceMappingURL=yearGroups.js.map