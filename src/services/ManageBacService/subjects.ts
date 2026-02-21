/**
 * Subjects Methods
 * Handles fetching and saving subjects from ManageBac API
 */

import { MANAGEBAC_ENDPOINTS } from '../../config/managebac.js';
import { databaseService, type SubjectGroupRecord, type SubjectRecord } from '../DatabaseService.js';
import type { Subject } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';

export async function getSubjects(
  this: BaseManageBacService,
  apiKey: string,
  baseUrl?: string
): Promise<Subject[]> {
  try {
    const response = await this.makeRequest<any>(MANAGEBAC_ENDPOINTS.SUBJECTS, apiKey, {}, baseUrl);
    const payload = response.data;

    let subjectsByProgram: Record<string, Subject[]> = {};

    if (Array.isArray(payload)) {
      subjectsByProgram = { general: payload as Subject[] };
    } else if (payload?.subjects && typeof payload.subjects === 'object') {
      subjectsByProgram = payload.subjects;
    } else if (payload && typeof payload === 'object') {
      subjectsByProgram = payload;
    }

    const flattenedSubjects: Subject[] = [];
    const subjectsForDb: SubjectRecord[] = [];
    const subjectGroupsMap = new Map<number, SubjectGroupRecord>();

    const programCount = Object.keys(subjectsByProgram).length;

    for (const [programKey, programSubjects] of Object.entries(subjectsByProgram)) {
      if (!Array.isArray(programSubjects)) continue;

      const normalizedProgramCode = programKey.toLowerCase();

      for (const subject of programSubjects) {
        const subjectId = typeof subject.id === 'string' ? parseInt(subject.id, 10) : subject.id;
        const groupId = typeof subject.group_id === 'string' ? parseInt(subject.group_id, 10) : subject.group_id;

        const normalizedSubject: Subject = {
          ...subject,
          id: subjectId,
          group_id: groupId || subject.group_id,
          program_code: normalizedProgramCode
        };

        flattenedSubjects.push(normalizedSubject);

        if (!(this as any).currentSchoolId) continue;

        if (groupId) {
          if (!subjectGroupsMap.has(groupId)) {
            subjectGroupsMap.set(groupId, {
              id: groupId,
              school_id: (this as any).currentSchoolId,
              program_code: normalizedProgramCode,
              name: subject.group || 'Unknown',
              max_phase: (subject as any).max_phase || null
            });
          }
        }

        subjectsForDb.push({
          id: subjectId,
          school_id: (this as any).currentSchoolId,
          subject_group_id: groupId || null,
          name: subject.name,
          custom: (subject as any).custom ?? false,
          sl: subject.sl ?? false,
          hl: subject.hl ?? false,
          self_taught: subject.self_taught ?? false,
          enabled: (subject as any).enabled ?? true
        });
      }
    }

    if ((this as any).currentSchoolId && subjectsForDb.length > 0) {
      console.log(`📚 Processing ${subjectsForDb.length} subjects across ${programCount} program(s)`);

      if (subjectGroupsMap.size > 0) {
        const { error: groupsError } = await databaseService.upsertSubjectGroups(
          Array.from(subjectGroupsMap.values()),
          (this as any).currentSchoolId
        );

        if (groupsError) {
          console.error('❌ Failed to save subject groups to database:', groupsError);
        } else {
          console.log(`✅ Saved ${subjectGroupsMap.size} subject groups to database`);
        }
      }

      const { error: subjectsError } = await databaseService.upsertSubjects(
        subjectsForDb,
        (this as any).currentSchoolId
      );
      if (subjectsError) {
        console.error('❌ Failed to save subjects to database:', subjectsError);
      } else {
        console.log(`✅ Saved ${subjectsForDb.length} subjects to database`);
      }
    } else if (!(this as any).currentSchoolId) {
      console.warn('⚠️ No school context available; skipping subject persistence.');
    } else {
      console.log('ℹ️ No subjects returned from API');
    }

    return flattenedSubjects;
  } catch (error) {
    console.error('Failed to fetch subjects:', error);
    throw error;
  }
}
