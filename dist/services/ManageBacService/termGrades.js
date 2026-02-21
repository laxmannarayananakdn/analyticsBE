/**
 * Term Grades Methods
 * Handles fetching and saving term grades from ManageBac API
 */
import { getManageBacHeaders, MANAGEBAC_ENDPOINTS, MANAGEBAC_CONFIG } from '../../config/managebac.js';
import { retryOperation, validateApiResponse } from '../../utils/apiUtils.js';
import { databaseService } from '../DatabaseService.js';
export async function getTermGrades(apiKey, classId, termId, baseUrl) {
    try {
        const endpoint = MANAGEBAC_ENDPOINTS.TERM_GRADES
            .replace(':class_id', classId.toString())
            .replace(':term_id', termId.toString());
        const url = baseUrl
            ? this.buildManageBacUrl(endpoint, baseUrl)
            : this.buildManageBacUrl(endpoint, MANAGEBAC_CONFIG.DEFAULT_BASE_URL);
        const headers = getManageBacHeaders(apiKey);
        const response = await retryOperation(async () => {
            const res = await fetch(url, { headers });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            return await res.json();
        }, 3);
        const responseObj = response;
        console.log('🔍 Raw API response keys:', Object.keys(responseObj));
        console.log('🔍 Raw response has students?', !!responseObj.students);
        console.log('🔍 Raw response has data?', !!responseObj.data);
        const validated = validateApiResponse(response);
        const validatedData = validated.data;
        console.log('🔍 Validated response structure:');
        console.log('  - validated.data type:', typeof validated.data);
        console.log('  - validated.data keys:', validated.data ? Object.keys(validatedData) : 'null');
        console.log('  - Has students?', !!validatedData?.students);
        const studentsData = validatedData?.students ?? responseObj?.students ?? [];
        const studentsArray = Array.isArray(studentsData) ? studentsData : [];
        if (studentsArray.length > 0) {
            const firstStudent = studentsArray[0];
            const termGrade = firstStudent?.term_grade;
            console.log('  - First student ID:', firstStudent?.id);
            console.log('  - First student has term_grade?', !!termGrade);
            const rubrics = termGrade?.rubrics;
            console.log('  - Rubrics count:', rubrics?.length || 0);
            if (rubrics && rubrics.length > 0) {
                console.log('  - Sample rubric:', JSON.stringify(rubrics[0], null, 2));
            }
        }
        if (studentsArray.length > 0) {
            const termGrades = studentsArray.map((student) => {
                const s = student;
                const tg = s?.term_grade;
                const avg = tg?.average;
                return {
                    student_id: s.id,
                    class_id: classId,
                    term_id: termId,
                    grade: tg?.grade,
                    average_percent: avg?.percent,
                    comments: tg?.comments,
                };
            });
            if (termGrades.length > 0) {
                console.log('💾 Saving term grades to database...');
                const { data: savedTermGrades, error } = await databaseService.upsertTermGrades(termGrades);
                if (error) {
                    console.error('❌ Failed to save term grades to database:', error);
                }
                else {
                    console.log('✅ Term grades saved to database');
                    if (savedTermGrades && savedTermGrades.length > 0) {
                        console.log(`📊 Processing rubrics for ${savedTermGrades.length} term grades...`);
                        const rubrics = [];
                        const studentToTermGradeId = new Map();
                        savedTermGrades.forEach(tg => {
                            const studentId = typeof tg.student_id === 'string' ? parseInt(tg.student_id, 10) : tg.student_id;
                            if (tg.id) {
                                studentToTermGradeId.set(studentId, tg.id);
                            }
                        });
                        studentsArray.forEach((student) => {
                            const s = student;
                            const studentId = typeof s?.id === 'string' ? parseInt(String(s.id), 10) : Number(s?.id);
                            const termGradeId = studentToTermGradeId.get(studentId);
                            if (termGradeId && s?.term_grade?.rubrics) {
                                const studentRubrics = s.term_grade.rubrics || [];
                                studentRubrics.forEach((rubric) => {
                                    const r = rubric;
                                    if (r?.id && r?.title) {
                                        rubrics.push({
                                            term_grade_id: termGradeId,
                                            rubric_id: r.id,
                                            title: String(r.title),
                                            grade: r.grade ?? null,
                                        });
                                    }
                                });
                            }
                        });
                        if (rubrics.length > 0) {
                            console.log(`💾 Saving ${rubrics.length} term grade rubrics to database...`);
                            const { error: rubricsError } = await databaseService.upsertTermGradeRubrics(rubrics);
                            if (rubricsError) {
                                console.error('❌ Failed to save term grade rubrics to database:', rubricsError);
                            }
                            else {
                                console.log('✅ Term grade rubrics saved to database');
                            }
                        }
                    }
                }
            }
        }
        return validated.data || { students: studentsData, meta: responseObj?.meta };
    }
    catch (error) {
        console.error('Failed to fetch term grades:', error);
        throw error;
    }
}
export async function syncAllTermGrades(apiKey, baseUrl, options) {
    const gradeNumber = options?.grade_number;
    const termIdFilter = options?.term_id;
    const classIdFilter = options?.class_id;
    const schoolId = options?.school_id;
    const filters = {};
    if (classIdFilter != null)
        filters.class_id = classIdFilter;
    if (gradeNumber != null && schoolId != null) {
        filters.grade_number = gradeNumber;
        filters.school_id = schoolId;
    }
    console.log('📋 syncAllTermGrades: fetching classes with memberships...', filters && Object.keys(filters).length ? `(filters: ${JSON.stringify(filters)})` : '');
    const classIds = await databaseService.getDistinctClassesWithMemberships(Object.keys(filters).length ? filters : undefined);
    console.log(`📋 syncAllTermGrades: found ${classIds.length} classes with memberships`);
    if (classIds.length === 0) {
        console.log('ℹ️ No classes with memberships found. Run "Get Memberships" first.');
        return {
            classesProcessed: 0,
            classesSkipped: classIds.length,
            totalCombinations: 0,
            termGradesFetched: 0,
            errors: 0,
            details: [],
        };
    }
    const combinations = [];
    console.log('📋 Building class-term combinations (fetching class details and terms)...');
    for (let ci = 0; ci < classIds.length; ci++) {
        const classId = classIds[ci];
        if (ci > 0 && ci % 10 === 0) {
            console.log(`   ... processed ${ci}/${classIds.length} classes`);
        }
        let classDetails = await databaseService.getClassById(classId);
        if (!classDetails || !classDetails.start_term_id || !classDetails.end_term_id) {
            try {
                const apiClass = await this.getClassById(apiKey, classId, baseUrl);
                if (apiClass) {
                    const start = apiClass.start_term_id ?? apiClass.startTermId;
                    const end = apiClass.end_term_id ?? apiClass.endTermId;
                    if (start != null && end != null) {
                        classDetails = {
                            ...(classDetails || { id: classId, name: apiClass.name || String(classId) }),
                            start_term_id: start,
                            end_term_id: end,
                        };
                    }
                }
            }
            catch {
                /* ignore */
            }
        }
        if (!classDetails || !classDetails.start_term_id || !classDetails.end_term_id) {
            continue;
        }
        let terms;
        if (termIdFilter != null) {
            const termInRange = classDetails.start_term_id <= termIdFilter && termIdFilter <= classDetails.end_term_id;
            if (!termInRange)
                continue;
            const singleTerm = await databaseService.getAcademicTermsInRange(termIdFilter, termIdFilter);
            terms = singleTerm.length > 0 ? singleTerm : [{ id: termIdFilter, name: `Term ${termIdFilter}` }];
        }
        else {
            terms = await databaseService.getAcademicTermsInRange(classDetails.start_term_id, classDetails.end_term_id);
        }
        for (const term of terms) {
            combinations.push({
                classId,
                className: classDetails.name,
                termId: term.id,
                termName: term.name,
            });
        }
    }
    const totalCombinations = combinations.length;
    const classesWithCombos = new Set(combinations.map(c => c.classId)).size;
    const skipped = classIds.length - classesWithCombos;
    console.log(`📋 Found ${classIds.length} classes with memberships, ${totalCombinations} class-term combinations to fetch (${skipped} classes skipped)`);
    const details = [];
    let totalFetched = 0;
    let errors = 0;
    for (let i = 0; i < combinations.length; i++) {
        const { classId, className, termId, termName } = combinations[i];
        const completed = i + 1;
        try {
            const response = await this.getTermGrades(apiKey, classId, termId, baseUrl);
            const count = response?.students?.length ?? 0;
            totalFetched += count;
            details.push({ classId, className, termId, termName, count });
            console.log(`  [${completed}/${totalCombinations}] Class ${classId} (${className}), Term ${termId} (${termName}): ${count > 0 ? `${count} term grades` : 'no data'}`);
        }
        catch (error) {
            errors++;
            details.push({ classId, className, termId, termName, count: 0, error: error.message });
            console.warn(`  [${completed}/${totalCombinations}] Class ${classId}, Term ${termId}: ${error.message}`);
        }
    }
    console.log(`\n✅ Sync complete: ${classesWithCombos} classes, ${totalCombinations}/${totalCombinations} combinations processed, ${totalFetched} term grades fetched, ${errors} errors`);
    return {
        classesProcessed: classesWithCombos,
        classesSkipped: skipped,
        totalCombinations,
        termGradesFetched: totalFetched,
        errors,
        details,
    };
}
export async function syncTermGradesForYearGroup(apiKey, yearGroupId) {
    if (!this.currentSchoolId) {
        console.error('❌ No school context available');
        return;
    }
    console.log(`\n📊 Syncing term grades for year group ${yearGroupId}...`);
    console.log(`  ⚠️ Limiting to first 10 students for testing`);
    const memberships = await databaseService.getClassMembershipsForYearGroup(yearGroupId, 10);
    if (memberships.length === 0) {
        console.log(`ℹ️ No class memberships found for first 10 students in year group ${yearGroupId}`);
        return;
    }
    const uniqueClassIds = [...new Set(memberships.map(m => m.class_id))];
    console.log(`  📋 Found ${memberships.length} memberships across ${uniqueClassIds.length} unique classes`);
    let totalTermGradesFetched = 0;
    let totalTermGradesSaved = 0;
    let errors = 0;
    let skippedClasses = 0;
    for (let i = 0; i < uniqueClassIds.length; i++) {
        const classId = uniqueClassIds[i];
        console.log(`\n  📚 Processing class ${i + 1}/${uniqueClassIds.length} (ID: ${classId})...`);
        const classDetails = await databaseService.getClassById(classId);
        if (!classDetails) {
            console.warn(`    ⚠️ Class ${classId} not found in database, skipping`);
            skippedClasses++;
            continue;
        }
        if (!classDetails.start_term_id || !classDetails.end_term_id) {
            console.log(`    ℹ️ Class ${classId} (${classDetails.name}) has no term range defined, skipping`);
            skippedClasses++;
            continue;
        }
        console.log(`    📅 Class term range: ${classDetails.start_term_id} to ${classDetails.end_term_id}`);
        const terms = await databaseService.getAcademicTermsInRange(classDetails.start_term_id, classDetails.end_term_id);
        if (terms.length === 0) {
            console.log(`    ℹ️ No terms found in range ${classDetails.start_term_id} to ${classDetails.end_term_id}, skipping`);
            skippedClasses++;
            continue;
        }
        console.log(`    📋 Found ${terms.length} terms for this class: ${terms.map(t => `${t.name} (${t.id})`).join(', ')}`);
        for (const term of terms) {
            console.log(`    📊 Fetching term grades: Class ${classId}, Term ${term.id} (${term.name})...`);
            try {
                const termGradeResponse = await this.getTermGrades(apiKey, classId, term.id);
                if (termGradeResponse?.students) {
                    const count = termGradeResponse.students.length;
                    totalTermGradesFetched += count;
                    totalTermGradesSaved += count;
                    console.log(`      ✅ Fetched and saved ${count} term grades`);
                }
                else {
                    console.log(`      ℹ️ No term grades found for this class/term combination`);
                }
            }
            catch (error) {
                errors++;
                console.warn(`      ⚠️ Failed to fetch term grades for class ${classId}, term ${term.id}: ${error.message}`);
            }
        }
    }
    console.log(`\n✅ Summary:`);
    console.log(`   - Processed ${uniqueClassIds.length} classes`);
    console.log(`   - Skipped ${skippedClasses} classes (no term range or no terms found)`);
    console.log(`   - Fetched and saved ${totalTermGradesSaved} term grades`);
    if (errors > 0) {
        console.log(`   - ⚠️ ${errors} errors encountered`);
    }
    console.log(`\n✅ Completed syncing term grades for year group ${yearGroupId}`);
}
//# sourceMappingURL=termGrades.js.map