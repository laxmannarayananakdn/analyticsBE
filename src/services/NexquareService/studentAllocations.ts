/**
 * Student Allocations Methods
 * Handles fetching and saving student allocations from Nexquare API
 * 
 * NOTE: This method uses helper methods bulkGetStudentIds and bulkGetGroupIds
 * which should be available on the class that extends BaseNexquareService
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare.js';
import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { StudentAllocationResponse } from '../../types/nexquare.js';
import { databaseService } from '../DatabaseService.js';
import type { BaseNexquareService } from './BaseNexquareService.js';

/**
 * Get student allocations and extract subjects, cohorts, groups, homerooms
 * Can be added to a class that extends BaseNexquareService
 * 
 * NOTE: Requires bulkGetStudentIds and bulkGetGroupIds helper methods
 */
export async function getStudentAllocations(
  this: BaseNexquareService & { bulkGetStudentIds: (ids: string[]) => Promise<Map<string, { id: number; sourced_id: string }>>; bulkGetGroupIds: (ids: string[]) => Promise<Map<string, { id: number; sourced_id: string }>> },
  config: NexquareConfig,
  schoolId?: string,
  academicYear?: string
): Promise<StudentAllocationResponse[]> {
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    console.log(`🔗 Fetching student allocations for school ${targetSchoolId}...`);
    
    const allAllocations: StudentAllocationResponse[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    // Get the school sourced_id from sourced_id
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Allocations will be saved with school_id = NULL.`);
    }

    // Track unique entities for extraction
    const subjectsMap = new Map<string, any>();
    const cohortsMap = new Map<string, any>();
    const groupsMap = new Map<string, any>();
    const homeroomsMap = new Map<string, any>();

    while (hasMore) {
      // Use studentsAllocation endpoint (camelCase, not students/allocations)
      const endpoint = `${NEXQUARE_ENDPOINTS.STUDENT_ALLOCATIONS}/${targetSchoolId}/studentsAllocation`;
      const queryParams = new URLSearchParams();
      queryParams.append('offset', offset.toString());
      queryParams.append('limit', limit.toString());

      const url = `${endpoint}?${queryParams.toString()}`;
      const response = await this.makeRequest<Record<string, unknown>>(url, config);

      // Handle different response structures
      let allocations: any[] = [];
      if (Array.isArray(response)) {
        allocations = response;
      } else if (response.users && Array.isArray(response.users)) {
        allocations = response.users;
      } else if (response.user) {
        allocations = [response];
      } else if (response.data) {
        allocations = Array.isArray(response.data) ? response.data : [response.data];
      } else if (typeof response === 'object' && response !== null) {
        // If it's a single object, wrap it in an array
        allocations = [response];
      }

      // Debug: Log response structure for first page
      if (offset === 0 && allocations.length > 0) {
        const firstAlloc = allocations[0] as any;
        console.log('🔍 First allocation keys:', Object.keys(firstAlloc).join(', '));
        
        // Log structure of arrays if they exist
        if (firstAlloc.subject && Array.isArray(firstAlloc.subject) && firstAlloc.subject.length > 0) {
          console.log('🔍 First subject keys:', Object.keys(firstAlloc.subject[0]).join(', '));
          console.log('🔍 First subject sample:', JSON.stringify(firstAlloc.subject[0]).substring(0, 200));
        }
        
        if (firstAlloc.homeRoom && Array.isArray(firstAlloc.homeRoom) && firstAlloc.homeRoom.length > 0) {
          console.log('🔍 First homeRoom keys:', Object.keys(firstAlloc.homeRoom[0]).join(', '));
          console.log('🔍 First homeRoom sample:', JSON.stringify(firstAlloc.homeRoom[0]).substring(0, 200));
        }
        
        if (firstAlloc.cohort && Array.isArray(firstAlloc.cohort) && firstAlloc.cohort.length > 0) {
          console.log('🔍 First cohort keys:', Object.keys(firstAlloc.cohort[0]).join(', '));
        }
        
        if (firstAlloc.group && Array.isArray(firstAlloc.group) && firstAlloc.group.length > 0) {
          console.log('🔍 First group keys:', Object.keys(firstAlloc.group[0]).join(', '));
          console.log('🔍 First group sample:', JSON.stringify(firstAlloc.group[0]).substring(0, 200));
        }
        
        // Check if cohorts/groups exist at all
        console.log('🔍 Has cohort array?', !!firstAlloc.cohort, 'Length:', firstAlloc.cohort?.length || 0);
        console.log('🔍 Has group array?', !!firstAlloc.group, 'Length:', firstAlloc.group?.length || 0);
        console.log('🔍 Has lesson array?', !!firstAlloc.lesson, 'Length:', firstAlloc.lesson?.length || 0);
        
        // Check all top-level keys to see what's available
        console.log('🔍 All top-level keys:', Object.keys(firstAlloc).join(', '));
      }

      if (allocations.length === 0) {
        hasMore = false;
        break;
      }

      allAllocations.push(...allocations);
      console.log(`   Fetched ${allocations.length} student allocation(s) (total: ${allAllocations.length})`);

      // Extract entities from allocations
      for (const allocation of allocations) {
        // Based on debug output: subject and homeRoom are at top level, not in user
        // The user property appears to be an array, so we check top level first
        const data = allocation as any;
        
        // Extract subjects - check top level first, then nested in user
        // Note: subject.sourcedId is the allocation ID, subject.subjectSourcedId is the actual subject ID
        const subjects = data.subject || data.subjects || (data.user?.subject) || (data.user?.subjects) || [];
        if (Array.isArray(subjects) && subjects.length > 0) {
          for (const subject of subjects) {
            // Use subjectSourcedId as the unique identifier for the subject itself
            const sourcedId = subject.subjectSourcedId || subject.subject_sourced_id;
            if (sourcedId) {
              if (!subjectsMap.has(sourcedId)) {
                subjectsMap.set(sourcedId, {
                  sourced_id: sourcedId,
                  subject_id: subject.subjectId || subject.subject_id || null,
                  subject_name: subject.subjectName || subject.subject_name || 'Unknown',
                  school_id: schoolSourcedId,
                });
              }
            }
          }
        }

        // Extract cohorts - check top level first, then nested in user
        const cohorts = data.cohort || data.cohorts || (data.user?.cohort) || (data.user?.cohorts) || [];
        if (Array.isArray(cohorts) && cohorts.length > 0) {
          for (const cohort of cohorts) {
            const sourcedId = cohort.sourcedId || cohort.sourced_id;
            if (sourcedId) {
              if (!cohortsMap.has(sourcedId)) {
                cohortsMap.set(sourcedId, {
                  sourced_id: sourcedId,
                  cohort_id: cohort.cohortId || cohort.cohort_id || null,
                  cohort_name: cohort.cohortName || cohort.cohort_name || 'Unknown',
                  school_id: schoolSourcedId,
                });
              }
            }
          }
        }

        // Extract groups - check top level first, then nested in user
        const groups = data.group || data.groups || (data.user?.group) || (data.user?.groups) || [];
        if (Array.isArray(groups) && groups.length > 0) {
          for (const group of groups) {
            const sourcedId = group.sourcedId || group.sourced_id;
            if (sourcedId) {
              if (!groupsMap.has(sourcedId)) {
                groupsMap.set(sourcedId, {
                  sourced_id: sourcedId,
                  group_name: group.groupName || group.group_name || 'Unknown',
                  unique_key: group.uniqueKey || group.unique_key || null,
                  school_id: schoolSourcedId,
                });
              }
            }
          }
        }

        // Extract homerooms - check top level first (we saw homeRoom in top level keys)
        const homerooms = data.homeRoom || data.homeRooms || data.homeroom || data.homerooms || 
                         (data.user?.homeRoom) || (data.user?.homeRooms) || [];
        if (Array.isArray(homerooms) && homerooms.length > 0) {
          for (const homeroom of homerooms) {
            const sourcedId = homeroom.sourcedId || homeroom.sourced_id;
            if (sourcedId) {
              if (!homeroomsMap.has(sourcedId)) {
                homeroomsMap.set(sourcedId, {
                  sourced_id: sourcedId,
                  class_name: homeroom.className || homeroom.class_name || null,
                  grade_name: homeroom.gradeName || homeroom.grade_name || null,
                  school_id: schoolSourcedId,
                });
              }
            }
          }
        }
      }

      // If we got fewer than the limit, we've reached the end
      if (allocations.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Found ${allAllocations.length} total student allocation(s)`);
    console.log(`📊 Extracted ${subjectsMap.size} unique subject(s)`);
    console.log(`📊 Extracted ${cohortsMap.size} unique cohort(s)`);
    console.log(`📊 Extracted ${groupsMap.size} unique group(s)`);
    console.log(`📊 Extracted ${homeroomsMap.size} unique homeroom(s)`);

    // Save extracted entities to database
    console.log('💾 Saving extracted entities to database...');
    
    // Save subjects
    let savedSubjects = 0;
    for (const subject of subjectsMap.values()) {
      const { error } = await databaseService.upsertNexquareSubject(subject);
      if (!error) savedSubjects++;
    }
    console.log(`✅ Saved ${savedSubjects} subject(s) to database`);

    // Save cohorts
    let savedCohorts = 0;
    for (const cohort of cohortsMap.values()) {
      const { error } = await databaseService.upsertNexquareCohort(cohort);
      if (!error) savedCohorts++;
    }
    console.log(`✅ Saved ${savedCohorts} cohort(s) to database`);

    // Save groups
    let savedGroups = 0;
    for (const group of groupsMap.values()) {
      const { error } = await databaseService.upsertNexquareGroup(group);
      if (!error) savedGroups++;
    }
    console.log(`✅ Saved ${savedGroups} group(s) to database`);

    // Save homerooms
    let savedHomerooms = 0;
    for (const homeroom of homeroomsMap.values()) {
      const { error } = await databaseService.upsertNexquareHomeroom(homeroom);
      if (!error) savedHomerooms++;
    }
    console.log(`✅ Saved ${savedHomerooms} homeroom(s) to database`);

    // Now save the actual student allocation relationships using bulk insert
    console.log('💾 Preparing student allocation relationships for bulk insert...');
    
    // Collect all student sourced IDs for bulk lookup
    const studentSourcedIds = new Set<string>();
    for (const allocation of allAllocations) {
      const data = allocation as any;
      const studentSourcedId = data.sourcedId || data.studentSourcedId;
      if (studentSourcedId) {
        studentSourcedIds.add(studentSourcedId);
      }
    }

    console.log(`   🔍 Bulk fetching student IDs for ${studentSourcedIds.size} unique student(s)...`);
    const studentIdMap = await this.bulkGetStudentIds(Array.from(studentSourcedIds));
    console.log(`   ✅ Found ${studentIdMap.size} student ID(s) in database`);

    // Collect all group sourced IDs for bulk lookup
    const groupSourcedIds = new Set<string>();
    for (const allocation of allAllocations) {
      const data = allocation as any;
      const groups = data.group || data.groups || (data.user?.group) || (data.user?.groups) || [];
      if (Array.isArray(groups)) {
        for (const group of groups) {
          const sourcedId = group.sourcedId || group.sourced_id;
          if (sourcedId) {
            groupSourcedIds.add(sourcedId);
          }
        }
      }
    }

    console.log(`   🔍 Bulk fetching group IDs for ${groupSourcedIds.size} unique group(s)...`);
    const groupIdMap = await this.bulkGetGroupIds(Array.from(groupSourcedIds));
    console.log(`   ✅ Found ${groupIdMap.size} group ID(s) in database`);

    const recordsToInsert: Array<{
      student_id?: number | null;
      student_sourced_id: string;
      school_id?: string | null;
      academic_year?: string | null;
      subject_sourced_id?: string | null;
      subject_id?: number | null;
      subject_name?: string | null;
      allocation_type?: string | null;
      cohort_sourced_id?: string | null;
      cohort_id?: number | null;
      cohort_name?: string | null;
      lesson_sourced_id?: string | null;
      lesson_id?: string | null;
      lesson_name?: string | null;
      class_id?: number | null;
      homeroom_sourced_id?: string | null;
      homeroom_class_name?: string | null;
      homeroom_grade_name?: string | null;
      group_sourced_id?: string | null;
      group_id?: number | null;
      group_name?: string | null;
    }> = [];

    let skippedCount = 0;

    for (const allocation of allAllocations) {
      const data = allocation as any;
      const studentSourcedId = data.sourcedId || data.studentSourcedId;
      const academicYear = data.academicYear || null;

      if (!studentSourcedId) {
        continue;
      }

      const studentInfo = studentIdMap.get(studentSourcedId);
      const studentId = studentInfo?.id || null;

      // Collect all allocation types
      const subjects = data.subject || [];
      const cohorts = data.cohort || [];
      const lessons = data.lesson || [];
      const homerooms = data.homeRoom || [];
      const groups = data.group || data.groups || (data.user?.group) || (data.user?.groups) || [];

      // Add subject allocations
      for (const subject of subjects) {
        try {
          recordsToInsert.push({
            student_id: studentId,
            student_sourced_id: studentSourcedId,
            school_id: schoolSourcedId,
            academic_year: academicYear,
            subject_sourced_id: subject.subjectSourcedId || null,
            subject_id: subject.subjectId || null,
            subject_name: subject.subjectName || null,
            allocation_type: subject.allocationType || null,
          });
        } catch (error: any) {
          skippedCount++;
        }
      }

      // Add cohort allocations
      for (const cohort of cohorts) {
        try {
          recordsToInsert.push({
            student_id: studentId,
            student_sourced_id: studentSourcedId,
            school_id: schoolSourcedId,
            academic_year: academicYear,
            cohort_sourced_id: cohort.sourcedId || null,
            cohort_id: cohort.cohortId || null,
            cohort_name: cohort.cohortName || null,
          });
        } catch (error: any) {
          skippedCount++;
        }
      }

      // Add lesson allocations
      for (const lesson of lessons) {
        try {
          recordsToInsert.push({
            student_id: studentId,
            student_sourced_id: studentSourcedId,
            school_id: schoolSourcedId,
            academic_year: academicYear,
            lesson_sourced_id: lesson.sourcedId || null,
            lesson_id: lesson.lessonId || null,
            lesson_name: lesson.lessonName || null,
            class_id: lesson.classId || null,
          });
        } catch (error: any) {
          skippedCount++;
        }
      }

      // Add homeroom allocations
      for (const homeroom of homerooms) {
        try {
          recordsToInsert.push({
            student_id: studentId,
            student_sourced_id: studentSourcedId,
            school_id: schoolSourcedId,
            academic_year: academicYear,
            homeroom_sourced_id: homeroom.sourcedId || null,
            homeroom_class_name: homeroom.className || null,
            homeroom_grade_name: homeroom.gradeName || null,
          });
        } catch (error: any) {
          skippedCount++;
        }
      }

      // Add group allocations
      for (const group of groups) {
        try {
          const groupSourcedId = group.sourcedId || group.sourced_id;
          const groupInfo = groupSourcedId ? groupIdMap.get(groupSourcedId) : null;
          const groupId = groupInfo?.id || null;
          const groupName = group.groupName || group.group_name || null;

          recordsToInsert.push({
            student_id: studentId,
            student_sourced_id: studentSourcedId,
            school_id: schoolSourcedId,
            academic_year: academicYear,
            group_sourced_id: groupSourcedId || null,
            group_id: groupId,
            group_name: groupName,
          });
        } catch (error: any) {
          skippedCount++;
        }
      }
    }

    // Nexquare API returns current academic year data only (no year param in request).
    // Use academic_year from the DATA for delete - e.g. "2025-2026" from first row / all rows.
    const yearsToDelete = Array.from(new Set(recordsToInsert.map((r) => r.academic_year ?? null)));

    // Insert all received records - API already returns only current year data
    const recordsForInsert = recordsToInsert;

    if (recordsForInsert.length === 0) {
      console.log(`   ℹ️  No student allocation records to insert`);
      return allAllocations;
    }

    // Delete existing allocations for school + academic_year from data (Nexquare returns current year only)
    // Use schoolSourcedId when available; fallback to targetSchoolId (config may use id or sourced_id)
    const schoolIdForDelete = schoolSourcedId ?? targetSchoolId;
    if (schoolIdForDelete && yearsToDelete.length > 0) {
      console.log(`   🗑️  Deleting existing allocations for school + year(s): ${yearsToDelete.join(', ')}`);
      for (const year of yearsToDelete) {
        const { deleted, error: deleteError } = await databaseService.deleteNexquareStudentAllocationsBySchoolAndYear(
          schoolIdForDelete,
          year
        );
        if (deleteError) {
          console.warn(`⚠️  Failed to delete existing student allocations (year: ${year ?? 'null'}): ${deleteError}`);
        } else if (deleted > 0) {
          console.log(`   🗑️  Deleted ${deleted} existing student allocation(s) for school/year ${year ?? 'null'}`);
        }
      }
    }

    console.log(`   💾 Bulk inserting ${recordsForInsert.length} student allocation relationship(s) to database...`);
    const { inserted, error: bulkError } = await databaseService.bulkInsertStudentAllocations(recordsForInsert);

    if (bulkError) {
      console.error(`❌ Bulk insert failed: ${bulkError}`);
      throw new Error(`Bulk insert failed: ${bulkError}`);
    }

    console.log(`✅ Saved ${inserted} student allocation relationship(s) to database`);
    if (skippedCount > 0) {
      console.warn(`⚠️  Skipped ${skippedCount} allocation(s) due to errors`);
    }

    // Note: Student fallout data is no longer populated in RP.student_fallout table.
    // The fallout status and gender information are available directly from
    // NEX.student_allocations and NEX.groups tables, which include historical data
    // that NEX.students (current students only) does not have.

    return allAllocations;
  } catch (error) {
    console.error('Failed to fetch student allocations:', error);
    throw error;
  }
}
