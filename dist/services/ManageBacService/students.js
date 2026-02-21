/**
 * Students Methods
 * Handles fetching and saving students from ManageBac API
 */
import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService } from '../DatabaseService.js';
function mapManageBacStudentToDb(s) {
    const id = typeof s.id === 'string' ? parseInt(s.id, 10) : s.id;
    const pick = (snake, camel) => s[snake] ?? s[camel] ?? null;
    const pickNum = (snake, camel) => {
        const v = s[snake] ?? s[camel];
        return v !== undefined && v !== null ? (typeof v === 'number' ? v : parseInt(String(v), 10)) : null;
    };
    const nationalitiesRaw = pick('nationalities', 'nationalities');
    const languagesRaw = pick('languages', 'languages');
    const parentIdsRaw = pick('parent_ids', 'parentIds');
    const additionalHomeroomRaw = pick('additional_homeroom_advisor_ids', 'additionalHomeroomAdvisorIds');
    return {
        id,
        grade_id: pickNum('grade_id', 'gradeId'),
        year_group_id: pickNum('year_group_id', 'yearGroupId'),
        uniq_student_id: pick('uniq_student_id', 'uniqStudentId') || pick('student_id', 'studentId') || pick('identifier', 'identifier'),
        first_name: (pick('first_name', 'firstName') ?? ''),
        last_name: (pick('last_name', 'lastName') ?? ''),
        email: (pick('email', 'email') || `mb-student-${id}@placeholder.local`),
        gender: pick('gender', 'gender'),
        birthday: pick('birthday', 'birthday'),
        archived: s.archived ?? false,
        program: pick('program', 'program'),
        program_code: pick('program_code', 'programCode'),
        class_grade: pick('class_grade', 'classGrade'),
        class_grade_number: pickNum('class_grade_number', 'classGradeNumber'),
        graduating_year: pickNum('graduating_year', 'graduatingYear'),
        nationalities: Array.isArray(nationalitiesRaw) ? JSON.stringify(nationalitiesRaw) : (typeof nationalitiesRaw === 'string' ? nationalitiesRaw : '[]'),
        languages: Array.isArray(languagesRaw) ? JSON.stringify(languagesRaw) : (typeof languagesRaw === 'string' ? languagesRaw : '[]'),
        timezone: pick('timezone', 'timezone'),
        ui_language: pick('ui_language', 'uiLanguage'),
        student_id: pick('student_id', 'studentId') || pick('identifier', 'identifier'),
        identifier: pick('identifier', 'identifier'),
        oa_id: pick('oa_id', 'oaId'),
        withdrawn_on: pick('withdrawn_on', 'withdrawnOn'),
        photo_url: pick('photo_url', 'photoUrl'),
        homeroom_advisor_id: pickNum('homeroom_advisor_id', 'homeroomAdvisorId'),
        attendance_start_date: pick('attendance_start_date', 'attendanceStartDate'),
        parent_ids: Array.isArray(parentIdsRaw) ? JSON.stringify(parentIdsRaw) : (typeof parentIdsRaw === 'string' ? parentIdsRaw : '[]'),
        additional_homeroom_advisor_ids: Array.isArray(additionalHomeroomRaw)
            ? JSON.stringify(additionalHomeroomRaw)
            : (typeof additionalHomeroomRaw === 'string' ? additionalHomeroomRaw : '[]')
    };
}
export async function getStudents(apiKey, filters, baseUrl, schoolId, onLog) {
    const log = (msg) => {
        console.log(msg);
        onLog?.(msg);
    };
    try {
        log(`📋 Step 1: Fetching students from ManageBac API...`);
        const allStudents = [];
        let page = 1;
        let totalPages = 1;
        const perPage = 250;
        do {
            const params = new URLSearchParams();
            params.append('page', String(page));
            params.append('per_page', String(perPage));
            if (filters?.grade_id)
                params.append('grade_id', filters.grade_id);
            if (filters?.academic_year_id)
                params.append('academic_year_id', filters.academic_year_id);
            if (filters?.active_only)
                params.append('active_only', 'true');
            const endpoint = `${MANAGEBAC_ENDPOINTS.STUDENTS}?${params.toString()}`;
            const rawResponse = await this.makeRequestRaw(endpoint, apiKey, {}, baseUrl);
            const raw = rawResponse.data ?? rawResponse;
            const students = Array.isArray(raw) ? raw : (raw?.students ?? []);
            allStudents.push(...students);
            const meta = rawResponse.meta ?? raw?.meta;
            totalPages = meta?.total_pages ?? 1;
            if (students.length > 0) {
                log(`   📄 Students page ${page}/${totalPages} (${students.length} items)`);
            }
            page++;
        } while (page <= totalPages);
        log(`✅ Step 1 complete: Fetched ${allStudents.length} students from API`);
        const sample = allStudents.slice(0, 3);
        const needsEnrichment = sample.some((s) => !(s.year_group_id ?? s.yearGroupId) &&
            !(s.class_grade ?? s.classGrade) &&
            !(s.program ?? s.program));
        if (needsEnrichment && allStudents.length > 0) {
            log(`📋 Step 2: Enriching student records (list returned minimal data; fetching full details for ${allStudents.length} students)...`);
            const BATCH_SIZE = 150;
            const DELAY_BETWEEN_BATCHES_MS = 60000;
            const enriched = [];
            const totalBatches = Math.ceil(allStudents.length / BATCH_SIZE);
            for (let i = 0; i < allStudents.length; i += BATCH_SIZE) {
                if (i > 0) {
                    log(`   ⏳ Pausing ${DELAY_BETWEEN_BATCHES_MS / 1000}s to avoid rate limits...`);
                    await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
                }
                const chunk = allStudents.slice(i, i + BATCH_SIZE);
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                log(`   📥 Enriching batch ${batchNum}/${totalBatches} (${chunk.length} students)...`);
                const results = await Promise.all(chunk.map(async (s) => {
                    try {
                        const res = await this.makeRequest(`/students/${s.id}`, apiKey, {}, baseUrl);
                        const full = res.data?.student ?? res.data ?? s;
                        return full;
                    }
                    catch {
                        return s;
                    }
                }));
                enriched.push(...results);
                const done = Math.min(i + BATCH_SIZE, allStudents.length);
                log(`   ✅ Enriched ${done}/${allStudents.length} students`);
            }
            allStudents.length = 0;
            allStudents.push(...enriched);
            log(`✅ Step 2 complete: Enriched ${enriched.length} students`);
        }
        const effectiveSchoolId = schoolId ?? this.currentSchoolId;
        const saveStepNum = needsEnrichment ? 3 : 2;
        if (effectiveSchoolId && allStudents.length > 0) {
            log(`📋 Step ${saveStepNum}: Saving ${allStudents.length} students to database (MB.students)...`);
            const studentsForDb = allStudents.map((s) => mapManageBacStudentToDb(s));
            const { error } = await databaseService.bulkUpsertManageBacStudents(studentsForDb, (cur, tot, batchNum, totalBatches) => {
                log(`   📊 Batch ${batchNum}/${totalBatches}: ${cur}/${tot} students (${Math.round((cur / tot) * 100)}%)`);
            });
            if (error) {
                log(`❌ Step ${saveStepNum} failed: ${error}`);
            }
            else {
                log(`✅ Step ${saveStepNum} complete: ${allStudents.length} students saved to database`);
            }
            if (!this.studentsSyncedFromYearGroups) {
                log(`📋 Syncing year group - student relationships...`);
                await syncStudentsByGradesAndYearGroups.call(this, apiKey);
            }
        }
        else if (!effectiveSchoolId) {
            log(`⚠️ Skipping database save: No school ID configured`);
        }
        log(`✅ Students sync complete`);
        return allStudents;
    }
    catch (error) {
        console.error('Failed to fetch students:', error);
        throw error;
    }
}
async function syncStudentsByGradesAndYearGroups(apiKey) {
    if (!this.currentSchoolId || this.studentsSyncedFromYearGroups) {
        return;
    }
    const schoolId = this.currentSchoolId;
    let yearGroups = await databaseService.getYearGroupsForSchool(schoolId);
    if (!yearGroups.length) {
        console.log('ℹ️ No year groups stored locally; fetching from ManageBac...');
        await this.getYearGroups(apiKey);
        yearGroups = await databaseService.getYearGroupsForSchool(schoolId);
    }
    if (!yearGroups.length) {
        console.warn('⚠️ Unable to sync students because no year groups are available.');
        return;
    }
    let grades = await databaseService.getGradesForSchool(schoolId);
    if (!grades.length) {
        console.log('ℹ️ No grades stored locally; fetching from ManageBac...');
        await this.getGrades(apiKey);
        grades = await databaseService.getGradesForSchool(schoolId);
    }
    if (!grades.length) {
        console.warn('⚠️ Unable to sync students because no grades are available.');
        return;
    }
    const yearGroupMap = new Map();
    for (const group of yearGroups) {
        const programCode = this.resolveProgramCodeFromName(group.program);
        const gradeNumber = typeof group.grade_number === 'string'
            ? parseInt(group.grade_number, 10)
            : group.grade_number;
        if (!programCode || gradeNumber === undefined || gradeNumber === null)
            continue;
        const key = `${programCode}:${gradeNumber}`;
        if (!yearGroupMap.has(key)) {
            yearGroupMap.set(key, []);
        }
        yearGroupMap.get(key).push(group);
    }
    const allStudentIds = new Set();
    const studentPlacement = new Map();
    for (const grade of grades) {
        if (!grade.id) {
            console.warn(`⚠️ Grade missing ID: program_code=${grade.program_code}, grade_number=${grade.grade_number}`);
            continue;
        }
        const programCode = (grade.program_code || '').toLowerCase().trim();
        const key = `${programCode}:${grade.grade_number}`;
        let groups = yearGroupMap.get(key);
        if (!groups?.length) {
            const altProgramCode = programCode === 'ibpyp' ? 'pyp' : programCode === 'pyp' ? 'ibpyp' : null;
            const altKey = altProgramCode ? `${altProgramCode}:${grade.grade_number}` : null;
            groups = altKey ? yearGroupMap.get(altKey) ?? undefined : undefined;
            if (altProgramCode && groups?.length) {
                console.log(`ℹ️ Mapped grade (${programCode}, ${grade.grade_number}) to year groups via alternative program code (${altProgramCode})`);
            }
            else {
                console.log(`ℹ️ No year groups mapped for grade (${programCode || 'unknown'}, ${grade.grade_number})`);
                continue;
            }
        }
        for (const group of groups) {
            const studentIds = await fetchYearGroupStudentIds.call(this, apiKey, group.id);
            if (!studentIds.length)
                continue;
            for (const rawId of studentIds) {
                const studentId = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
                if (!studentId)
                    continue;
                if (!studentPlacement.has(studentId)) {
                    studentPlacement.set(studentId, { gradeId: grade.id, yearGroupId: group.id });
                }
                allStudentIds.add(studentId);
            }
        }
    }
    if (!allStudentIds.size) {
        console.log('ℹ️ No students detected across year groups.');
        return;
    }
    console.log(`\n💾 Fetching and saving ${allStudentIds.size} unique students in batches...`);
    const studentIdArray = Array.from(allStudentIds);
    const batchSize = 25;
    let totalSaved = 0;
    let totalRelationshipsCreated = 0;
    let totalRelationshipErrors = 0;
    for (let i = 0; i < studentIdArray.length; i += batchSize) {
        const batch = studentIdArray.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(studentIdArray.length / batchSize);
        console.log(`  📥 Fetching batch ${batchNum}/${totalBatches} (${batch.length} students)...`);
        const studentsForDb = await fetchStudentDetailsBatch.call(this, apiKey, batch, studentPlacement);
        if (studentsForDb.length === 0) {
            console.warn(`    ⚠️ No student data fetched for batch ${batchNum}`);
            continue;
        }
        console.log(`  💾 Saving batch ${batchNum} (${studentsForDb.length} students)...`);
        const { error: studentsError } = await databaseService.upsertStudents(studentsForDb);
        if (studentsError) {
            console.error(`    ❌ Failed to save batch ${batchNum}:`, studentsError);
            continue;
        }
        totalSaved += studentsForDb.length;
        console.log(`    ✅ Saved batch ${batchNum} (${studentsForDb.length} students)`);
        let batchRelationshipsCreated = 0;
        let batchRelationshipErrors = 0;
        for (const student of studentsForDb) {
            const placementInfo = studentPlacement.get(student.id);
            if (!placementInfo?.yearGroupId)
                continue;
            const { error } = await databaseService.upsertYearGroupStudent(placementInfo.yearGroupId, student.id);
            if (error) {
                batchRelationshipErrors++;
            }
            else {
                batchRelationshipsCreated++;
            }
        }
        totalRelationshipsCreated += batchRelationshipsCreated;
        totalRelationshipErrors += batchRelationshipErrors;
        if (batchRelationshipErrors > 0) {
            console.warn(`    ⚠️ ${batchRelationshipErrors} relationships failed in batch ${batchNum}`);
        }
    }
    console.log(`\n✅ Summary:`);
    console.log(`   - Saved ${totalSaved} students to database`);
    console.log(`   - Created ${totalRelationshipsCreated} year group/student relationships`);
    if (totalRelationshipErrors > 0) {
        console.warn(`   - ⚠️ ${totalRelationshipErrors} relationship errors`);
    }
    this.studentsSyncedFromYearGroups = true;
}
async function fetchYearGroupStudentIds(apiKey, yearGroupId) {
    try {
        const response = await this.makeRequest(`/year-groups/${yearGroupId}/students`, apiKey);
        const data = response.data || {};
        if (Array.isArray(data.student_ids)) {
            return data.student_ids.map((id) => typeof id === 'string' ? parseInt(id, 10) : id).filter(Boolean);
        }
        if (Array.isArray(data.students)) {
            return data.students
                .map((student) => typeof student.id === 'string' ? parseInt(student.id, 10) : student.id)
                .filter(Boolean);
        }
    }
    catch (error) {
        console.warn(`    ⚠️ Failed to fetch students for year group ${yearGroupId}:`, error.message);
    }
    return [];
}
async function fetchStudentDetailsBatch(apiKey, studentIds, placement) {
    const studentsForDb = [];
    for (const studentId of studentIds) {
        try {
            const studentResponse = await this.makeRequest(`/students/${studentId}`, apiKey);
            const studentData = studentResponse.data?.student || studentResponse.data;
            if (!studentData)
                continue;
            const placementInfo = placement.get(studentId);
            studentsForDb.push({
                id: typeof studentData.id === 'string' ? parseInt(studentData.id, 10) : studentData.id,
                grade_id: placementInfo?.gradeId ?? null,
                year_group_id: placementInfo?.yearGroupId ?? null,
                uniq_student_id: studentData.uniq_student_id || studentData.identifier || null,
                first_name: studentData.first_name || '',
                last_name: studentData.last_name || '',
                email: studentData.email || null,
                gender: studentData.gender || null,
                birthday: studentData.date_of_birth || studentData.birthday || null,
                archived: !studentData.is_active,
                program: studentData.program || null,
                program_code: studentData.program_code || null,
                class_grade: studentData.grade || null,
                class_grade_number: studentData.grade_number || null,
                graduating_year: studentData.graduating_year || null,
                nationalities: studentData.nationalities ? JSON.stringify(studentData.nationalities) : '[]',
                languages: studentData.languages ? JSON.stringify(studentData.languages) : '[]',
                timezone: studentData.timezone || null,
                ui_language: studentData.ui_language || null,
                student_id: studentData.student_id || null,
                identifier: studentData.identifier || null,
                oa_id: studentData.oa_id || null,
                withdrawn_on: studentData.withdrawn_on || null,
                photo_url: studentData.photo_url || null,
                homeroom_advisor_id: studentData.homeroom_advisor_id || null,
                attendance_start_date: studentData.attendance_start_date || null,
                parent_ids: studentData.parent_ids ? JSON.stringify(studentData.parent_ids) : '[]',
                additional_homeroom_advisor_ids: studentData.additional_homeroom_advisor_ids
                    ? JSON.stringify(studentData.additional_homeroom_advisor_ids)
                    : '[]'
            });
        }
        catch (error) {
            console.warn(`    ⚠️ Failed to fetch student ${studentId}:`, error.message);
        }
    }
    return studentsForDb;
}
//# sourceMappingURL=students.js.map