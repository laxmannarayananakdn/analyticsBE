/**
 * ManageBac API Service
 * Handles all interactions with ManageBac API and saves data to Azure SQL Database
 */

import { getManageBacHeaders, MANAGEBAC_ENDPOINTS, MANAGEBAC_CONFIG } from '../config/managebac.js';
import { retryOperation, validateApiResponse, handleApiError } from '../utils/apiUtils.js';
import { databaseService, SubjectGroupRecord, SubjectRecord, YearGroupRecord, TermGradeRubric, type AcademicYear as DBAcademicYear, type TermGrade as DBTermGrade } from './DatabaseService.js';
import { executeQuery } from '../config/database.js';
import type {
  SchoolDetails,
  AcademicYear,
  AcademicTerm,
  Grade,
  Subject,
  Teacher,
  Student,
  Class,
  YearGroup,
  Membership,
  TermGrade,
  TermGradeResponse,
  ApiResponse
} from '../types/managebac.js';

export class ManageBacService {
  private currentSchoolId: number | null = null;
  private studentsSyncedFromYearGroups = false;

  /**
   * Generic method for making HTTP requests to the ManageBac API
   */
  private async makeRequest<T>(
    endpoint: string,
    apiKey: string,
    options: RequestInit = {},
    baseUrl?: string
  ): Promise<ApiResponse<T>> {
    const result = await this.makeRequestRaw(endpoint, apiKey, options, baseUrl);
    return validateApiResponse<T>(result);
  }

  /**
   * Make request and return raw response (including meta for pagination)
   */
  private async makeRequestRaw(
    endpoint: string,
    apiKey: string,
    options: RequestInit = {},
    baseUrl?: string
  ): Promise<any> {
    const url = baseUrl
      ? this.buildManageBacUrl(endpoint, baseUrl)
      : this.buildManageBacUrl(endpoint, MANAGEBAC_CONFIG.DEFAULT_BASE_URL);
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
      ...getManageBacHeaders(apiKey, method),
      ...options.headers,
    };

    const requestOptions: RequestInit = {
      ...options,
      headers,
      method,
    };

