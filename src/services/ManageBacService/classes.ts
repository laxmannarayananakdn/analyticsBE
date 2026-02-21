/**
 * Classes Methods
 * Handles fetching classes from ManageBac API
 */

import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import type { Class } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';

export async function getClasses(
  this: BaseManageBacService,
  apiKey: string,
  baseUrl?: string
): Promise<Class[]> {
  try {
    const classes = await this.fetchAllPaginated<Class>(
      MANAGEBAC_ENDPOINTS.CLASSES,
      'classes',
      apiKey,
      baseUrl,
      {},
      'Classes'
    );

    if ((this as any).currentSchoolId && classes.length > 0) {
      console.log('💾 Saving classes to database...');
      console.log('⚠️ Classes database save not yet implemented');
    }

    return classes;
  } catch (error) {
    console.error('Failed to fetch classes:', error);
    return [];
  }
}

export async function getClassById(
  this: BaseManageBacService,
  apiKey: string,
  classId: number,
  baseUrl?: string
): Promise<Class | null> {
  try {
    const response = await this.makeRequest<any>(
      `${MANAGEBAC_ENDPOINTS.CLASSES}/${classId}`,
      apiKey,
      {},
      baseUrl
    );
    const classData = response.data?.class || response.data;

    if (!classData) return null;

    return classData;
  } catch (error: any) {
    console.error(`Failed to fetch class ${classId}:`, error.message);
    return null;
  }
}
