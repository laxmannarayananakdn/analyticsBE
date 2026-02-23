/**
 * Staff Allocations Methods
 * Handles fetching and saving staff allocations from Nexquare API
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare.js';
import type { NexquareConfig } from '../../middleware/configLoader.js';
import { executeQuery } from '../../config/database.js';
import { databaseService } from '../DatabaseService.js';
import type { BaseNexquareService } from './BaseNexquareService.js';

/**
 * Get staff allocations and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export async function getStaffAllocations(
  this: BaseNexquareService,
  config: NexquareConfig,
  schoolId?: string,
  academicYear?: string
): Promise<any[]> {
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    console.log(`👨‍🏫 Fetching staff allocations for school ${targetSchoolId}...`);
    
    const allAllocations: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    // Get the school sourced_id from sourced_id
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Allocations will be saved with school_id = NULL.`);
    }

    while (hasMore) {
      // Use staffAllocation endpoint (camelCase, similar to studentsAllocation)
      const endpoint = `${NEXQUARE_ENDPOINTS.STAFF_ALLOCATIONS}/${targetSchoolId}/staffAllocation`;
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
        allocations = [response];
      }

      if (allocations.length === 0) {
        hasMore = false;
        break;
      }

      allAllocations.push(...allocations);
      console.log(`   Fetched ${allocations.length} staff allocation(s) (total: ${allAllocations.length})`);

      // If we got fewer than the limit, we've reached the end
      if (allocations.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Found ${allAllocations.length} total staff allocation(s)`);

    // Save staff allocation relationships using bulk insert
    console.log('💾 Preparing staff allocation relationships for bulk insert...');
    
    // Collect all staff sourced IDs for bulk lookup
    const staffSourcedIds = new Set<string>();
    for (const allocation of allAllocations) {
      const data = allocation as any;
      const staffSourcedId = data.sourcedId || data.staffSourcedId;
      if (staffSourcedId) {
        staffSourcedIds.add(staffSourcedId);
      }
    }

    // Bulk fetch staff IDs (similar to students)
    const staffIdMap = new Map<string, { id: number; sourced_id: string }>();
    if (staffSourcedIds.size > 0) {
      const uniqueIds = Array.from(staffSourcedIds);
      const batchSize = 1000;
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const placeholders = batch.map((_, idx) => `@id${idx}`).join(',');
        const query = `
          SELECT id, sourced_id FROM NEX.staff WHERE sourced_id IN (${placeholders});
        `;
        const params: Record<string, any> = {};
        batch.forEach((id, idx) => {
          params[`id${idx}`] = id;
        });
        const result = await executeQuery<{ id: number; sourced_id: string }>(query, params);
        if (!result.error && result.data) {
          result.data.forEach(row => {
            staffIdMap.set(row.sourced_id, { id: row.id, sourced_id: row.sourced_id });
          });
        }
      }
    }

    const recordsToInsert: Array<{
      staff_id?: number | null;
      staff_sourced_id: string;
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
    }> = [];

    let skippedCount = 0;

    for (const allocation of allAllocations) {
      const data = allocation as any;
      const staffSourcedId = data.sourcedId || data.staffSourcedId;
      const academicYear = data.academicYear || null;

      if (!staffSourcedId) {
        continue;
      }

      const staffInfo = staffIdMap.get(staffSourcedId);
      const staffId = staffInfo?.id || null;

      const subjects = data.subject || [];
      const cohorts = data.cohort || [];
      const lessons = data.lesson || [];

      // Add subject allocations
      for (const subject of subjects) {
        try {
          recordsToInsert.push({
            staff_id: staffId,
            staff_sourced_id: staffSourcedId,
            school_id: schoolSourcedId,
            academic_year: academicYear,
            subject_sourced_id: subject.subjectSourcedId || subject.subject_sourced_id || null,
            subject_id: subject.subjectId || subject.subject_id || null,
            subject_name: subject.subjectName || subject.subject_name || null,
            allocation_type: subject.allocationType || subject.allocation_type || null,
          });
        } catch (error: any) {
          skippedCount++;
        }
      }

      // Add cohort allocations
      for (const cohort of cohorts) {
        try {
          recordsToInsert.push({
            staff_id: staffId,
            staff_sourced_id: staffSourcedId,
            school_id: schoolSourcedId,
            academic_year: academicYear,
            cohort_sourced_id: cohort.sourcedId || cohort.sourced_id || null,
            cohort_id: cohort.cohortId || cohort.cohort_id || null,
            cohort_name: cohort.cohortName || cohort.cohort_name || null,
          });
        } catch (error: any) {
          skippedCount++;
        }
      }

      // Add lesson allocations
      for (const lesson of lessons) {
        try {
          recordsToInsert.push({
            staff_id: staffId,
            staff_sourced_id: staffSourcedId,
            school_id: schoolSourcedId,
            academic_year: academicYear,
            lesson_sourced_id: lesson.sourcedId || lesson.sourced_id || null,
            lesson_id: lesson.lessonId || lesson.lesson_id || null,
            lesson_name: lesson.lessonName || lesson.lesson_name || null,
            class_id: lesson.classId || lesson.class_id || null,
          });
        } catch (error: any) {
          skippedCount++;
        }
      }
    }

    // Normalize academic year for comparison (handles "2025 - 2026" vs "2025-2026" etc.)
    const normalizeYear = (y: string | null | undefined) =>
      (y ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Always use academic_year from the DATA for delete - ensures we match the exact format in DB
    const yearsToDelete = Array.from(new Set(recordsToInsert.map((r) => r.academic_year ?? null)));

    // Filter records when syncing for a specific year (API returns all years)
    // Use normalized comparison so "2025-2026" param matches "2025 - 2026" from API
    const recordsForInsert =
      academicYear != null && academicYear !== ''
        ? recordsToInsert.filter((r) => normalizeYear(r.academic_year) === normalizeYear(academicYear))
        : recordsToInsert;

    if (recordsForInsert.length === 0) {
      console.log(
        `   ℹ️  No staff allocation records to insert for the target year${academicYear ? ` (${academicYear})` : ''}`
      );
      return allAllocations;
    }

    // Delete existing allocations for school + each academic year before insert (prevent duplicates)
    // Use schoolSourcedId when available; fallback to targetSchoolId (config may use id or sourced_id)
    const schoolIdForDelete = schoolSourcedId ?? targetSchoolId;
    if (schoolIdForDelete) {
      for (const year of yearsToDelete) {
        const { deleted, error: deleteError } = await databaseService.deleteNexquareStaffAllocationsBySchoolAndYear(
          schoolIdForDelete,
          year
        );
        if (deleteError) {
          console.warn(`⚠️  Failed to delete existing staff allocations (year: ${year ?? 'null'}): ${deleteError}`);
        } else if (deleted > 0) {
          console.log(`🗑️  Deleted ${deleted} existing staff allocation(s) for school/year ${year ?? 'null'} before sync`);
        }
      }
    }

    console.log(`   💾 Bulk inserting ${recordsForInsert.length} staff allocation relationship(s) to database...`);
    const { inserted, error: bulkError } = await databaseService.bulkInsertStaffAllocations(recordsForInsert);

    if (bulkError) {
      console.error(`❌ Bulk insert failed: ${bulkError}`);
      throw new Error(`Bulk insert failed: ${bulkError}`);
    }

    console.log(`✅ Saved ${inserted} staff allocation relationship(s) to database`);
    if (skippedCount > 0) {
      console.warn(`⚠️  Skipped ${skippedCount} allocation(s) due to errors`);
    }

    return allAllocations;
  } catch (error) {
    console.error('Failed to fetch staff allocations:', error);
    throw error;
  }
}
