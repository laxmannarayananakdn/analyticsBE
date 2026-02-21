/**
 * School Methods
 * Handles fetching and saving school details from ManageBac API
 */

import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService } from '../DatabaseService.js';
import type { SchoolDetails } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';

export async function getSchoolDetails(
  this: BaseManageBacService,
  apiKey: string,
  baseUrl?: string
): Promise<SchoolDetails> {
  try {
    const response = await this.makeRequest<{ school?: SchoolDetails } & SchoolDetails>(
      MANAGEBAC_ENDPOINTS.SCHOOL, apiKey, {}, baseUrl);
    const schoolData = response.data.school ?? response.data;

    const schoolId = typeof schoolData.id === 'number' ? schoolData.id : parseInt(String(schoolData.id), 10);
    (this as any).currentSchoolId = schoolId || null;
    console.log('✅ School ID set:', (this as any).currentSchoolId);

    console.log('💾 Saving school details to database...');
    const schoolForDb = {
      id: schoolId,
      name: schoolData.name,
      subdomain: schoolData.subdomain || schoolData.name.toLowerCase().replace(/\s+/g, '-'),
      country: schoolData.country || 'Unknown',
      language: schoolData.language || 'en',
      session_in_may: schoolData.session_in_may || false,
      kbl_id: schoolData.kbl_id ?? undefined,
    };

    const { error } = await databaseService.upsertSchool(schoolForDb);
    if (error) {
      console.error('❌ Failed to save school to database:', error);
    } else {
      console.log('✅ School details saved to database');

      if (schoolData.enabled_programs && schoolData.enabled_programs.length > 0) {
        console.log('💾 Saving programs to database...');
        const programs = schoolData.enabled_programs.map((program: any) => ({
          name: program.name,
          code: program.code
        }));

        const { error: programsError } = await databaseService.upsertPrograms(programs, schoolId);
        if (programsError) {
          console.error('❌ Failed to save programs to database:', programsError);
        } else {
          console.log(`✅ Programs saved to database (${programs.length})`);
        }
      }
    }

    return schoolData;
  } catch (error) {
    console.error('Failed to fetch school details:', error);
    throw error;
  }
}