    try {
      const response = await retryOperation(async () => {
        const res = await fetch(url, requestOptions);

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`HTTP ${res.status}: ${res.statusText}. Response: ${errorText.substring(0, 200)}`);
        }

        return await res.json();
      }, 3);

      return response;
    } catch (error) {
      console.error('💥 ManageBac API request failed:', error);
      throw handleApiError(error);
    }
  }

  /**
   * Fetch all pages for a paginated ManageBac list endpoint
   */
  private async fetchAllPaginated<T>(
    endpointBase: string,
    dataKey: string,
    apiKey: string,
    baseUrl: string | undefined,
    existingParams: Record<string, string> = {},
    logLabel: string = 'Items'
  ): Promise<T[]> {
    const allItems: T[] = [];
    let page = 1;
    let totalPages = 1;
    const perPage = 250;

    do {
      const params = new URLSearchParams({ ...existingParams, page: String(page), per_page: String(perPage) });
      const endpoint = `${endpointBase}?${params.toString()}`;
      const rawResponse = await this.makeRequestRaw(endpoint, apiKey, {}, baseUrl);

      const raw = rawResponse.data ?? rawResponse;
      const items = (Array.isArray(raw) ? raw : (raw?.[dataKey] ?? [])) as T[];
      allItems.push(...items);

      const meta = rawResponse.meta ?? raw?.meta;
      totalPages = meta?.total_pages ?? 1;
      if (items.length > 0) {
        console.log(`   📄 ${logLabel} page ${page}/${totalPages} (${items.length} items)`);
      }
      page++;
    } while (page <= totalPages);

    return allItems;
  }

  /**
   * Build ManageBac URL with custom base URL
   */
  private buildManageBacUrl(endpoint: string, baseUrl: string): string {
    // Remove trailing slash if present
    let cleanBaseUrl = baseUrl.replace(/\/$/, '');
    
    // If user provided a school subdomain (e.g., school.managebac.com), use api.managebac.com instead
    if (cleanBaseUrl.includes('.managebac.com') && !cleanBaseUrl.includes('api.managebac.com')) {
      console.log(`   ⚠️  Detected school subdomain, converting to api.managebac.com`);
      cleanBaseUrl = 'https://api.managebac.com';
    }
    
    // Ensure base URL has https://
    if (!cleanBaseUrl.startsWith('http://') && !cleanBaseUrl.startsWith('https://')) {
      cleanBaseUrl = `https://${cleanBaseUrl}`;
    }
    
    // Add /v2 if not already present
    if (!cleanBaseUrl.includes('/v2')) {
      cleanBaseUrl = `${cleanBaseUrl}/v2`;
    }
    
    // Ensure endpoint starts with /
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    const finalUrl = `${cleanBaseUrl}${cleanEndpoint}`;
    console.log(`   🔗 Built URL: ${finalUrl}`);
    return finalUrl;
  }

  /**
   * Authenticate with the ManageBac API
   */
  async authenticate(apiKey: string, baseUrl?: string): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      console.log('🔐 Authenticating with ManageBac API...');
      if (baseUrl) {
        console.log(`   Using base URL: ${baseUrl}`);
      }
      console.log(`   API Key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING'}`);
      
      const testResponse = await this.makeRequest<any>(MANAGEBAC_ENDPOINTS.SCHOOL, apiKey, {}, baseUrl);
      console.log('✅ Authentication successful');
      return { success: true };
    } catch (error: any) {
      console.error('❌ Authentication failed:', error);
      const errorMessage = error?.message || 'Unknown error';
      const errorDetails: {
        message: string;
        baseUrl: string;
        endpoint: string;
        hasApiKey: boolean;
        httpError?: string;
      } = {
        message: errorMessage,
        baseUrl: baseUrl || MANAGEBAC_CONFIG.DEFAULT_BASE_URL,
        endpoint: MANAGEBAC_ENDPOINTS.SCHOOL,
        hasApiKey: !!apiKey
      };
      
      // Try to extract more details from the error
      if (errorMessage.includes('HTTP')) {
        errorDetails.httpError = errorMessage;
      }
      
      return { 
        success: false, 
        error: errorMessage,
        details: errorDetails
      };
    }
  }

  /**
   * Get school details and save to database
   */
  async getSchoolDetails(apiKey: string, baseUrl?: string): Promise<SchoolDetails> {
    try {
      const response = await this.makeRequest<{ school?: SchoolDetails } & SchoolDetails>(MANAGEBAC_ENDPOINTS.SCHOOL, apiKey, {}, baseUrl);
      const schoolData = response.data.school ?? response.data;
      
      const schoolId = typeof schoolData.id === 'number' ? schoolData.id : parseInt(String(schoolData.id), 10);
      this.currentSchoolId = schoolId || null;
      console.log('✅ School ID set:', this.currentSchoolId);
      
      // Save to database
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
        
        // Save programs if they exist
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

  /**
   * Get all academic years for the school
   */
  async getAcademicYears(apiKey: string, programCode?: string, baseUrl?: string): Promise<any> {
    try {
      const response = await this.makeRequest<any>(MANAGEBAC_ENDPOINTS.ACADEMIC_YEARS, apiKey, {}, baseUrl);
      
      if (this.currentSchoolId && response.data?.academic_years) {
        console.log('💾 Saving academic years to database...');

        const academicData = response.data.academic_years;
        let programsToProcess: Record<string, any> = academicData;

        if (programCode) {
          const resolvedKey = this.resolveProgramKey(programCode, academicData);
          if (resolvedKey && academicData[resolvedKey]) {
            programsToProcess = { [resolvedKey]: academicData[resolvedKey] };
          } else {
            console.warn(`⚠️ Program "${programCode}" not found in academic years response. Processing all programs.`);
          }
        }

        for (const [programKey, programInfo] of Object.entries(programsToProcess)) {
          if (!programInfo) {
            console.warn(`⚠️ No academic year data found for program: ${programKey}`);
            continue;
          }

          const rawYears: AcademicYear[] = programInfo.academic_years || [];
          if (!rawYears.length) {
            console.log(`ℹ️ No academic years to save for program: ${programKey}`);
            continue;
          }

          console.log(`📚 Processing ${rawYears.length} academic years for program: ${programKey}`);

          const normalizedYears: DBAcademicYear[] = [];
          const schoolId = this.currentSchoolId!;

          const termMap = new Map<number, any[]>();

          for (const rawYear of rawYears) {
            const yearId = typeof rawYear.id === 'string' ? parseInt(rawYear.id, 10) : rawYear.id;
            const { startsOn, endsOn } = this.getAcademicYearDates(rawYear);

            normalizedYears.push({
              id: yearId,
              school_id: schoolId,
              program_code: programKey,
              name: rawYear.name,
              starts_on: new Date(startsOn),
              ends_on: new Date(endsOn)
            });

            if (rawYear.academic_terms && rawYear.academic_terms.length > 0) {
              const normalizedTerms = rawYear.academic_terms.map(term => {
                const termId = typeof term.id === 'string' ? parseInt(term.id, 10) : term.id;
                const { startsOn: termStart, endsOn: termEnd } = this.getAcademicTermDates(term, startsOn, endsOn);
                return {
                  id: termId,
                  academic_year_id: yearId,
                  name: term.name,
                  starts_on: termStart,
                  ends_on: termEnd,
                  locked: (term as any).locked ?? false,
                  exam_grade: term.exam_grade || false
                };
              });

              termMap.set(yearId, normalizedTerms);
            }
          }

          const { error: yearsError } = await databaseService.upsertAcademicYears(
            normalizedYears,
            schoolId,
            programKey
          );

          if (yearsError) {
            console.error(`❌ Failed to save academic years for program ${programKey}:`, yearsError);
          } else {
            console.log(`✅ Saved ${normalizedYears.length} academic years for program ${programKey}`);

            for (const year of normalizedYears) {
              const terms = termMap.get(year.id);
              if (terms && terms.length > 0) {
                const { error: termsError } = await databaseService.upsertAcademicTerms(terms, year.id);
                if (termsError) {
                  console.error(`❌ Failed to save terms for academic year ${year.id}:`, termsError);
                } else {
                  console.log(`✅ Saved ${terms.length} terms for academic year ${year.id}`);
                }
              }
            }
          }
        }
      }
      
      return response.data;
    } catch (error) {
      console.error('Failed to fetch academic years:', error);
      throw error;
    }
  }

  /**
   * Get all grades/year levels
   */
  async getGrades(apiKey: string, academicYearId?: string, baseUrl?: string): Promise<any> {
    try {
      const endpoint = academicYearId 
        ? `${MANAGEBAC_ENDPOINTS.GRADES}?academic_year_id=${academicYearId}`
        : MANAGEBAC_ENDPOINTS.GRADES;
      
      const response = await this.makeRequest<any>(endpoint, apiKey, {}, baseUrl);
      
      // Save to database if available
      if (this.currentSchoolId && response.data?.school?.programs) {
        console.log('💾 Saving grades to database...');
        
        const allGrades: Array<{
          school_id: number;
          program_code: string;
          name: string;
          label?: string;
          code: string;
          uid: number;
          grade_number: number;
        }> = [];

        // Process all programs and their grades
        for (const program of response.data.school.programs) {
          if (program.grades && Array.isArray(program.grades)) {
            for (const grade of program.grades) {
              allGrades.push({
                school_id: this.currentSchoolId,
                program_code: program.code,
                name: grade.name,
                label: grade.label || null,
                code: grade.code,
                uid: grade.uid,
                grade_number: grade.grade_number
              });
            }
          }
        }

        if (allGrades.length > 0) {
          console.log(`📚 Processing ${allGrades.length} grades across ${response.data.school.programs.length} program(s)`);
          
          const { error } = await databaseService.upsertGrades(allGrades, this.currentSchoolId);
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

  /**
   * Get all subjects
   */
  async getSubjects(apiKey: string, baseUrl?: string): Promise<Subject[]> {
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
        if (!Array.isArray(programSubjects)) {
          continue;
        }

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

          if (!this.currentSchoolId) {
            continue;
          }

          if (groupId) {
            if (!subjectGroupsMap.has(groupId)) {
              subjectGroupsMap.set(groupId, {
                id: groupId,
                school_id: this.currentSchoolId,
                program_code: normalizedProgramCode,
                name: subject.group || 'Unknown',
                max_phase: (subject as any).max_phase || null
              });
            }
          }

          subjectsForDb.push({
            id: subjectId,
            school_id: this.currentSchoolId,
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

      if (this.currentSchoolId && subjectsForDb.length > 0) {
        console.log(`📚 Processing ${subjectsForDb.length} subjects across ${programCount} program(s)`);

        if (subjectGroupsMap.size > 0) {
          const { error: groupsError } = await databaseService.upsertSubjectGroups(
            Array.from(subjectGroupsMap.values()),
            this.currentSchoolId
          );

          if (groupsError) {
            console.error('❌ Failed to save subject groups to database:', groupsError);
          } else {
            console.log(`✅ Saved ${subjectGroupsMap.size} subject groups to database`);
          }
        }

        const { error: subjectsError } = await databaseService.upsertSubjects(subjectsForDb, this.currentSchoolId);
        if (subjectsError) {
          console.error('❌ Failed to save subjects to database:', subjectsError);
        } else {
          console.log(`✅ Saved ${subjectsForDb.length} subjects to database`);
        }
      } else if (!this.currentSchoolId) {
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

  /**
   * Get all teachers (with pagination to fetch all pages)
   * onLog: optional callback to stream progress to frontend (e.g. SSE)
   */
  async getTeachers(
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

      const effectiveSchoolId = schoolId ?? this.currentSchoolId;
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

  /**
   * Get all students in the school (with pagination to fetch all pages)
   * onLog: optional callback to stream progress to frontend (e.g. SSE)
   */
  async getStudents(
    apiKey: string,
    filters?: { grade_id?: string; active_only?: boolean; academic_year_id?: string },
    baseUrl?: string,
    schoolId?: number,
    onLog?: (msg: string) => void
  ): Promise<Student[]> {
    const log = (msg: string) => {
      console.log(msg);
      onLog?.(msg);
    };
    try {
      log(`📋 Step 1: Fetching students from ManageBac API...`);
      const allStudents: any[] = [];
      let page = 1;
      let totalPages = 1;
      const perPage = 250;

      do {
        const params = new URLSearchParams();
        params.append('page', String(page));
        params.append('per_page', String(perPage));
        if (filters?.grade_id) params.append('grade_id', filters.grade_id);
        if (filters?.academic_year_id) params.append('academic_year_id', filters.academic_year_id);
        if (filters?.active_only) params.append('active_only', 'true');

        const endpoint = `${MANAGEBAC_ENDPOINTS.STUDENTS}?${params.toString()}`;
        const rawResponse = await this.makeRequestRaw(endpoint, apiKey, {}, baseUrl);

        const raw = rawResponse.data ?? rawResponse;
        const students = Array.isArray(raw) ? raw : (raw?.students ?? []);
        allStudents.push(...students);

        const meta = rawResponse.meta ?? raw?.meta;
        totalPages = meta?.total_pages ?? 1;
        if (students.length > 0) {
          log(`   📄 Students page ${page}/${totalPages} (${students.length} items)`);
        }
        page++;
      } while (page <= totalPages);

      log(`✅ Step 1 complete: Fetched ${allStudents.length} students from API`);

      // Paginated list may return minimal records; fetch full details if key fields are missing
      const sample = allStudents.slice(0, 3);
      const needsEnrichment = sample.some(
        (s: any) =>
          !(s.year_group_id ?? s.yearGroupId) &&
          !(s.class_grade ?? s.classGrade) &&
          !(s.program ?? s.program)
      );
      if (needsEnrichment && allStudents.length > 0) {
        log(`📋 Step 2: Enriching student records (list returned minimal data; fetching full details for ${allStudents.length} students)...`);
        const CONCURRENCY = 20;
        const enriched: any[] = [];
        for (let i = 0; i < allStudents.length; i += CONCURRENCY) {
          const chunk = allStudents.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            chunk.map(async (s: any) => {
              try {
                const res = await this.makeRequest<any>(`/students/${s.id}`, apiKey, {}, baseUrl);
                const full = res.data?.student ?? res.data ?? s;
                return full;
              } catch {
                return s;
              }
            })
          );
          enriched.push(...results);
          const done = Math.min(i + CONCURRENCY, allStudents.length);
          if (done % 100 === 0 || done === allStudents.length) {
            log(`   📥 Enriched ${done}/${allStudents.length} students`);
          }
        }
        allStudents.length = 0;
        allStudents.push(...enriched);
        log(`✅ Step 2 complete: Enriched ${enriched.length} students`);
      }

      const effectiveSchoolId = schoolId ?? this.currentSchoolId;
      const saveStepNum = needsEnrichment ? 3 : 2;
      if (effectiveSchoolId && allStudents.length > 0) {
        log(`📋 Step ${saveStepNum}: Saving ${allStudents.length} students to database (MB.students)...`);
        const studentsForDb = allStudents.map((s: any) => this.mapManageBacStudentToDb(s));
        const { error } = await databaseService.bulkUpsertManageBacStudents(studentsForDb, (cur, tot, batchNum, totalBatches) => {
          log(`   📊 Batch ${batchNum}/${totalBatches}: ${cur}/${tot} students (${Math.round((cur / tot) * 100)}%)`);
        });
        if (error) {
          log(`❌ Step ${saveStepNum} failed: ${error}`);
        } else {
          log(`✅ Step ${saveStepNum} complete: ${allStudents.length} students saved to database`);
        }

        if (!this.studentsSyncedFromYearGroups) {
          log(`📋 Syncing year group - student relationships...`);
          await this.syncStudentsByGradesAndYearGroups(apiKey);
        }
      } else if (!effectiveSchoolId) {
        log(`⚠️ Skipping database save: No school ID configured`);
      }

      log(`✅ Students sync complete`);
      return allStudents;
    } catch (error) {
      console.error('Failed to fetch students:', error);
      throw error;
    }
  }

  /**
   * Map ManageBac student API response to DB format
   * Supports both snake_case and camelCase (API may vary by version)
   */
  private mapManageBacStudentToDb(s: any): any {
    const id = typeof s.id === 'string' ? parseInt(s.id, 10) : s.id;
    const pick = (snake: string, camel: string) => s[snake] ?? s[camel] ?? null;
    const pickNum = (snake: string, camel: string) => {
      const v = s[snake] ?? s[camel];
      return v !== undefined && v !== null ? (typeof v === 'number' ? v : parseInt(String(v), 10)) : null;
    };
    const nationalitiesRaw = pick('nationalities', 'nationalities');
    const languagesRaw = pick('languages', 'languages');
    const parentIdsRaw = pick('parent_ids', 'parentIds');
    const additionalHomeroomRaw = pick('additional_homeroom_advisor_ids', 'additionalHomeroomAdvisorIds');

    return {
      id,
      grade_id: pickNum('grade_id', 'gradeId'),
      year_group_id: pickNum('year_group_id', 'yearGroupId'),
      uniq_student_id: pick('uniq_student_id', 'uniqStudentId') || pick('student_id', 'studentId') || pick('identifier', 'identifier'),
      first_name: (pick('first_name', 'firstName') ?? '') as string,
      last_name: (pick('last_name', 'lastName') ?? '') as string,
      email: (pick('email', 'email') || `mb-student-${id}@placeholder.local`) as string,
      gender: pick('gender', 'gender'),
      birthday: pick('birthday', 'birthday'),
      archived: s.archived ?? false,
      program: pick('program', 'program'),
      program_code: pick('program_code', 'programCode'),
      class_grade: pick('class_grade', 'classGrade'),
      class_grade_number: pickNum('class_grade_number', 'classGradeNumber'),
      graduating_year: pickNum('graduating_year', 'graduatingYear'),
      nationalities: Array.isArray(nationalitiesRaw) ? JSON.stringify(nationalitiesRaw) : (typeof nationalitiesRaw === 'string' ? nationalitiesRaw : '[]'),
      languages: Array.isArray(languagesRaw) ? JSON.stringify(languagesRaw) : (typeof languagesRaw === 'string' ? languagesRaw : '[]'),
      timezone: pick('timezone', 'timezone'),
      ui_language: pick('ui_language', 'uiLanguage'),
      student_id: pick('student_id', 'studentId') || pick('identifier', 'identifier'),
      identifier: pick('identifier', 'identifier'),
      oa_id: pick('oa_id', 'oaId'),
      withdrawn_on: pick('withdrawn_on', 'withdrawnOn'),
      photo_url: pick('photo_url', 'photoUrl'),
      homeroom_advisor_id: pickNum('homeroom_advisor_id', 'homeroomAdvisorId'),
      attendance_start_date: pick('attendance_start_date', 'attendanceStartDate'),
      parent_ids: Array.isArray(parentIdsRaw) ? JSON.stringify(parentIdsRaw) : (typeof parentIdsRaw === 'string' ? parentIdsRaw : '[]'),
      additional_homeroom_advisor_ids: Array.isArray(additionalHomeroomRaw)
        ? JSON.stringify(additionalHomeroomRaw)
        : (typeof additionalHomeroomRaw === 'string' ? additionalHomeroomRaw : '[]')
    };
  }

  /**
   * Get all classes in the school (with pagination)
   */
  async getClasses(apiKey: string, baseUrl?: string): Promise<Class[]> {
    try {
      const classes = await this.fetchAllPaginated<Class>(
        MANAGEBAC_ENDPOINTS.CLASSES,
        'classes',
        apiKey,
        baseUrl,
        {},
        'Classes'
      );

      // Save to database if available
      if (this.currentSchoolId && classes.length > 0) {
        console.log('💾 Saving classes to database...');
        // Note: We'll need to add upsertClasses to DatabaseService
        console.log('⚠️ Classes database save not yet implemented');
      }

      return classes;
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      return [];
    }
  }

  /**
   * Get a single class by ID
   */
  async getClassById(apiKey: string, classId: number): Promise<Class | null> {
    try {
      const response = await this.makeRequest<any>(`${MANAGEBAC_ENDPOINTS.CLASSES}/${classId}`, apiKey);
      const classData = response.data?.class || response.data;
      
      if (!classData) {
        return null;
      }

      return classData;
    } catch (error: any) {
      console.error(`Failed to fetch class ${classId}:`, error.message);
      return null;
    }
  }

  /**
   * Get all year groups in the school
   */
  async getYearGroups(apiKey: string, baseUrl?: string): Promise<YearGroup[]> {
    try {
      // Ensure school ID is set by fetching school details if needed
      if (!this.currentSchoolId) {
        console.log('⚠️ School ID not set, fetching school details first...');
        try {
          await this.getSchoolDetails(apiKey, baseUrl);
        } catch (schoolError) {
          console.warn('⚠️ Failed to fetch school details, will try to get school ID from database:', schoolError);
        }
      }

      const yearGroupsRaw = await this.fetchAllPaginated<YearGroup>(
        MANAGEBAC_ENDPOINTS.YEAR_GROUPS,
        'year_groups',
        apiKey,
        baseUrl,
        {},
        'Year groups'
      );

      const normalizedYearGroups: YearGroup[] = yearGroupsRaw.map((yearGroup) => ({
        ...yearGroup,
        id: typeof yearGroup.id === 'string' ? parseInt(yearGroup.id, 10) : yearGroup.id,
        grade_number: typeof yearGroup.grade_number === 'string'
          ? parseInt(yearGroup.grade_number, 10)
          : yearGroup.grade_number
      }));

      if (this.currentSchoolId && normalizedYearGroups.length > 0) {
        console.log(`💾 Saving ${normalizedYearGroups.length} year groups to database...`);

        const yearGroupsForDb: YearGroupRecord[] = normalizedYearGroups.map((group) => ({
          id: group.id,
          school_id: this.currentSchoolId as number,
          name: group.name,
          short_name: group.short_name || null,
          program: group.program || 'Unknown',
          grade: group.grade || 'Unknown',
          grade_number: group.grade_number || 0
        }));

        const { error } = await databaseService.upsertYearGroups(yearGroupsForDb, this.currentSchoolId);

        if (error) {
          console.error('❌ Failed to save year groups to database:', error);
        } else {
          console.log('✅ Year groups saved to database');
        }
      } else if (!this.currentSchoolId) {
        console.warn('⚠️ No school context available; skipping year groups persistence.');
      } else {
        console.log('ℹ️ No year groups returned from API');
      }

      return normalizedYearGroups;
    } catch (error) {
      console.error('Failed to fetch year groups:', error);
      throw error;
    }
  }

  /**
   * Get students in a specific year group (with pagination)
   */
  async getYearGroupStudents(apiKey: string, yearGroupId: string, academicYearId?: string, termId?: string, baseUrl?: string): Promise<any> {
    try {
      const endpointBase = `/year-groups/${yearGroupId}/students`;
      const existingParams: Record<string, string> = {};
      if (academicYearId) existingParams.academic_year_id = academicYearId;
      if (termId) existingParams.term_id = termId;

      const students = await this.fetchAllPaginated<any>(
        endpointBase,
        'students',
        apiKey,
        baseUrl,
        existingParams,
        'Year group students'
      );

      const responseData = { students };

      // Save to database if available
      if (this.currentSchoolId && students.length > 0) {
        console.log('💾 Processing year group students for database...');
        
        if (students.length > 0) {
          // Fetch individual student details
          const studentIds = students.map((student: any) => student.id);
          const studentDetails: any[] = [];
          
          for (const studentId of studentIds) {
            try {
              const studentResponse = await this.makeRequest<any>(`/students/${studentId}`, apiKey, {}, baseUrl);
              if (studentResponse.data && studentResponse.data.student) {
                studentDetails.push(studentResponse.data.student);
              } else if (studentResponse.data) {
                studentDetails.push(studentResponse.data);
              }
            } catch (studentError) {
              console.warn(`⚠️ Failed to fetch student ${studentId}:`, studentError);
            }
          }
          
          // Save students to database
          if (studentDetails.length > 0) {
            const studentsForDb = studentDetails.map((student: any) => ({
              id: parseInt(student.id),
              first_name: student.first_name,
              last_name: student.last_name,
              email: student.email,
              student_id: student.student_id,
              archived: !student.is_active,
            }));
            
            const { error } = await databaseService.upsertStudents(studentsForDb);
            if (error) {
              console.error('❌ Failed to save students to database:', error);
            } else {
              console.log('✅ Students saved to database');
              
              // Save year group - student relationships
              const yearGroupIdNum = parseInt(yearGroupId);
              if (!isNaN(yearGroupIdNum)) {
                console.log(`💾 Saving year group-student relationships for year group ${yearGroupIdNum}...`);
                let relationshipCount = 0;
                let relationshipErrors = 0;
                
                for (const student of studentDetails) {
                  const studentIdNum = parseInt(student.id);
                  if (!isNaN(studentIdNum)) {
                    const { error: relError } = await databaseService.upsertYearGroupStudent(
                      yearGroupIdNum,
                      studentIdNum
                    );
                    
                    if (relError) {
                      console.warn(`⚠️ Failed to save relationship for student ${studentIdNum}:`, relError);
                      relationshipErrors++;
                    } else {
                      relationshipCount++;
                    }
                  }
                }
                
                if (relationshipCount > 0) {
                  console.log(`✅ Saved ${relationshipCount} year group-student relationship(s)`);
                }
        if (relationshipErrors > 0) {
          console.warn(`⚠️ Failed to save ${relationshipErrors} relationship(s)`);
        }
              }
            }
          }
        }
      }

      return responseData;
    } catch (error) {
      console.error('Failed to fetch year group students:', error);
      throw error;
    }
  }

  /**
   * Get students for all year groups in the school
   */
  async getAllYearGroupStudents(apiKey: string, academicYearId?: string, termId?: string, baseUrl?: string): Promise<any> {
    try {
      // Ensure school ID is set
      if (!this.currentSchoolId) {
        console.log('⚠️ School ID not set, fetching school details first...');
        await this.getSchoolDetails(apiKey, baseUrl);
      }

      if (!this.currentSchoolId) {
        throw new Error('School ID is required to fetch year group students');
      }

      // Get all year groups from database
      const yearGroups = await databaseService.getYearGroupsForSchool(this.currentSchoolId);
      
      if (yearGroups.length === 0) {
        console.log('⚠️ No year groups found in database. Fetching year groups first...');
        await this.getYearGroups(apiKey, baseUrl);
        const updatedYearGroups = await databaseService.getYearGroupsForSchool(this.currentSchoolId);
        if (updatedYearGroups.length === 0) {
          return {
            success: true,
            message: 'No year groups found for this school',
            total_students: 0,
            year_groups_processed: 0,
            results: []
          };
        }
        yearGroups.push(...updatedYearGroups);
      }

      console.log(`📚 Fetching students for ${yearGroups.length} year group(s)...`);
      
      const allResults: any[] = [];
      let totalStudents = 0;
      let successCount = 0;
      let errorCount = 0;

      for (const yearGroup of yearGroups) {
        try {
          console.log(`   Processing year group: ${yearGroup.name} (ID: ${yearGroup.id})...`);
          const result = await this.getYearGroupStudents(
            apiKey,
            yearGroup.id.toString(),
            academicYearId,
            termId,
            baseUrl
          );
          
          const studentCount = result?.students?.length || 0;
          totalStudents += studentCount;
          successCount++;
          
          allResults.push({
            year_group_id: yearGroup.id,
            year_group_name: yearGroup.name,
            student_count: studentCount,
            students: result?.students || []
          });
          
          console.log(`   ✅ Fetched ${studentCount} student(s) for ${yearGroup.name} and saved relationships`);
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
          errorCount++;
          console.error(`   ❌ Failed to fetch students for year group ${yearGroup.name} (ID: ${yearGroup.id}):`, error.message);
          allResults.push({
            year_group_id: yearGroup.id,
            year_group_name: yearGroup.name,
            error: error.message,
            student_count: 0
          });
        }
      }

      console.log(`✅ Completed fetching students for all year groups. Total: ${totalStudents} students across ${successCount} year group(s)`);
      if (errorCount > 0) {
        console.warn(`⚠️ Failed to fetch students for ${errorCount} year group(s)`);
      }

      return {
        success: true,
        message: `Fetched students for ${successCount} year group(s)`,
        total_students: totalStudents,
        year_groups_processed: successCount,
        year_groups_failed: errorCount,
        results: allResults
      };
    } catch (error) {
      console.error('Failed to fetch all year group students:', error);
      throw error;
    }
  }

  /**
   * Get all memberships
   * If gradeNumber is provided, filters by students in year groups with that grade_number
   */
  async getMemberships(apiKey: string, userIds: number[], academicYearId?: string, termId?: string, baseUrl?: string, gradeNumber?: number): Promise<any> {
    try {
      // Ensure school ID is set
      if (!this.currentSchoolId) {
        console.log('⚠️ School ID not set, fetching school details first...');
        await this.getSchoolDetails(apiKey, baseUrl);
      }

      // If gradeNumber is specified, get student IDs from year groups with that grade_number
      let filteredUserIds = userIds;
      if (gradeNumber !== undefined && this.currentSchoolId) {
        console.log(`🔍 Filtering memberships by grade_number = ${gradeNumber}...`);
        
        // Get year groups with the specified grade_number
        const yearGroupsQuery = `
          SELECT id FROM MB.year_groups
          WHERE school_id = @school_id AND grade_number = @grade_number
        `;
        const yearGroupsResult = await executeQuery<{ id: number }>(yearGroupsQuery, {
          school_id: this.currentSchoolId,
          grade_number: gradeNumber
        });

        if (yearGroupsResult.error || !yearGroupsResult.data || yearGroupsResult.data.length === 0) {
          console.warn(`⚠️ No year groups found with grade_number = ${gradeNumber}`);
          return {
            success: true,
            message: `No year groups found with grade_number = ${gradeNumber}`,
            memberships: [],
            count: 0
          };
        }

        const yearGroupIds = yearGroupsResult.data.map(yg => yg.id);
        console.log(`   Found ${yearGroupIds.length} year group(s) with grade_number = ${gradeNumber}`);

        // Get student IDs from those year groups
        // Build query with IN clause (safe since IDs come from database)
        const yearGroupIdsStr = yearGroupIds.join(',');
        const studentsQuery = `
          SELECT DISTINCT student_id
          FROM MB.year_group_students
          WHERE year_group_id IN (${yearGroupIdsStr})
        `;
        
        const studentsResult = await executeQuery<{ student_id: number }>(studentsQuery, {});

        if (studentsResult.error || !studentsResult.data) {
          console.warn(`⚠️ Failed to get students for year groups with grade_number = ${gradeNumber}`);
          return {
            success: true,
            message: `Failed to get students for grade_number = ${gradeNumber}`,
            memberships: [],
            count: 0
          };
        }

        filteredUserIds = studentsResult.data.map(s => s.student_id);
        console.log(`   Found ${filteredUserIds.length} student(s) in year groups with grade_number = ${gradeNumber}`);
      }

      const existingParams: Record<string, string> = { classes: 'active' };
      if (filteredUserIds && filteredUserIds.length > 0) {
        existingParams.user_ids = filteredUserIds.join(',');
      }
      if (academicYearId) existingParams.academic_year_id = academicYearId;
      if (termId) existingParams.term_id = termId;

      const memberships = await this.fetchAllPaginated<any>(
        MANAGEBAC_ENDPOINTS.MEMBERSHIPS,
        'memberships',
        apiKey,
        baseUrl,
        existingParams,
        'Memberships'
      );

      return { memberships, count: memberships.length };
    } catch (error) {
      console.error('Failed to fetch memberships:', error);
      throw error;
    }
  }

  /**
   * Get term grades for a class and term
   */
  async getTermGrades(apiKey: string, classId: number, termId: number, baseUrl?: string): Promise<TermGradeResponse> {
    try {
      // Use custom base URL if provided, otherwise use default
      const endpoint = MANAGEBAC_ENDPOINTS.TERM_GRADES
        .replace(':class_id', classId.toString())
        .replace(':term_id', termId.toString());
      const url = baseUrl 
        ? this.buildManageBacUrl(endpoint, baseUrl)
        : this.buildManageBacUrl(endpoint, MANAGEBAC_CONFIG.DEFAULT_BASE_URL);
      const headers = getManageBacHeaders(apiKey);
      
      const response = await retryOperation(async () => {
        const res = await fetch(url, { headers });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        return await res.json() as unknown;
      }, 3);
      
      // Debug: Log raw response structure
      const responseObj = response as Record<string, unknown>;
      console.log('🔍 Raw API response keys:', Object.keys(responseObj));
      console.log('🔍 Raw response has students?', !!responseObj.students);
      console.log('🔍 Raw response has data?', !!responseObj.data);
      
      const validated = validateApiResponse<TermGradeResponse>(response);
      
      // Debug: Log validated response structure
      const validatedData = validated.data as unknown as Record<string, unknown>;
      console.log('🔍 Validated response structure:');
      console.log('  - validated.data type:', typeof validated.data);
      console.log('  - validated.data keys:', validated.data ? Object.keys(validatedData) : 'null');
      console.log('  - Has students?', !!validatedData?.students);
      
      // Handle both response structures: { students: [...] } or { data: { students: [...] } }
      const studentsData = validatedData?.students ?? responseObj?.students ?? [];
      const studentsArray = Array.isArray(studentsData) ? studentsData : [];
      
      if (studentsArray.length > 0) {
        const firstStudent = studentsArray[0] as Record<string, unknown>;
        const termGrade = firstStudent?.term_grade as Record<string, unknown> | undefined;
        console.log('  - First student ID:', firstStudent?.id);
        console.log('  - First student has term_grade?', !!termGrade);
        console.log('  - First student has rubrics?', !!(termGrade?.rubrics as unknown[] | undefined)?.length);
        const rubrics = termGrade?.rubrics as unknown[] | undefined;
        console.log('  - Rubrics count:', rubrics?.length || 0);
        if (rubrics && rubrics.length > 0) {
          console.log('  - Sample rubric:', JSON.stringify(rubrics[0], null, 2));
        }
      }
      
      // Convert and save term grades to database
      // Use studentsArray which handles both response structures
      if (studentsArray.length > 0) {
        const termGrades: DBTermGrade[] = studentsArray.map((student: unknown) => {
          const s = student as Record<string, unknown>;
          const tg = s?.term_grade as Record<string, unknown> | undefined;
          const avg = tg?.average as Record<string, unknown> | undefined;
          return {
            student_id: s.id as number,
            class_id: classId,
            term_id: termId,
            grade: tg?.grade as string | undefined,
            average_percent: avg?.percent as number | undefined,
            comments: tg?.comments as string | undefined,
          };
        });
        
        if (termGrades.length > 0) {
          console.log('💾 Saving term grades to database...');
          const { data: savedTermGrades, error } = await databaseService.upsertTermGrades(termGrades);
          if (error) {
            console.error('❌ Failed to save term grades to database:', error);
          } else {
            console.log('✅ Term grades saved to database');
            
            // Save rubrics if term grades were saved successfully
            if (savedTermGrades && savedTermGrades.length > 0) {
              console.log(`📊 Processing rubrics for ${savedTermGrades.length} term grades...`);
              console.log(`📋 Sample saved term grade:`, JSON.stringify(savedTermGrades[0], null, 2));
              console.log(`📋 All saved term grade IDs:`, savedTermGrades.map(tg => ({ student_id: tg.student_id, id: tg.id })));
              
              const rubrics: TermGradeRubric[] = [];
              
              // Create a map of student_id to term_grade_id for quick lookup
              // Ensure student_id is a number for consistent lookups
              const studentToTermGradeId = new Map<number, number>();
              savedTermGrades.forEach(tg => {
                // Ensure student_id is a number
                const studentId = typeof tg.student_id === 'string' ? parseInt(tg.student_id, 10) : tg.student_id;
                if (tg.id) {
                  studentToTermGradeId.set(studentId, tg.id);
                  console.log(`  ✓ Mapped student ${studentId} (type: ${typeof studentId}) -> term_grade_id ${tg.id}`);
                } else {
                  console.warn(`⚠️ Term grade missing id for student ${studentId}, class ${tg.class_id}, term ${tg.term_id}`);
                  console.warn(`   Full term grade object:`, JSON.stringify(tg, null, 2));
                }
              });
              
              console.log(`🔗 Mapped ${studentToTermGradeId.size} student IDs to term grade IDs`);
              console.log(`🔍 Map contents:`, Array.from(studentToTermGradeId.entries()));
              
              // Extract rubrics from each student's term_grade
              let studentsWithRubrics = 0;
              studentsArray.forEach((student: unknown) => {
                const s = student as Record<string, unknown> & { id: unknown; name?: string; term_grade?: { rubrics?: unknown[] } };
                const studentId = typeof s?.id === 'string' ? parseInt(String(s.id), 10) : Number(s?.id);
                const termGradeId = studentToTermGradeId.get(studentId);
                console.log(`🔍 Looking up student ${studentId} (type: ${typeof studentId}), found term_grade_id: ${termGradeId}`);
                console.log(`   Map has key? ${studentToTermGradeId.has(studentId)}, Map size: ${studentToTermGradeId.size}`);
                if (termGradeId && (s?.term_grade as Record<string, unknown>)?.rubrics) {
                  studentsWithRubrics++;
                  const studentRubrics = ((s.term_grade as Record<string, unknown>).rubrics as unknown[]) || [];
                  console.log(`📝 Student ${s.id} (${s.name}) has ${studentRubrics.length} rubrics`);
                  studentRubrics.forEach((rubric: unknown) => {
                    const r = rubric as Record<string, unknown>;
                    if (r?.id && r?.title) {
                      rubrics.push({
                        term_grade_id: termGradeId,
                        rubric_id: r.id as number,
                        title: String(r.title),
                        grade: (r.grade as string | null) ?? null,
                      });
                    }
                  });
                } else if (!termGradeId) {
                  console.warn(`⚠️ No term_grade_id found for student ${s.id}`);
                } else if (!(s.term_grade as Record<string, unknown>)?.rubrics) {
                  console.log(`ℹ️ Student ${s.id} has no rubrics in term_grade`);
                }
              });
              
              console.log(`📊 Found rubrics for ${studentsWithRubrics} students, total ${rubrics.length} rubrics`);
              
              if (rubrics.length > 0) {
                console.log(`💾 Saving ${rubrics.length} term grade rubrics to database...`);
                const { error: rubricsError } = await databaseService.upsertTermGradeRubrics(rubrics);
                if (rubricsError) {
                  console.error('❌ Failed to save term grade rubrics to database:', rubricsError);
                } else {
                  console.log('✅ Term grade rubrics saved to database');
                }
              } else {
                console.log('ℹ️ No rubrics to save');
              }
            } else {
              console.warn('⚠️ No saved term grades returned from database');
            }
          }
        }
      }
      
      // Return the response in the expected format
      return validated.data || { students: studentsData, meta: responseObj?.meta };
    } catch (error) {
      console.error('Failed to fetch term grades:', error);
      throw error;
    }
  }

  /**
   * Get current school ID
   */
  getCurrentSchoolId(): number | null {
    return this.currentSchoolId;
  }

  /**
   * Set current school ID
   */
  setCurrentSchoolId(schoolId: number): void {
    this.currentSchoolId = schoolId;
    this.studentsSyncedFromYearGroups = false;
  }

  /**
   * Normalize date string (YYYY-MM-DD)
   */
  private normalizeDate(date?: string | null): string | null {
    if (!date) {
      return null;
    }
    return date.split('T')[0];
  }

  /**
   * Get normalized start/end dates for an academic year
   */
  private getAcademicYearDates(year: AcademicYear): { startsOn: string; endsOn: string } {
    let startsOn = this.normalizeDate(year.starts_on);
    let endsOn = this.normalizeDate(year.ends_on);

    if (!startsOn || !endsOn) {
      const yearMatch = year.name?.match(/(\d{4})/);
      if (yearMatch) {
        const startYear = parseInt(yearMatch[1], 10);
        startsOn = startsOn || `${startYear}-08-01`;
        endsOn = endsOn || `${startYear + 1}-07-31`;
      } else {
        const currentYear = new Date().getFullYear();
        startsOn = startsOn || `${currentYear}-08-01`;
        endsOn = endsOn || `${currentYear + 1}-07-31`;
      }
    }

    return { startsOn, endsOn };
  }

  /**
   * Get normalized start/end dates for an academic term
   */
  private getAcademicTermDates(
    term: AcademicTerm,
    defaultStart: string,
    defaultEnd: string
  ): { startsOn: string; endsOn: string } {
    const startsOn = this.normalizeDate(term.starts_on) || defaultStart;
    const endsOn = this.normalizeDate(term.ends_on) || defaultEnd;
    return { startsOn, endsOn };
  }

  /**
   * Resolve program code to API key
   */
  private resolveProgramKey(requestedCode: string, academicData: Record<string, any>): string | null {
    if (!requestedCode) {
      return null;
    }

    const normalized = requestedCode.toLowerCase();
    if (academicData[normalized]) {
      return normalized;
    }

    const aliasMap: Record<string, string> = {
      ib: 'diploma',
      dp: 'diploma',
      ibdp: 'diploma',
      'ib diploma': 'diploma',
      diploma: 'diploma',
      pyp: 'pyp',
      ibpyp: 'ibpyp',
      myp: 'myp',
      ibmyp: 'myp',
      ms: 'ms',
      hs: 'hs'
    };

    const mapped = aliasMap[normalized];
    if (mapped && academicData[mapped]) {
      return mapped;
    }

    return null;
  }

  /**
   * Map program names/codes to canonical API codes
   */
  private resolveProgramCodeFromName(program?: string | null): string | null {
    if (!program) {
      return null;
    }

    const normalized = program.toLowerCase().trim();
    const aliasMap: Record<string, string> = {
      'ib diploma': 'diploma',
      diploma: 'diploma',
      'ib middle years': 'myp',
      'middle years': 'myp',
      myp: 'myp',
      'ib primary years': 'pyp',
      'primary years': 'pyp',
      pyp: 'pyp',
      'ibpyp': 'pyp', // Map ibpyp to pyp for matching
      'ib pyp': 'pyp',
      ms: 'ms',
      hs: 'hs'
    };

    return aliasMap[normalized] || normalized;
  }

  /**
   * Synchronize students by iterating grades and matching year groups
   */
  private async syncStudentsByGradesAndYearGroups(apiKey: string): Promise<void> {
    if (!this.currentSchoolId || this.studentsSyncedFromYearGroups) {
      return;
    }

    const schoolId = this.currentSchoolId;

    let yearGroups = await databaseService.getYearGroupsForSchool(schoolId);
    if (!yearGroups.length) {
      console.log('ℹ️ No year groups stored locally; fetching from ManageBac...');
      await this.getYearGroups(apiKey);
      yearGroups = await databaseService.getYearGroupsForSchool(schoolId);
    }

    if (!yearGroups.length) {
      console.warn('⚠️ Unable to sync students because no year groups are available.');
      return;
    }

    let grades = await databaseService.getGradesForSchool(schoolId);
    if (!grades.length) {
      console.log('ℹ️ No grades stored locally; fetching from ManageBac...');
      await this.getGrades(apiKey);
      grades = await databaseService.getGradesForSchool(schoolId);
    }

    if (!grades.length) {
      console.warn('⚠️ Unable to sync students because no grades are available.');
      return;
    }

    // Map key(program_code:grade_number) -> year groups
    const yearGroupMap = new Map<string, YearGroupRecord[]>();
    for (const group of yearGroups) {
      const programCode = this.resolveProgramCodeFromName(group.program);
      const gradeNumber = typeof group.grade_number === 'string'
        ? parseInt(group.grade_number as any, 10)
        : group.grade_number;

      if (!programCode || gradeNumber === undefined || gradeNumber === null) {
        continue;
      }

      const key = `${programCode}:${gradeNumber}`;
      if (!yearGroupMap.has(key)) {
        yearGroupMap.set(key, []);
      }
      yearGroupMap.get(key)!.push(group);
    }

    const allStudentIds = new Set<number>();
    const studentPlacement = new Map<number, { gradeId: number | null; yearGroupId: number }>();

    for (const grade of grades) {
      // Ensure we have a valid grade ID from the database
      if (!grade.id) {
        console.warn(`⚠️ Grade missing ID: program_code=${grade.program_code}, grade_number=${grade.grade_number}`);
        continue;
      }

      const programCode = (grade.program_code || '').toLowerCase().trim();
      const key = `${programCode}:${grade.grade_number}`;
      const groups = yearGroupMap.get(key);

      if (!groups?.length) {
        // Try alternative program code mappings (e.g., ibpyp -> pyp)
        const altProgramCode = programCode === 'ibpyp' ? 'pyp' : 
                              programCode === 'pyp' ? 'ibpyp' : null;
        const altKey = altProgramCode ? `${altProgramCode}:${grade.grade_number}` : null;
        const altGroups = altKey ? yearGroupMap.get(altKey) : null;
        
        if (altGroups?.length) {
          console.log(`ℹ️ Mapped grade (${programCode}, ${grade.grade_number}) to year groups via alternative program code (${altProgramCode})`);
          for (const group of altGroups) {
            const studentIds = await this.fetchYearGroupStudentIds(apiKey, group.id);
            if (!studentIds.length) {
              continue;
            }

            for (const rawId of studentIds) {
              const studentId = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
              if (!studentId) {
                continue;
              }

              if (!studentPlacement.has(studentId)) {
                studentPlacement.set(studentId, {
                  gradeId: grade.id, // Use actual database grade.id, not grade_number
                  yearGroupId: group.id
                });
              }

              allStudentIds.add(studentId);
            }
          }
        } else {
          console.log(`ℹ️ No year groups mapped for grade (${programCode || 'unknown'}, ${grade.grade_number})`);
        }
        continue;
      }

      for (const group of groups) {
        const studentIds = await this.fetchYearGroupStudentIds(apiKey, group.id);
        if (!studentIds.length) {
          console.log(`    ℹ️ No students reported for year group ${group.name}`);
          continue;
        }

        for (const rawId of studentIds) {
          const studentId = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
          if (!studentId) {
            continue;
          }

          if (!studentPlacement.has(studentId)) {
            studentPlacement.set(studentId, {
              gradeId: grade.id, // Use actual database grade.id, not grade_number
              yearGroupId: group.id
            });
          }

          allStudentIds.add(studentId);
        }
      }
    }

    if (!allStudentIds.size) {
      console.log('ℹ️ No students detected across year groups.');
      return;
    }

    console.log(`\n💾 Fetching and saving ${allStudentIds.size} unique students in batches...`);
    
    const studentIdArray = Array.from(allStudentIds);
    const batchSize = 25;
    let totalSaved = 0;
    let totalRelationshipsCreated = 0;
    let totalRelationshipErrors = 0;

    for (let i = 0; i < studentIdArray.length; i += batchSize) {
      const batch = studentIdArray.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(studentIdArray.length / batchSize);
      
      console.log(`  📥 Fetching batch ${batchNum}/${totalBatches} (${batch.length} students)...`);

      // Fetch student details for this batch
      const studentsForDb = await this.fetchStudentDetailsBatch(
        apiKey,
        batch,
        studentPlacement
      );

      if (studentsForDb.length === 0) {
        console.warn(`    ⚠️ No student data fetched for batch ${batchNum}`);
        continue;
      }

      // Save this batch immediately
      console.log(`  💾 Saving batch ${batchNum} (${studentsForDb.length} students)...`);
      const { error: studentsError } = await databaseService.upsertStudents(studentsForDb);
      
      if (studentsError) {
        console.error(`    ❌ Failed to save batch ${batchNum}:`, studentsError);
        continue;
      }

      totalSaved += studentsForDb.length;
      console.log(`    ✅ Saved batch ${batchNum} (${studentsForDb.length} students)`);

      // Create year group relationships for this batch
      let batchRelationshipsCreated = 0;
      let batchRelationshipErrors = 0;
      
      for (const student of studentsForDb) {
        const placementInfo = studentPlacement.get(student.id);
        if (!placementInfo?.yearGroupId) {
          continue;
        }
        
        const { error } = await databaseService.upsertYearGroupStudent(
          placementInfo.yearGroupId,
          student.id
        );
        
        if (error) {
          batchRelationshipErrors++;
        } else {
          batchRelationshipsCreated++;
        }
      }

      totalRelationshipsCreated += batchRelationshipsCreated;
      totalRelationshipErrors += batchRelationshipErrors;

      if (batchRelationshipErrors > 0) {
        console.warn(`    ⚠️ ${batchRelationshipErrors} relationships failed in batch ${batchNum}`);
      }
    }

    console.log(`\n✅ Summary:`);
    console.log(`   - Saved ${totalSaved} students to database`);
    console.log(`   - Created ${totalRelationshipsCreated} year group/student relationships`);
    
    if (totalRelationshipErrors > 0) {
      console.warn(`   - ⚠️ ${totalRelationshipErrors} relationship errors`);
    }

    this.studentsSyncedFromYearGroups = true;
  }

  private async fetchYearGroupStudentIds(apiKey: string, yearGroupId: number): Promise<number[]> {
    try {
      const response = await this.makeRequest<any>(`/year-groups/${yearGroupId}/students`, apiKey);
      const data = response.data || {};
      if (Array.isArray(data.student_ids)) {
        return data.student_ids.map((id: any) => typeof id === 'string' ? parseInt(id, 10) : id).filter(Boolean);
      }

      if (Array.isArray(data.students)) {
        return data.students
          .map((student: any) => typeof student.id === 'string' ? parseInt(student.id, 10) : student.id)
          .filter(Boolean);
      }
    } catch (error: any) {
      console.warn(`    ⚠️ Failed to fetch students for year group ${yearGroupId}:`, error.message);
    }

    return [];
  }

  /**
   * Fetch student details for a single batch and return them for immediate saving
   */
  private async fetchStudentDetailsBatch(
    apiKey: string,
    studentIds: number[],
    placement: Map<number, { gradeId: number | null; yearGroupId: number }>
  ): Promise<any[]> {
    const studentsForDb: any[] = [];

    for (const studentId of studentIds) {
      try {
        const studentResponse = await this.makeRequest<any>(`/students/${studentId}`, apiKey);
        const studentData = studentResponse.data?.student || studentResponse.data;
        if (!studentData) {
          continue;
        }

        const placementInfo = placement.get(studentId);
        studentsForDb.push({
          id: typeof studentData.id === 'string' ? parseInt(studentData.id, 10) : studentData.id,
          grade_id: placementInfo?.gradeId ?? null,
          year_group_id: placementInfo?.yearGroupId ?? null,
          uniq_student_id: studentData.uniq_student_id || studentData.identifier || null,
          first_name: studentData.first_name || '',
          last_name: studentData.last_name || '',
          email: studentData.email || null,
          gender: studentData.gender || null,
          birthday: studentData.date_of_birth || studentData.birthday || null,
          archived: !studentData.is_active,
          program: studentData.program || null,
          program_code: studentData.program_code || null,
          class_grade: studentData.grade || null,
          class_grade_number: studentData.grade_number || null,
          graduating_year: studentData.graduating_year || null,
          nationalities: studentData.nationalities ? JSON.stringify(studentData.nationalities) : '[]',
          languages: studentData.languages ? JSON.stringify(studentData.languages) : '[]',
          timezone: studentData.timezone || null,
          ui_language: studentData.ui_language || null,
          student_id: studentData.student_id || null,
          identifier: studentData.identifier || null,
          oa_id: studentData.oa_id || null,
          withdrawn_on: studentData.withdrawn_on || null,
          photo_url: studentData.photo_url || null,
          homeroom_advisor_id: studentData.homeroom_advisor_id || null,
          attendance_start_date: studentData.attendance_start_date || null,
          parent_ids: studentData.parent_ids ? JSON.stringify(studentData.parent_ids) : '[]',
          additional_homeroom_advisor_ids: studentData.additional_homeroom_advisor_ids
            ? JSON.stringify(studentData.additional_homeroom_advisor_ids)
            : '[]'
        });
      } catch (error: any) {
        console.warn(`    ⚠️ Failed to fetch student ${studentId}:`, error.message);
      }
    }

    return studentsForDb;
  }

  /**
   * Sync class memberships for a specific year group
   * Process one student at a time:
   * 1. Get students for the year group
   * 2. For each student, fetch their memberships
   * 3. For each membership, fetch and save the class if not already saved
   * 4. Save the membership
   */
  async syncClassMembershipsForYearGroup(apiKey: string, yearGroupId: number): Promise<void> {
    if (!this.currentSchoolId) {
      console.error('❌ No school context available');
      return;
    }

    console.log(`\n📚 Syncing class memberships for year group ${yearGroupId}...`);

    // Step 1: Get students for this year group
    const students = await databaseService.getStudentsForYearGroup(yearGroupId);
    if (students.length === 0) {
      console.log(`ℹ️ No students found for year group ${yearGroupId}`);
      return;
    }

    console.log(`  📋 Found ${students.length} students in year group`);
    console.log(`  📥 Processing students one by one...\n`);

    // Track classes we've already fetched and saved
    const fetchedClassIds = new Set<number>();
    let totalMembershipsSaved = 0;
    let totalClassesSaved = 0;

    // Process each student individually
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      console.log(`  👤 Student ${i + 1}/${students.length}: ${student.first_name} ${student.last_name} (ID: ${student.id})`);

      try {
        // Fetch memberships for this single student
        const membershipResponse = await this.getMemberships(apiKey, [student.id], undefined, undefined, undefined, undefined);
        let memberships: any[] = [];

        if (membershipResponse?.memberships) {
          memberships = Array.isArray(membershipResponse.memberships) 
            ? membershipResponse.memberships 
            : [];
        } else if (membershipResponse?.data?.memberships) {
          memberships = Array.isArray(membershipResponse.data.memberships) 
            ? membershipResponse.data.memberships 
            : [];
        } else if (Array.isArray(membershipResponse)) {
          memberships = membershipResponse;
        }

        if (memberships.length === 0) {
          console.log(`    ℹ️ No memberships found for this student`);
          continue;
        }

        console.log(`    📋 Found ${memberships.length} memberships`);

        // Process each membership
        const membershipsForDb: any[] = [];

        for (const membership of memberships) {
          const classId = typeof membership.class_id === 'string' 
            ? parseInt(membership.class_id, 10) 
            : membership.class_id;

          if (!classId) {
            console.warn(`    ⚠️ Membership missing class_id, skipping`);
            continue;
          }

          // Fetch and save class if we haven't already
          if (!fetchedClassIds.has(classId)) {
            console.log(`    📖 Fetching class ${classId}...`);
            
            try {
              const classData = await this.getClassById(apiKey, classId);
              if (!classData) {
                console.warn(`      ⚠️ Class ${classId} not found, skipping membership`);
                continue;
              }

              // Map ManageBac Class to database ClassRecord
              const classForDb = {
                id: typeof classData.id === 'string' ? parseInt(classData.id, 10) : classData.id,
                school_id: this.currentSchoolId,
                subject_id: classData.subject_id || null,
                name: classData.name || '',
                description: classData.description || null,
                uniq_id: classData.uniq_id || null,
                class_section: classData.class_section || null,
                language: classData.language || 'en',
                program_code: classData.program_code || '',
                grade_number: classData.grade_number || null,
                start_term_id: classData.start_term_id || null,
                end_term_id: classData.end_term_id || null,
                archived: classData.archived || false,
                lock_memberships: classData.lock_memberships || null
              };

              // Save class immediately
              const { error: classError } = await databaseService.upsertClasses([classForDb], this.currentSchoolId);
              
              if (classError) {
                console.warn(`      ⚠️ Failed to save class ${classId}: ${classError}`);
                continue;
              }

              fetchedClassIds.add(classId);
              totalClassesSaved++;
              console.log(`      ✅ Saved class: ${classData.name}`);
            } catch (error: any) {
              console.warn(`      ⚠️ Failed to fetch class ${classId}: ${error.message}`);
              continue;
            }
          }

          // Add membership to batch
          membershipsForDb.push({
            class_id: classId,
            user_id: student.id,
            role: membership.role || 'Student',
            level: membership.level || null,
            show_on_reports: membership.show_on_reports !== undefined ? membership.show_on_reports : true,
            first_joined_at: membership.first_joined_at ? new Date(membership.first_joined_at) : null
          });
        }

        // Save memberships for this student
        if (membershipsForDb.length > 0) {
          const { error: membershipsError } = await databaseService.upsertClassMemberships(membershipsForDb);
          
          if (membershipsError) {
            console.warn(`    ⚠️ Failed to save memberships: ${membershipsError}`);
          } else {
            totalMembershipsSaved += membershipsForDb.length;
            console.log(`    ✅ Saved ${membershipsForDb.length} memberships`);
          }
        }

      } catch (error: any) {
        console.warn(`    ⚠️ Failed to process student ${student.id}: ${error.message}`);
      }
    }

    console.log(`\n✅ Summary:`);
    console.log(`   - Processed ${students.length} students`);
    console.log(`   - Saved ${totalClassesSaved} unique classes`);
    console.log(`   - Saved ${totalMembershipsSaved} memberships`);
    console.log(`\n✅ Completed syncing class memberships for year group ${yearGroupId}`);
  }

  /**
   * Sync term grades for all class memberships in a specific year group
   * 1. Get class memberships for first 10 students in the year group
   * 2. For each class, get its start_term_id and end_term_id
   * 3. Get academic terms within that range
   * 4. Fetch term grades only for valid class × term combinations
   */
  async syncTermGradesForYearGroup(apiKey: string, yearGroupId: number): Promise<void> {
    if (!this.currentSchoolId) {
      console.error('❌ No school context available');
      return;
    }

    console.log(`\n📊 Syncing term grades for year group ${yearGroupId}...`);
    console.log(`  ⚠️ Limiting to first 10 students for testing`);

    // Step 1: Get class memberships for first 10 students in this year group
    const memberships = await databaseService.getClassMembershipsForYearGroup(yearGroupId, 10);
    if (memberships.length === 0) {
      console.log(`ℹ️ No class memberships found for first 10 students in year group ${yearGroupId}`);
      return;
    }

    // Get unique class_ids
    const uniqueClassIds = [...new Set(memberships.map(m => m.class_id))];
    console.log(`  📋 Found ${memberships.length} memberships across ${uniqueClassIds.length} unique classes`);

    // Step 2: For each class, get its term range and fetch term grades
    let totalTermGradesFetched = 0;
    let totalTermGradesSaved = 0;
    let errors = 0;
    let skippedClasses = 0;

    for (let i = 0; i < uniqueClassIds.length; i++) {
      const classId = uniqueClassIds[i];
      console.log(`\n  📚 Processing class ${i + 1}/${uniqueClassIds.length} (ID: ${classId})...`);

      // Get class details to find start_term_id and end_term_id
      const classDetails = await databaseService.getClassById(classId);
      if (!classDetails) {
        console.warn(`    ⚠️ Class ${classId} not found in database, skipping`);
        skippedClasses++;
        continue;
      }

      if (!classDetails.start_term_id || !classDetails.end_term_id) {
        console.log(`    ℹ️ Class ${classId} (${classDetails.name}) has no term range defined, skipping`);
        skippedClasses++;
        continue;
      }

      console.log(`    📅 Class term range: ${classDetails.start_term_id} to ${classDetails.end_term_id}`);

      // Get academic terms within this class's term range
      const terms = await databaseService.getAcademicTermsInRange(
        classDetails.start_term_id,
        classDetails.end_term_id
      );

      if (terms.length === 0) {
        console.log(`    ℹ️ No terms found in range ${classDetails.start_term_id} to ${classDetails.end_term_id}, skipping`);
        skippedClasses++;
        continue;
      }

      console.log(`    📋 Found ${terms.length} terms for this class: ${terms.map(t => `${t.name} (${t.id})`).join(', ')}`);

      // Step 3: Fetch term grades for each term in this class's range
      for (const term of terms) {
        console.log(`    📊 Fetching term grades: Class ${classId}, Term ${term.id} (${term.name})...`);

        try {
          // getTermGrades already saves to database automatically
          const termGradeResponse = await this.getTermGrades(apiKey, classId, term.id);
          
          if (termGradeResponse?.students) {
            const count = termGradeResponse.students.length;
            totalTermGradesFetched += count;
            totalTermGradesSaved += count;
            console.log(`      ✅ Fetched and saved ${count} term grades`);
          } else {
            console.log(`      ℹ️ No term grades found for this class/term combination`);
          }
        } catch (error: any) {
          errors++;
          console.warn(`      ⚠️ Failed to fetch term grades for class ${classId}, term ${term.id}: ${error.message}`);
        }
      }
    }

    console.log(`\n✅ Summary:`);
    console.log(`   - Processed ${uniqueClassIds.length} classes`);
    console.log(`   - Skipped ${skippedClasses} classes (no term range or no terms found)`);
    console.log(`   - Fetched and saved ${totalTermGradesSaved} term grades`);
    if (errors > 0) {
      console.log(`   - ⚠️ ${errors} errors encountered`);
    }
    console.log(`\n✅ Completed syncing term grades for year group ${yearGroupId}`);
  }
}

export const manageBacService = new ManageBacService();

