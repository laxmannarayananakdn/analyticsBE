/**
 * Year Group Students Methods
 * Handles fetching students for year group(s) from ManageBac API
 */
import { databaseService } from '../DatabaseService.js';
export async function getYearGroupStudents(apiKey, yearGroupId, academicYearId, termId, baseUrl) {
    try {
        const endpointBase = `/year-groups/${yearGroupId}/students`;
        const existingParams = {};
        if (academicYearId)
            existingParams.academic_year_id = academicYearId;
        if (termId)
            existingParams.term_id = termId;
        const students = await this.fetchAllPaginated(endpointBase, 'students', apiKey, baseUrl, existingParams, 'Year group students');
        const responseData = { students };
        if (this.currentSchoolId && students.length > 0) {
            console.log('💾 Processing year group students for database...');
            const studentIds = students.map((student) => student.id);
            const studentDetails = [];
            for (const studentId of studentIds) {
                try {
                    const studentResponse = await this.makeRequest(`/students/${studentId}`, apiKey, {}, baseUrl);
                    if (studentResponse.data && studentResponse.data.student) {
                        studentDetails.push(studentResponse.data.student);
                    }
                    else if (studentResponse.data) {
                        studentDetails.push(studentResponse.data);
                    }
                }
                catch (studentError) {
                    console.warn(`⚠️ Failed to fetch student ${studentId}:`, studentError);
                }
            }
            if (studentDetails.length > 0) {
                const studentsForDb = studentDetails.map((student) => ({
                    id: parseInt(student.id),
                    first_name: student.first_name,
                    last_name: student.last_name,
                    email: student.email,
                    student_id: student.student_id,
                    archived: !student.is_active,
                }));
                const { error } = await databaseService.upsertStudents(studentsForDb);
                if (error) {
                    console.error('❌ Failed to save students to database:', error);
                }
                else {
                    console.log('✅ Students saved to database');
                    const yearGroupIdNum = parseInt(yearGroupId);
                    if (!isNaN(yearGroupIdNum)) {
                        console.log(`💾 Saving year group-student relationships for year group ${yearGroupIdNum}...`);
                        let relationshipCount = 0;
                        let relationshipErrors = 0;
                        for (const student of studentDetails) {
                            const studentIdNum = parseInt(student.id);
                            if (!isNaN(studentIdNum)) {
                                const { error: relError } = await databaseService.upsertYearGroupStudent(yearGroupIdNum, studentIdNum);
                                if (relError) {
                                    console.warn(`⚠️ Failed to save relationship for student ${studentIdNum}:`, relError);
                                    relationshipErrors++;
                                }
                                else {
                                    relationshipCount++;
                                }
                            }
                        }
                        if (relationshipCount > 0) {
                            console.log(`✅ Saved ${relationshipCount} year group-student relationship(s)`);
                        }
                        if (relationshipErrors > 0) {
                            console.warn(`⚠️ Failed to save ${relationshipErrors} relationship(s)`);
                        }
                    }
                }
            }
        }
        return responseData;
    }
    catch (error) {
        console.error('Failed to fetch year group students:', error);
        throw error;
    }
}
export async function getAllYearGroupStudents(apiKey, academicYearId, termId, baseUrl) {
    try {
        if (!this.currentSchoolId) {
            console.log('⚠️ School ID not set, fetching school details first...');
            await this.getSchoolDetails(apiKey, baseUrl);
        }
        if (!this.currentSchoolId) {
            throw new Error('School ID is required to fetch year group students');
        }
        let yearGroups = await databaseService.getYearGroupsForSchool(this.currentSchoolId);
        if (yearGroups.length === 0) {
            console.log('⚠️ No year groups found in database. Fetching year groups first...');
            await this.getYearGroups(apiKey, baseUrl);
            const updatedYearGroups = await databaseService.getYearGroupsForSchool(this.currentSchoolId);
            if (updatedYearGroups.length === 0) {
                return {
                    success: true,
                    message: 'No year groups found for this school',
                    total_students: 0,
                    year_groups_processed: 0,
                    results: []
                };
            }
            yearGroups = updatedYearGroups;
        }
        console.log(`📚 Fetching students for ${yearGroups.length} year group(s)...`);
        const allResults = [];
        let totalStudents = 0;
        let successCount = 0;
        let errorCount = 0;
        for (const yearGroup of yearGroups) {
            try {
                console.log(`   Processing year group: ${yearGroup.name} (ID: ${yearGroup.id})...`);
                const result = await this.getYearGroupStudents(apiKey, yearGroup.id.toString(), academicYearId, termId, baseUrl);
                const studentCount = result?.students?.length || 0;
                totalStudents += studentCount;
                successCount++;
                allResults.push({
                    year_group_id: yearGroup.id,
                    year_group_name: yearGroup.name,
                    student_count: studentCount,
                    students: result?.students || []
                });
                console.log(`   ✅ Fetched ${studentCount} student(s) for ${yearGroup.name} and saved relationships`);
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            catch (error) {
                errorCount++;
                console.error(`   ❌ Failed to fetch students for year group ${yearGroup.name} (ID: ${yearGroup.id}):`, error.message);
                allResults.push({
                    year_group_id: yearGroup.id,
                    year_group_name: yearGroup.name,
                    error: error.message,
                    student_count: 0
                });
            }
        }
        console.log(`✅ Completed fetching students for all year groups. Total: ${totalStudents} students across ${successCount} year group(s)`);
        if (errorCount > 0) {
            console.warn(`⚠️ Failed to fetch students for ${errorCount} year group(s)`);
        }
        return {
            success: true,
            message: `Fetched students for ${successCount} year group(s)`,
            total_students: totalStudents,
            year_groups_processed: successCount,
            year_groups_failed: errorCount,
            results: allResults
        };
    }
    catch (error) {
        console.error('Failed to fetch all year group students:', error);
        throw error;
    }
}
//# sourceMappingURL=yearGroupStudents.js.map