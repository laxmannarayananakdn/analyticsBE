/**
 * Classes Methods
 * Handles fetching and saving classes from Nexquare API
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare.js';
import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { NexquareClass, ClassesResponse } from '../../types/nexquare.js';
import { databaseService } from '../DatabaseService.js';
import type { BaseNexquareService } from './BaseNexquareService.js';

/**
 * Get classes with pagination and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export async function getClasses(
  this: BaseNexquareService,
  config: NexquareConfig,
  schoolId?: string
): Promise<NexquareClass[]> {
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    console.log(`📚 Fetching classes for school ${targetSchoolId}...`);
    
    const allClasses: NexquareClass[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const endpoint = `${NEXQUARE_ENDPOINTS.CLASSES}/${targetSchoolId}/classes/`;
      const queryParams = new URLSearchParams();
      queryParams.append('offset', offset.toString());
      queryParams.append('limit', limit.toString());

      const url = `${endpoint}?${queryParams.toString()}`;
      const response = await this.makeRequest<ClassesResponse>(url, config);

      const classes = response.classes || [];
      if (classes.length === 0) {
        hasMore = false;
        break;
      }

      allClasses.push(...classes);
      console.log(`   Fetched ${classes.length} classes (total: ${allClasses.length})`);

      // If we got fewer than the limit, we've reached the end
      if (classes.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Found ${allClasses.length} total class(es)`);

    // Save classes to database using bulk insert
    console.log('💾 Preparing classes for bulk insert...');
    
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Classes will be saved with school_id = NULL.`);
    }

    const recordsToInsert: Array<{
      school_id?: string | null;
      sourced_id: string;
      title?: string | null;
      class_name?: string | null;
      grade_name?: string | null;
      course_code?: string | null;
      status?: string | null;
      date_last_modified?: Date | string | null;
      metadata?: string | null;
    }> = [];

    let skippedCount = 0;

    for (const classData of allClasses) {
      try {
        const metadataJson = classData.metadata ? JSON.stringify(classData.metadata) : null;
        const dateLastModified = classData.dateLastModified ? new Date(classData.dateLastModified) : null;

        recordsToInsert.push({
          school_id: schoolSourcedId,
          sourced_id: classData.sourcedId,
          title: classData.title || null,
          class_name: classData.title || null,
          grade_name: classData.grades?.[0] || null,
          course_code: classData.classCode || null,
          status: classData.status || null,
          date_last_modified: dateLastModified,
          metadata: metadataJson,
        });
      } catch (error: any) {
        console.error(`❌ Error preparing class ${classData.sourcedId}:`, error.message);
        skippedCount++;
      }
    }

    console.log(`   💾 Bulk inserting ${recordsToInsert.length} class(es) to database...`);
    const { inserted, error: bulkError } = await databaseService.bulkInsertClasses(recordsToInsert);

    if (bulkError) {
      console.error(`❌ Bulk insert failed: ${bulkError}`);
      throw new Error(`Bulk insert failed: ${bulkError}`);
    }

    console.log(`✅ Saved ${inserted} class(es) to database`);
    if (skippedCount > 0) {
      console.warn(`⚠️  Skipped ${skippedCount} class(es) due to errors`);
    }

    return allClasses;
  } catch (error) {
    console.error('Failed to fetch classes:', error);
    throw error;
  }
}
