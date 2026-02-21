/**
 * Subjects Methods
 * Handles fetching and saving subjects from ManageBac API
 */
import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService } from '../DatabaseService.js';
export async function getSubjects(apiKey, baseUrl) {
    try {
        const response = await this.makeRequest(MANAGEBAC_ENDPOINTS.SUBJECTS, apiKey, {}, baseUrl);
        const payload = response.data;
        let subjectsByProgram = {};
        if (Array.isArray(payload)) {
            subjectsByProgram = { general: payload };
        }
        else if (payload?.subjects && typeof payload.subjects === 'object') {
            subjectsByProgram = payload.subjects;
        }
        else if (payload && typeof payload === 'object') {
            subjectsByProgram = payload;
        }
        const flattenedSubjects = [];
        const subjectsForDb = [];
        const subjectGroupsMap = new Map();
        const programCount = Object.keys(subjectsByProgram).length;
        for (const [programKey, programSubjects] of Object.entries(subjectsByProgram)) {
            if (!Array.isArray(programSubjects))
                continue;
            const normalizedProgramCode = programKey.toLowerCase();
            for (const subject of programSubjects) {
                const subjectId = typeof subject.id === 'string' ? parseInt(subject.id, 10) : subject.id;
                const groupId = typeof subject.group_id === 'string' ? parseInt(subject.group_id, 10) : subject.group_id;
                const normalizedSubject = {
                    ...subject,
                    id: subjectId,
                    group_id: groupId || subject.group_id,
                    program_code: normalizedProgramCode
                };
                flattenedSubjects.push(normalizedSubject);
                if (!this.currentSchoolId)
                    continue;
                if (groupId) {
                    if (!subjectGroupsMap.has(groupId)) {
                        subjectGroupsMap.set(groupId, {
                            id: groupId,
                            school_id: this.currentSchoolId,
                            program_code: normalizedProgramCode,
                            name: subject.group || 'Unknown',
                            max_phase: subject.max_phase || null
                        });
                    }
                }
                subjectsForDb.push({
                    id: subjectId,
                    school_id: this.currentSchoolId,
                    subject_group_id: groupId || null,
                    name: subject.name,
                    custom: subject.custom ?? false,
                    sl: subject.sl ?? false,
                    hl: subject.hl ?? false,
                    self_taught: subject.self_taught ?? false,
                    enabled: subject.enabled ?? true
                });
            }
        }
        if (this.currentSchoolId && subjectsForDb.length > 0) {
            console.log(`📚 Processing ${subjectsForDb.length} subjects across ${programCount} program(s)`);
            if (subjectGroupsMap.size > 0) {
                const { error: groupsError } = await databaseService.upsertSubjectGroups(Array.from(subjectGroupsMap.values()), this.currentSchoolId);
                if (groupsError) {
                    console.error('❌ Failed to save subject groups to database:', groupsError);
                }
                else {
                    console.log(`✅ Saved ${subjectGroupsMap.size} subject groups to database`);
                }
            }
            const { error: subjectsError } = await databaseService.upsertSubjects(subjectsForDb, this.currentSchoolId);
            if (subjectsError) {
                console.error('❌ Failed to save subjects to database:', subjectsError);
            }
            else {
                console.log(`✅ Saved ${subjectsForDb.length} subjects to database`);
            }
        }
        else if (!this.currentSchoolId) {
            console.warn('⚠️ No school context available; skipping subject persistence.');
        }
        else {
            console.log('ℹ️ No subjects returned from API');
        }
        return flattenedSubjects;
    }
    catch (error) {
        console.error('Failed to fetch subjects:', error);
        throw error;
    }
}
//# sourceMappingURL=subjects.js.map