/**
 * Classes Methods
 * Handles fetching classes from ManageBac API
 */
import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
export async function getClasses(apiKey, baseUrl) {
    try {
        const classes = await this.fetchAllPaginated(MANAGEBAC_ENDPOINTS.CLASSES, 'classes', apiKey, baseUrl, {}, 'Classes');
        if (this.currentSchoolId && classes.length > 0) {
            console.log('💾 Saving classes to database...');
            console.log('⚠️ Classes database save not yet implemented');
        }
        return classes;
    }
    catch (error) {
        console.error('Failed to fetch classes:', error);
        return [];
    }
}
export async function getClassById(apiKey, classId, baseUrl) {
    try {
        const response = await this.makeRequest(`${MANAGEBAC_ENDPOINTS.CLASSES}/${classId}`, apiKey, {}, baseUrl);
        const classData = response.data?.class || response.data;
        if (!classData)
            return null;
        return classData;
    }
    catch (error) {
        console.error(`Failed to fetch class ${classId}:`, error.message);
        return null;
    }
}
//# sourceMappingURL=classes.js.map