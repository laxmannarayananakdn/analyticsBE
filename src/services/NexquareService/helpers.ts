/**
 * Helper Methods
 * Utility methods used by NexquareService methods
 */

import { executeQuery } from '../../config/database';
import type { BaseNexquareService } from './BaseNexquareService';

/**
 * Bulk fetch student IDs by sourced_id or identifier
 * Returns a map of student_sourced_id -> { id, sourced_id }
 * Can be added to a class that extends BaseNexquareService
 */
export async function bulkGetStudentIds(
  this: BaseNexquareService,
  studentIdentifiers: string[]
): Promise<Map<string, { id: number; sourced_id: string }>> {
  if (studentIdentifiers.length === 0) {
    return new Map();
  }

  try {
    // Build query with IN clause - SQL Server supports up to 2100 parameters
    // We'll batch this if needed, but typically we won't have that many unique students
    const uniqueIds = [...new Set(studentIdentifiers.filter(id => id))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    // Split into batches of 1000 to stay well under the limit
    const batchSize = 1000;
    const resultMap = new Map<string, { id: number; sourced_id: string }>();

    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize);
      const placeholders = batch.map((_, idx) => `@id${idx}`).join(',');
      const identifierPlaceholders = batch.map((_, idx) => `@identifier${idx}`).join(',');
      
      const query = `
        SELECT id, sourced_id, identifier 
        FROM NEX.students 
        WHERE sourced_id IN (${placeholders}) 
           OR identifier IN (${identifierPlaceholders});
      `;

      const params: Record<string, any> = {};
      batch.forEach((id, idx) => {
        params[`id${idx}`] = id;
        params[`identifier${idx}`] = id;
      });

      const result = await executeQuery<{ id: number; sourced_id: string; identifier: string | null }>(query, params);

      if (!result.error && result.data) {
        result.data.forEach(row => {
          // Map by sourced_id
          if (row.sourced_id) {
            resultMap.set(row.sourced_id, { id: row.id, sourced_id: row.sourced_id });
          }
          // Also map by identifier if different
          if (row.identifier && row.identifier !== row.sourced_id) {
            resultMap.set(row.identifier, { id: row.id, sourced_id: row.sourced_id });
          }
        });
      }
    }

    return resultMap;
  } catch (error: any) {
    console.error('Error bulk fetching student IDs:', error);
    return new Map();
  }
}

/**
 * Bulk fetch group IDs from database by sourced_id
 * Can be added to a class that extends BaseNexquareService
 */
export async function bulkGetGroupIds(
  this: BaseNexquareService,
  groupSourcedIds: string[]
): Promise<Map<string, { id: number; sourced_id: string }>> {
  if (groupSourcedIds.length === 0) {
    return new Map();
  }

  try {
    const uniqueIds = [...new Set(groupSourcedIds.filter(id => id))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    // Split into batches of 1000 to stay well under the limit
    const batchSize = 1000;
    const resultMap = new Map<string, { id: number; sourced_id: string }>();

    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize);
      const placeholders = batch.map((_, idx) => `@id${idx}`).join(',');
      
      const query = `
        SELECT id, sourced_id
        FROM NEX.groups 
        WHERE sourced_id IN (${placeholders});
      `;

      const params: Record<string, any> = {};
      batch.forEach((id, idx) => {
        params[`id${idx}`] = id;
      });

      const result = await executeQuery<{ id: number; sourced_id: string }>(query, params);

      if (!result.error && result.data) {
        result.data.forEach(row => {
          if (row.sourced_id) {
            resultMap.set(row.sourced_id, { id: row.id, sourced_id: row.sourced_id });
          }
        });
      }
    }

    return resultMap;
  } catch (error: any) {
    console.error('Error bulk fetching group IDs:', error);
    return new Map();
  }
}
