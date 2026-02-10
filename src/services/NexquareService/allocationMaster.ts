/**
 * Allocation Master Methods
 * Handles fetching and saving allocation master data from Nexquare API
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare';
import type { NexquareConfig } from '../../middleware/configLoader';
import { databaseService } from '../DatabaseService';
import type { BaseNexquareService } from './BaseNexquareService';

/**
 * Get allocation master data and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export async function getAllocationMaster(
  this: BaseNexquareService,
  config: NexquareConfig,
  schoolId?: string
): Promise<any[]> {
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    console.log(`📋 Fetching allocation master for school ${targetSchoolId}...`);
    
    const allAllocations: any[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const endpoint = `${NEXQUARE_ENDPOINTS.ALLOCATION_MASTER}/${targetSchoolId}`;
      const queryParams = new URLSearchParams();
      queryParams.append('offset', offset.toString());
      queryParams.append('limit', limit.toString());

      const url = `${endpoint}?${queryParams.toString()}`;
      const response = await this.makeRequest<Record<string, unknown>>(url, config);

      // Handle different response structures
      const allocations = response.data || response.allocations || response || [];
      const allocationArray = Array.isArray(allocations) ? allocations : [];

      if (allocationArray.length === 0) {
        hasMore = false;
        break;
      }

      allAllocations.push(...allocationArray);
      console.log(`   Fetched ${allocationArray.length} allocation(s) (total: ${allAllocations.length})`);

      // If we got fewer than the limit, we've reached the end
      if (allocationArray.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Found ${allAllocations.length} total allocation master record(s)`);

    // Save to database
    console.log('💾 Saving allocation master to database...');
    let savedCount = 0;
    let errorCount = 0;
    
    // Get the school sourced_id from sourced_id
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Allocations will be saved with school_id = NULL.`);
    }

    for (const allocation of allAllocations) {
      try {
        const metadataJson = allocation.metadata ? JSON.stringify(allocation.metadata) : null;
        const dateLastModified = allocation.dateLastModified 
          ? new Date(allocation.dateLastModified) 
          : null;

        const { error } = await databaseService.upsertNexquareAllocationMaster({
          school_id: schoolSourcedId,
          sourced_id: allocation.sourcedId || allocation.sourced_id || null,
          allocation_type: allocation.allocationType || allocation.allocation_type || null,
          entity_type: allocation.entityType || allocation.entity_type || null,
          entity_sourced_id: allocation.entitySourcedId || allocation.entity_sourced_id || null,
          entity_name: allocation.entityName || allocation.entity_name || null,
          status: allocation.status || null,
          date_last_modified: dateLastModified,
          metadata: metadataJson,
        });

        if (error) {
          console.error(`❌ Failed to save allocation ${allocation.sourcedId || 'unknown'}:`, error);
          errorCount++;
        } else {
          savedCount++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing allocation:`, error.message);
        errorCount++;
      }
    }

    console.log(`✅ Saved ${savedCount} allocation master record(s) to database`);
    if (errorCount > 0) {
      console.warn(`⚠️  Failed to save ${errorCount} allocation master record(s)`);
    }

    return allAllocations;
  } catch (error) {
    console.error('Failed to fetch allocation master:', error);
    throw error;
  }
}
