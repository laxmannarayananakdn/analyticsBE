/**
 * Schools Methods
 * Handles fetching and saving schools/entities from Nexquare API
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare';
import type { NexquareConfig } from '../../middleware/configLoader';
import type { NexquareSchool, SchoolsResponse } from '../../types/nexquare';
import { databaseService } from '../DatabaseService';
import type { BaseNexquareService } from './BaseNexquareService';

/**
 * Get schools/entities and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export async function getSchools(
  this: BaseNexquareService,
  config: NexquareConfig,
  filter?: string
): Promise<NexquareSchool[]> {
  try {
    console.log('📚 Fetching schools/entities from Nexquare...');
    
    const endpoint = NEXQUARE_ENDPOINTS.SCHOOLS;
    const queryParams = new URLSearchParams();
    queryParams.append('offset', '0');
    queryParams.append('limit', '100');
    if (filter) {
      queryParams.append('filter', filter);
    }

    const url = `${endpoint}?${queryParams.toString()}`;
    const response = await (this as any).makeRequest<SchoolsResponse>(url, config);

    if (!response.orgs || !Array.isArray(response.orgs)) {
      throw new Error('Invalid response format: missing orgs array');
    }

    const schools = response.orgs;
    console.log(`✅ Found ${schools.length} school(s)/entit(ies)`);

    // Save schools to database
    console.log('💾 Saving schools to database...');
    let savedCount = 0;
    let errorCount = 0;

    for (const school of schools) {
      try {
        const metadataJson = school.metadata ? JSON.stringify(school.metadata) : null;
        const dateLastModified = school.dateLastModified 
          ? new Date(school.dateLastModified) 
          : null;

        const { error } = await databaseService.upsertNexquareSchool({
          sourced_id: school.sourcedId,
          name: school.name,
          identifier: school.identifier || null,
          status: school.status,
          type: school.type,
          date_last_modified: dateLastModified,
          metadata: metadataJson,
        });

        if (error) {
          console.error(`❌ Failed to save school ${school.sourcedId}:`, error);
          errorCount++;
        } else {
          savedCount++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing school ${school.sourcedId}:`, error.message);
        errorCount++;
      }
    }

    console.log(`✅ Saved ${savedCount} school(s) to database`);
    if (errorCount > 0) {
      console.warn(`⚠️  Failed to save ${errorCount} school(s)`);
    }

    return schools;
  } catch (error) {
    console.error('Failed to fetch schools:', error);
    throw error;
  }
}

/**
 * Verify school access by checking if school_id exists
 * Can be added to a class that extends BaseNexquareService
 */
export async function verifySchoolAccess(
  this: BaseNexquareService,
  config: NexquareConfig,
  schoolId: string
): Promise<boolean> {
  try {
    if (!schoolId) {
      console.warn('⚠️  No school_id provided for verification');
      return false;
    }

    console.log(`🔍 Verifying access to school_id: ${schoolId}`);
    
    const schools = await (this as any).getSchools(config, `status='active'`);
    const schoolExists = schools.some((s: any) => s.sourcedId === schoolId);

    if (schoolExists) {
      (this as any).setCurrentSchoolId(schoolId);
      console.log(`✅ School access verified: ${schoolId}`);
      return true;
    } else {
      console.error(`❌ School ${schoolId} not found or not accessible`);
      return false;
    }
  } catch (error) {
    console.error('Failed to verify school access:', error);
    return false;
  }
}
