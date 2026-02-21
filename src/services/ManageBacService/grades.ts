/**
 * Grades Methods
 * Handles fetching and saving grades/year levels from ManageBac API
 */

import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService, type Grade } from '../DatabaseService.js';
import type { BaseManageBacService } from './BaseManageBacService.js';

export async function getGrades(
  this: BaseManageBacService,
  apiKey: string,
  academicYearId?: string,
  baseUrl?: string
): Promise<any> {
  try {
    const endpoint = academicYearId
      ? `${MANAGEBAC_ENDPOINTS.GRADES}?academic_year_id=${academicYearId}`
      : MANAGEBAC_ENDPOINTS.GRADES;

    const response = await this.makeRequest<any>(endpoint, apiKey, {}, baseUrl);

    if ((this as any).currentSchoolId && response.data?.school?.programs) {
      console.log('💾 Saving grades to database...');

      const allGrades: Grade[] = [];

      for (const program of response.data.school.programs) {
        if (program.grades && Array.isArray(program.grades)) {
          for (const grade of program.grades) {
            const label = grade.label;
            allGrades.push({
              school_id: (this as any).currentSchoolId,
              program_code: program.code,
              name: grade.name,
              ...(label != null && label !== '' ? { label } : {}),
              code: grade.code,
              uid: grade.uid,
              grade_number: grade.grade_number
            });
          }
        }
      }

      if (allGrades.length > 0) {
        console.log(`📚 Processing ${allGrades.length} grades across ${response.data.school.programs.length} program(s)`);

        const { error } = await databaseService.upsertGrades(allGrades, (this as any).currentSchoolId);
        if (error) {
          console.error('❌ Failed to save grades to database:', error);
        } else {
          console.log(`✅ Saved ${allGrades.length} grades to database`);
        }
      } else {
        console.log('ℹ️ No grades found to save');
      }
    }

    return response.data;
  } catch (error) {
    console.error('Failed to fetch grades:', error);
    throw error;
  }
}
