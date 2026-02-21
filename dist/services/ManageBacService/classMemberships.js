/**
 * Class Memberships Sync Methods
 * Handles syncing class memberships for year groups from ManageBac API
 */
import { databaseService } from '../DatabaseService.js';
export async function syncClassMembershipsForYearGroup(apiKey, yearGroupId) {
    if (!this.currentSchoolId) {
        console.error('❌ No school context available');
        return;
    }
    console.log(`\n📚 Syncing class memberships for year group ${yearGroupId}...`);
    const students = await databaseService.getStudentsForYearGroup(yearGroupId);
    if (students.length === 0) {
        console.log(`ℹ️ No students found for year group ${yearGroupId}`);
        return;
    }
    console.log(`  📋 Found ${students.length} students in year group`);
    console.log(`  📥 Processing students one by one...\n`);
    const fetchedClassIds = new Set();
    let totalMembershipsSaved = 0;
    let totalClassesSaved = 0;
    for (let i = 0; i < students.length; i++) {
        const student = students[i];
        console.log(`  👤 Student ${i + 1}/${students.length}: ${student.first_name} ${student.last_name} (ID: ${student.id})`);
        try {
            const membershipResponse = await this.getMemberships(apiKey, [student.id], undefined, undefined, undefined, undefined);
            let memberships = [];
            if (membershipResponse?.memberships) {
                memberships = Array.isArray(membershipResponse.memberships) ? membershipResponse.memberships : [];
            }
            else if (membershipResponse?.data?.memberships) {
                memberships = Array.isArray(membershipResponse.data.memberships) ? membershipResponse.data.memberships : [];
            }
            else if (Array.isArray(membershipResponse)) {
                memberships = membershipResponse;
            }
            if (memberships.length === 0) {
                console.log(`    ℹ️ No memberships found for this student`);
                continue;
            }
            console.log(`    📋 Found ${memberships.length} memberships`);
            const membershipsForDb = [];
            for (const membership of memberships) {
                const classId = typeof membership.class_id === 'string'
                    ? parseInt(membership.class_id, 10)
                    : membership.class_id;
                if (!classId) {
                    console.warn(`    ⚠️ Membership missing class_id, skipping`);
                    continue;
                }
                if (!fetchedClassIds.has(classId)) {
                    console.log(`    📖 Fetching class ${classId}...`);
                    try {
                        const classData = await this.getClassById(apiKey, classId);
                        if (!classData) {
                            console.warn(`      ⚠️ Class ${classId} not found, skipping membership`);
                            continue;
                        }
                        const classForDb = {
                            id: typeof classData.id === 'string' ? parseInt(classData.id, 10) : classData.id,
                            school_id: this.currentSchoolId,
                            subject_id: classData.subject_id || null,
                            name: classData.name || '',
                            description: classData.description || null,
                            uniq_id: classData.uniq_id || null,
                            class_section: classData.class_section || null,
                            language: classData.language || 'en',
                            program_code: classData.program_code || '',
                            grade_number: classData.grade_number || null,
                            start_term_id: classData.start_term_id || null,
                            end_term_id: classData.end_term_id || null,
                            archived: classData.archived || false,
                            lock_memberships: classData.lock_memberships || null
                        };
                        const { error: classError } = await databaseService.upsertClasses([classForDb], this.currentSchoolId);
                        if (classError) {
                            console.warn(`      ⚠️ Failed to save class ${classId}: ${classError}`);
                            continue;
                        }
                        fetchedClassIds.add(classId);
                        totalClassesSaved++;
                        console.log(`      ✅ Saved class: ${classData.name}`);
                    }
                    catch (error) {
                        console.warn(`      ⚠️ Failed to fetch class ${classId}: ${error.message}`);
                        continue;
                    }
                }
                membershipsForDb.push({
                    class_id: classId,
                    user_id: student.id,
                    role: membership.role || 'Student',
                    level: membership.level || null,
                    show_on_reports: membership.show_on_reports !== undefined ? membership.show_on_reports : true,
                    first_joined_at: membership.first_joined_at ? new Date(membership.first_joined_at) : null
                });
            }
            if (membershipsForDb.length > 0) {
                const { error: membershipsError } = await databaseService.upsertClassMemberships(membershipsForDb);
                if (membershipsError) {
                    console.warn(`    ⚠️ Failed to save memberships: ${membershipsError}`);
                }
                else {
                    totalMembershipsSaved += membershipsForDb.length;
                    console.log(`    ✅ Saved ${membershipsForDb.length} memberships`);
                }
            }
        }
        catch (error) {
            console.warn(`    ⚠️ Failed to process student ${student.id}: ${error.message}`);
        }
    }
    console.log(`\n✅ Summary:`);
    console.log(`   - Processed ${students.length} students`);
    console.log(`   - Saved ${totalClassesSaved} unique classes`);
    console.log(`   - Saved ${totalMembershipsSaved} memberships`);
    console.log(`\n✅ Completed syncing class memberships for year group ${yearGroupId}`);
}
//# sourceMappingURL=classMemberships.js.map