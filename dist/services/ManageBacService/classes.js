/**
 * Classes Methods
 * Handles fetching classes from ManageBac API
 */
import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService } from '../DatabaseService.js';
export async function getClasses(apiKey, baseUrl) {
    try {
        const classes = await this.fetchAllPaginated(MANAGEBAC_ENDPOINTS.CLASSES, 'classes', apiKey, baseUrl, {}, 'Classes');
        let schoolId = this.currentSchoolId;
        if (!schoolId && classes.length > 0) {
            const school = await this.getSchoolDetails(apiKey, baseUrl);
            schoolId = school?.id ?? this.currentSchoolId;
        }
        if (schoolId && classes.length > 0) {
            console.log('💾 Saving classes to database...');
            const classesForDb = classes.map((c) => ({
                id: typeof c.id === 'string' ? parseInt(c.id, 10) : c.id,
                school_id: schoolId,
                subject_id: c.subject_id ?? null,
                name: c.name ?? '',
                description: c.description ?? null,
                uniq_id: c.uniq_id ?? null,
                class_section: c.class_section ?? null,
                language: c.language ?? 'en',
                program_code: c.program_code ?? '',
                grade_number: c.grade_number ?? null,
                start_term_id: c.start_term_id ?? null,
                end_term_id: c.end_term_id ?? null,
                archived: c.archived ?? false,
                lock_memberships: c.lock_memberships ?? null,
            }));
            const { data, error } = await databaseService.upsertClasses(classesForDb, schoolId);
            if (error) {
                console.warn('⚠️ Failed to save classes to database:', error);
            }
            else {
                console.log(`✅ Saved ${data?.length ?? classes.length} classes to database`);
            }
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