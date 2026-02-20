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
  schoolId?: string,
  onLog?: (msg: string) => void
): Promise<NexquareClass[]> {
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    log(`📋 Step 1: Fetching classes from Nexquare API for school ${targetSchoolId}...`);
    
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
      log(`   📄 Page at offset ${offset}: fetched ${classes.length} classes (total: ${allClasses.length})`);

      // If we got fewer than the limit, we've reached the end
      if (classes.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    log(`✅ Step 1 complete: Fetched ${allClasses.length} classes from API`);

    // Save classes to database using bulk insert
    log(`📋 Step 2: Saving ${allClasses.length} classes to database (NEX.classes)...`);
    
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      log(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Classes will be saved with school_id = NULL.`);
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
        log(`❌ Error preparing class ${classData.sourcedId}: ${error.message}`);
        skippedCount++;
      }
    }

    log(`   💾 Bulk inserting ${recordsToInsert.length} classes...`);
    const { inserted, error: bulkError } = await databaseService.bulkInsertClasses(recordsToInsert);

    if (bulkError) {
      log(`❌ Step 2 failed: ${bulkError}`);
      throw new Error(`Bulk insert failed: ${bulkError}`);
    }

    log(`✅ Step 2 complete: Saved ${inserted} classes to database`);
    if (skippedCount > 0) {
      log(`⚠️  Skipped ${skippedCount} classes due to errors`);
    }

    log(`✅ Classes sync complete`);
    return allClasses;
  } catch (error) {
    console.error('Failed to fetch classes:', error);
    throw error;
  }
}
