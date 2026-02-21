/**
 * Teachers Methods
 * Handles fetching and saving teachers from ManageBac API
 */

import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService } from '../DatabaseService.js';
import type { Teacher } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';

export async function getTeachers(
  this: BaseManageBacService,
  apiKey: string,
  filters?: { department?: string; active_only?: boolean },
  baseUrl?: string,
  schoolId?: number,
  onLog?: (msg: string) => void
): Promise<Teacher[]> {
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  try {
    log(`📋 Step 1: Fetching teachers from ManageBac API...`);
    const allTeachers: any[] = [];
    let page = 1;
    let totalPages = 1;
    const perPage = 250;

    do {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('per_page', String(perPage));
      if (filters?.department) params.append('department', filters.department);
      if (filters?.active_only) params.append('active_only', 'true');

      const endpoint = `${MANAGEBAC_ENDPOINTS.TEACHERS}?${params.toString()}`;
      const rawResponse = await this.makeRequestRaw(endpoint, apiKey, {}, baseUrl);

      const raw = rawResponse.data ?? rawResponse;
      const teachers = Array.isArray(raw) ? raw : (raw?.teachers ?? []);
      allTeachers.push(...teachers);

      const meta = rawResponse.meta ?? raw?.meta;
      totalPages = meta?.total_pages ?? 1;
      if (teachers.length > 0) {
        log(`   📄 Teachers page ${page}/${totalPages} (${teachers.length} items)`);
      }
      page++;
    } while (page <= totalPages);

    log(`✅ Step 1 complete: Fetched ${allTeachers.length} teachers from API`);

    const effectiveSchoolId = schoolId ?? (this as any).currentSchoolId;
    if (effectiveSchoolId && allTeachers.length > 0) {
      log(`📋 Step 2: Saving ${allTeachers.length} teachers to database (MB.users + MB.teachers)...`);
      const { error } = await databaseService.upsertTeachers(allTeachers, effectiveSchoolId, (msg) => log(`   ${msg}`));
      if (error) {
        log(`❌ Failed to save teachers: ${error}`);
      } else {
        log(`✅ Step 2 complete: ${allTeachers.length} teachers saved to database`);
      }
    } else if (!effectiveSchoolId) {
      log(`⚠️ Skipping database save: No school ID configured`);
    }

    log(`✅ Teachers sync complete`);
    return allTeachers;
  } catch (error) {
    console.error('Failed to fetch teachers:', error);
    throw error;
  }
}
