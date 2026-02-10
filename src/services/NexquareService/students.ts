/**
 * Students Methods
 * Handles fetching and saving students from Nexquare API
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare';
import type { NexquareConfig } from '../../middleware/configLoader';
import type { NexquareUser, UsersResponse } from '../../types/nexquare';
import { databaseService } from '../DatabaseService';
import type { BaseNexquareService } from './BaseNexquareService';

/**
 * Get students with pagination and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export async function getStudents(
  this: BaseNexquareService,
  config: NexquareConfig,
  schoolId?: string,
  filter?: string,
  fetchMode: number = 1
): Promise<NexquareUser[]> {
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    console.log(`👥 Fetching students for school ${targetSchoolId}...`);
    
    const allStudents: NexquareUser[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const endpoint = `${NEXQUARE_ENDPOINTS.STUDENTS}/${targetSchoolId}/students/`;
      const queryParams = new URLSearchParams();
      queryParams.append('offset', offset.toString());
      queryParams.append('limit', limit.toString());
      queryParams.append('fetchMode', fetchMode.toString());
      if (filter) {
        queryParams.append('filter', filter);
      }

      const url = `${endpoint}?${queryParams.toString()}`;
      const response = await this.makeRequest<UsersResponse>(url, config);

      const users = response.users || [];
      if (users.length === 0) {
        hasMore = false;
        break;
      }

      allStudents.push(...users);
      console.log(`   Fetched ${users.length} students (total: ${allStudents.length})`);

      // If we got fewer than the limit, we've reached the end
      if (users.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Found ${allStudents.length} total student(s)`);

    // Save students to database using bulk insert
    console.log('💾 Preparing students for bulk insert...');
    
    // Get the school sourced_id from sourced_id
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Students will be saved with school_id = NULL.`);
      console.warn(`   Make sure to run "Get Schools" first to populate the schools table.`);
    }

    // Helper function to parse date strings
    const parseDate = (dateStr: string | null | undefined): Date | null => {
      if (!dateStr) return null;
      try {
        return new Date(dateStr);
      } catch {
        return null;
      }
    };

    // Prepare all records for bulk insert
    const recordsToInsert: Array<{
      school_id?: string | null;
      sourced_id: string;
      identifier?: string | null;
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      username?: string | null;
      user_type?: string | null;
      status?: string | null;
      date_last_modified?: Date | string | null;
      academic_year?: string | null;
      metadata?: string | null;
      current_grade?: string | null;
      current_class?: string | null;
      current_class_id?: number | null;
      grades?: string | null;
      phone?: string | null;
      mobile_number?: string | null;
      sms?: string | null;
      gender?: string | null;
      student_dob?: Date | string | null;
      religion?: string | null;
      admission_date?: Date | string | null;
      join_date?: Date | string | null;
      parent_name?: string | null;
      guardian_one_full_name?: string | null;
      guardian_two_full_name?: string | null;
      guardian_one_mobile?: string | null;
      guardian_two_mobile?: string | null;
      primary_contact?: string | null;
      student_reg_id?: string | null;
      family_code?: string | null;
      student_national_id?: string | null;
      student_status?: string | null;
      class_grade?: string | null;
      class_section?: string | null;
      homeroom_teacher_sourced_id?: string | null;
    }> = [];

    let skippedCount = 0;

    for (const student of allStudents) {
      try {
        const metadataJson = JSON.stringify(student);
        const dateLastModified = student.dateLastModified ? new Date(student.dateLastModified) : null;
        const studentData = student as any;
        const fullName = studentData.fullName || 
          (student.givenName || student.familyName
            ? `${student.givenName || ''} ${student.familyName || ''}`.trim()
            : null);
        const classDetails = studentData.classDetails || {};
        const gradesJson = studentData.grades && Array.isArray(studentData.grades)
          ? JSON.stringify(studentData.grades)
          : null;

        recordsToInsert.push({
          school_id: schoolSourcedId,
          sourced_id: student.sourcedId,
          identifier: student.identifier || null,
          full_name: fullName,
          first_name: student.givenName || null,
          last_name: student.familyName || null,
          email: student.email || null,
          username: student.username || null,
          user_type: student.userType || 'student',
          status: student.status || null,
          date_last_modified: dateLastModified,
          academic_year: studentData.academicYear ? String(studentData.academicYear) : null,
          metadata: metadataJson,
          current_grade: studentData.currentGrade || null,
          current_class: studentData.currentClass || studentData.currentClassName || null,
          current_class_id: studentData.currentClassId || null,
          grades: gradesJson,
          phone: student.phone || null,
          mobile_number: studentData.mobileNumber || null,
          sms: student.sms || null,
          gender: studentData.gender || null,
          student_dob: parseDate(studentData.studentDob),
          religion: studentData.religion || null,
          admission_date: parseDate(studentData.admissionDate),
          join_date: parseDate(studentData.joinDate),
          parent_name: studentData.parentName || null,
          guardian_one_full_name: studentData.guardianOneFullName || null,
          guardian_two_full_name: studentData.guardianTwoFullName || null,
          guardian_one_mobile: studentData.guardianOneMobile || null,
          guardian_two_mobile: studentData.guardianTwoMobile || null,
          primary_contact: studentData.primaryContact || null,
          student_reg_id: studentData.studentRegID || null,
          family_code: studentData.familyCode || null,
          student_national_id: studentData.studentnationalId || null,
          student_status: studentData.studentStatus || null,
          class_grade: classDetails.grade || null,
          class_section: classDetails.section || null,
          homeroom_teacher_sourced_id: classDetails.homeroomTeacherSourcedId || null,
        });
      } catch (error: any) {
        console.error(`❌ Error preparing student ${student.sourcedId}:`, error.message);
        skippedCount++;
      }
    }

    // Bulk insert all records
    console.log(`   💾 Bulk inserting ${recordsToInsert.length} student(s) to database...`);
    const { inserted, error: bulkError } = await databaseService.bulkInsertStudents(recordsToInsert);

    if (bulkError) {
      console.error(`❌ Bulk insert failed: ${bulkError}`);
      throw new Error(`Bulk insert failed: ${bulkError}`);
    }

    console.log(`✅ Saved ${inserted} student(s) to database`);
    if (skippedCount > 0) {
      console.warn(`⚠️  Skipped ${skippedCount} student(s) due to errors`);
    }

    return allStudents;
  } catch (error) {
    console.error('Failed to fetch students:', error);
    throw error;
  }
}
