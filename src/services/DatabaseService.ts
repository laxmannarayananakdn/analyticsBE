/**
 * Database Service
 * Handles all database operations with Azure SQL Database
 */

import { executeQuery, getConnection, sql } from '../config/database';

export interface School {
  id: number;
  name: string;
  subdomain?: string;
  country?: string;
  language?: string;
  session_in_may?: boolean;
  kbl_id?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface AcademicYear {
  id: number;
  school_id: number;
  program_code: string;
  name: string;
  starts_on: Date;
  ends_on: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface Grade {
  id?: number;
  school_id: number;
  program_code: string;
  name: string;
  label?: string;
  code: string;
  uid: number;
  grade_number: number;
  created_at?: Date;
}

export interface AcademicTermRecord {
  id: number;
  academic_year_id: number;
  name: string;
  starts_on: Date;
  ends_on: Date;
  locked?: boolean;
  exam_grade?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface SubjectGroupRecord {
  id: number;
  school_id: number;
  program_code: string;
  name: string;
  max_phase?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface SubjectRecord {
  id: number;
  school_id: number;
  subject_group_id?: number | null;
  name: string;
  custom?: boolean;
  sl?: boolean;
  hl?: boolean;
  self_taught?: boolean;
  enabled?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface YearGroupRecord {
  id: number;
  school_id: number;
  name: string;
  short_name?: string | null;
  program: string;
  grade: string;
  grade_number: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface Student {
  id: number;
  grade_id?: number;
  year_group_id?: number;
  uniq_student_id?: string;
  first_name: string;
  last_name: string;
  email?: string;
  gender?: string;
  birthday?: Date;
  archived?: boolean;
  program?: string;
  program_code?: string;
  class_grade?: string;
  class_grade_number?: number;
  graduating_year?: number;
  nationalities?: string; // JSON string
  languages?: string; // JSON string
  timezone?: string;
  ui_language?: string;
  student_id?: string;
  identifier?: string;
  oa_id?: string;
  withdrawn_on?: Date;
  photo_url?: string;
  homeroom_advisor_id?: number;
  attendance_start_date?: Date;
  parent_ids?: string; // JSON string
  additional_homeroom_advisor_ids?: string; // JSON string
  created_at?: Date;
  updated_at?: Date;
}

export interface ClassRecord {
  id: number;
  school_id: number;
  subject_id?: number | null;
  name: string;
  description?: string | null;
  uniq_id?: string | null;
  class_section?: string | null;
  language?: string;
  program_code: string;
  grade_number?: number | null;
  start_term_id?: number | null;
  end_term_id?: number | null;
  archived?: boolean;
  lock_memberships?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface ClassMembershipRecord {
  id?: number;
  class_id: number;
  user_id: number;
  role: string;
  level?: number | null;
  show_on_reports?: boolean;
  first_joined_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface TermGrade {
  id?: number;
  student_id: number;
  class_id: number;
  term_id: number;
  grade?: string;
  average_percent?: number;
  comments?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface TermGradeRubric {
  id?: number;
  term_grade_id: number;
  rubric_id: number;
  title: string;
  grade?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export class DatabaseService {
  private gradesConstraintChecked = false;
  /**
   * Upsert school data
   */
  async upsertSchool(school: School): Promise<{ data: School | null; error: string | null }> {
    try {
      // First, attempt to update existing record
      const updateQuery = `
        UPDATE MB.schools
        SET 
          name = @name,
          subdomain = @subdomain,
          country = @country,
          language = @language,
          session_in_may = @session_in_may,
          kbl_id = @kbl_id,
          updated_at = SYSDATETIMEOFFSET()
        WHERE id = @id;

        SELECT @@ROWCOUNT as rows_affected;
      `;

      const updateResult = await executeQuery<{ rows_affected: number }>(updateQuery, {
        id: school.id,
        name: school.name,
        subdomain: school.subdomain || null,
        country: school.country || null,
        language: school.language || 'en',
        session_in_may: school.session_in_may || false,
        kbl_id: school.kbl_id || null
      });

      const rowsAffected = updateResult.data?.[0]?.rows_affected || 0;

      if (rowsAffected === 0) {
        // No existing record, insert with identity insert
        const insertQuery = `
          SET IDENTITY_INSERT MB.schools ON;

          INSERT INTO MB.schools (
            id, name, subdomain, country, language, session_in_may, kbl_id, created_at, updated_at
          ) VALUES (
            @id, @name, @subdomain, @country, @language, @session_in_may, @kbl_id, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
          );

          SET IDENTITY_INSERT MB.schools OFF;

          SELECT * FROM MB.schools WHERE id = @id;
        `;

        const insertResult = await executeQuery<School>(insertQuery, {
          id: school.id,
          name: school.name,
          subdomain: school.subdomain || null,
          country: school.country || null,
          language: school.language || 'en',
          session_in_may: school.session_in_may || false,
          kbl_id: school.kbl_id || null
        });

        if (insertResult.error) {
          return { data: null, error: insertResult.error };
        }

        return { data: (insertResult.data && insertResult.data[0]) || null, error: null };
      }

      // If update was successful, fetch the updated record
      const selectQuery = 'SELECT * FROM MB.schools WHERE id = @id';
      const selectResult = await executeQuery<School>(selectQuery, { id: school.id });

      if (selectResult.error) {
        return { data: null, error: selectResult.error };
      }

      return { data: (selectResult.data && selectResult.data[0]) || null, error: null };
    } catch (error: any) {
      console.error('❌ Failed to upsert school:', error);
      return { data: null, error: error.message || 'Failed to upsert school' };
    }

  }

  /**
   * Upsert programs for a school
   */
  async upsertPrograms(
    programs: Array<{ name: string; code: string }>,
    schoolId: number
  ): Promise<{ data: any[] | null; error: string | null }> {
    if (!programs || programs.length === 0) {
      return { data: [], error: null };
    }

    const results: any[] = [];
    const errors: string[] = [];

    for (const program of programs) {
      const query = `
        MERGE MB.programs AS target
        USING (SELECT @school_id AS school_id, @code AS code) AS source
        ON target.school_id = source.school_id AND target.code = source.code
        WHEN MATCHED THEN
          UPDATE SET
            name = @name,
            enabled = 1,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (school_id, name, code, enabled, created_at, updated_at)
          VALUES (@school_id, @name, @code, 1, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

        SELECT * FROM MB.programs WHERE school_id = @school_id AND code = @code;
      `;

      const result = await executeQuery<any>(query, {
        school_id: schoolId,
        name: program.name,
        code: program.code
      });

      if (result.error) {
        errors.push(`Program ${program.code}: ${result.error}`);
      } else if (result.data?.[0]) {
        results.push(result.data[0]);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Ensure grades table supports multiple rows per program/grade number by dropping legacy constraints
   */
  private async ensureGradesConstraintAllowsMultipleEntries(): Promise<void> {
    if (this.gradesConstraintChecked) {
      return;
    }

    const dropConstraintsQuery = `
      IF EXISTS (
        SELECT 1 
        FROM sys.objects 
        WHERE type = 'UQ' 
          AND name = 'UQ_grades_school_program'
      )
      BEGIN
        ALTER TABLE MB.grades DROP CONSTRAINT UQ_grades_school_program;
      END

      IF EXISTS (
        SELECT 1 
        FROM sys.objects 
        WHERE type = 'UQ' 
          AND name = 'UQ_grades_school_grade_number'
      )
      BEGIN
        ALTER TABLE MB.grades DROP CONSTRAINT UQ_grades_school_grade_number;
      END
    `;

    const result = await executeQuery(dropConstraintsQuery);
    if (result.error) {
      console.warn('⚠️ Could not drop legacy grade constraints:', result.error);
      return;
    }

    this.gradesConstraintChecked = true;
  }

  /**
   * Upsert grades for a school
   */
  async upsertGrades(
    grades: Grade[],
    schoolId: number
  ): Promise<{ data: Grade[] | null; error: string | null }> {
    await this.ensureGradesConstraintAllowsMultipleEntries();

    if (!grades || grades.length === 0) {
      return { data: [], error: null };
    }

    const results: Grade[] = [];
    const errors: string[] = [];

    for (const grade of grades) {
      try {
        // Check if grade exists by uid (unique identifier)
        const checkQuery = 'SELECT id FROM MB.grades WHERE uid = @uid';
        const checkResult = await executeQuery<{ id: number }>(checkQuery, { uid: grade.uid });

        if (checkResult.error) {
          errors.push(`Grade ${grade.uid}: ${checkResult.error}`);
          continue;
        }

        const existingGrade = checkResult.data?.[0];

        if (existingGrade) {
          // Update existing grade
          const updateQuery = `
            UPDATE MB.grades
            SET 
              school_id = @school_id,
              program_code = @program_code,
              name = @name,
              label = @label,
              code = @code,
              grade_number = @grade_number
            WHERE uid = @uid;

            SELECT * FROM MB.grades WHERE uid = @uid;
          `;

          const updateResult = await executeQuery<Grade>(updateQuery, {
            school_id: schoolId,
            program_code: grade.program_code,
            name: grade.name,
            label: grade.label || null,
            code: grade.code,
            uid: grade.uid,
            grade_number: grade.grade_number
          });

          if (updateResult.error) {
            errors.push(`Grade ${grade.uid}: ${updateResult.error}`);
          } else if (updateResult.data?.[0]) {
            results.push(updateResult.data[0]);
          }
        } else {
          // Insert new grade (uid is the unique identifier, not id)
          const insertQuery = `
            INSERT INTO MB.grades (
              school_id, program_code, name, label, code, uid, grade_number, created_at
            ) VALUES (
              @school_id, @program_code, @name, @label, @code, @uid, @grade_number, SYSDATETIMEOFFSET()
            );

            SELECT * FROM MB.grades WHERE uid = @uid;
          `;

          const insertResult = await executeQuery<Grade>(insertQuery, {
            school_id: schoolId,
            program_code: grade.program_code,
            name: grade.name,
            label: grade.label || null,
            code: grade.code,
            uid: grade.uid,
            grade_number: grade.grade_number
          });

          if (insertResult.error) {
            errors.push(`Grade ${grade.uid}: ${insertResult.error}`);
          } else if (insertResult.data?.[0]) {
            results.push(insertResult.data[0]);
          }
        }
      } catch (error: any) {
        errors.push(`Grade ${grade.uid}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Upsert subject groups
   */
  async upsertSubjectGroups(
    groups: SubjectGroupRecord[],
    schoolId: number
  ): Promise<{ data: SubjectGroupRecord[] | null; error: string | null }> {
    if (!groups || groups.length === 0) {
      return { data: [], error: null };
    }

    const uniqueGroups = new Map<number, SubjectGroupRecord>();
    groups.forEach(group => {
      uniqueGroups.set(group.id, {
        ...group,
        school_id: schoolId,
      });
    });

    const results: SubjectGroupRecord[] = [];
    const errors: string[] = [];

    for (const group of uniqueGroups.values()) {
      try {
        const updateQuery = `
          UPDATE MB.subject_groups
          SET 
            school_id = @school_id,
            program_code = @program_code,
            name = @name,
            max_phase = @max_phase,
            updated_at = SYSDATETIMEOFFSET()
          WHERE id = @id;

          SELECT @@ROWCOUNT as rows_affected;
        `;

        const updateResult = await executeQuery<{ rows_affected: number }>(updateQuery, {
          id: group.id,
          school_id: group.school_id,
          program_code: group.program_code,
          name: group.name,
          max_phase: group.max_phase || null
        });

        const rowsAffected = updateResult.data?.[0]?.rows_affected || 0;

        if (rowsAffected === 0) {
          const insertQuery = `
            SET IDENTITY_INSERT MB.subject_groups ON;

            INSERT INTO MB.subject_groups (
              id, school_id, program_code, name, max_phase, created_at, updated_at
            ) VALUES (
              @id, @school_id, @program_code, @name, @max_phase, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
            );

            SET IDENTITY_INSERT MB.subject_groups OFF;

            SELECT * FROM MB.subject_groups WHERE id = @id;
          `;

          const insertResult = await executeQuery<SubjectGroupRecord>(insertQuery, {
            id: group.id,
            school_id: group.school_id,
            program_code: group.program_code,
            name: group.name,
            max_phase: group.max_phase || null
          });

          if (insertResult.error) {
            errors.push(`Subject group ${group.id}: ${insertResult.error}`);
          } else if (insertResult.data?.[0]) {
            results.push(insertResult.data[0]);
          }
        } else {
          const selectResult = await executeQuery<SubjectGroupRecord>(
            'SELECT * FROM MB.subject_groups WHERE id = @id',
            { id: group.id }
          );

          if (selectResult.error) {
            errors.push(`Subject group ${group.id}: ${selectResult.error}`);
          } else if (selectResult.data?.[0]) {
            results.push(selectResult.data[0]);
          }
        }
      } catch (error: any) {
        errors.push(`Subject group ${group.id}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Upsert subjects
   */
  async upsertSubjects(
    subjects: SubjectRecord[],
    schoolId: number
  ): Promise<{ data: SubjectRecord[] | null; error: string | null }> {
    if (!subjects || subjects.length === 0) {
      return { data: [], error: null };
    }

    const results: SubjectRecord[] = [];
    const errors: string[] = [];

    for (const subject of subjects) {
      try {
        const updateQuery = `
          UPDATE MB.subjects
          SET 
            school_id = @school_id,
            subject_group_id = @subject_group_id,
            name = @name,
            custom = @custom,
            sl = @sl,
            hl = @hl,
            self_taught = @self_taught,
            enabled = @enabled,
            updated_at = SYSDATETIMEOFFSET()
          WHERE id = @id;

          SELECT @@ROWCOUNT as rows_affected;
        `;

        const updateResult = await executeQuery<{ rows_affected: number }>(updateQuery, {
          id: subject.id,
          school_id: schoolId,
          subject_group_id: subject.subject_group_id || null,
          name: subject.name,
          custom: subject.custom ?? false,
          sl: subject.sl ?? false,
          hl: subject.hl ?? false,
          self_taught: subject.self_taught ?? false,
          enabled: subject.enabled ?? true
        });

        const rowsAffected = updateResult.data?.[0]?.rows_affected || 0;

        if (rowsAffected === 0) {
          const insertQuery = `
            SET IDENTITY_INSERT MB.subjects ON;

            INSERT INTO MB.subjects (
              id, school_id, subject_group_id, name, custom, sl, hl, self_taught, enabled, created_at, updated_at
            ) VALUES (
              @id, @school_id, @subject_group_id, @name, @custom, @sl, @hl, @self_taught, @enabled, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
            );

            SET IDENTITY_INSERT MB.subjects OFF;

            SELECT * FROM MB.subjects WHERE id = @id;
          `;

          const insertResult = await executeQuery<SubjectRecord>(insertQuery, {
            id: subject.id,
            school_id: schoolId,
            subject_group_id: subject.subject_group_id || null,
            name: subject.name,
            custom: subject.custom ?? false,
            sl: subject.sl ?? false,
            hl: subject.hl ?? false,
            self_taught: subject.self_taught ?? false,
            enabled: subject.enabled ?? true
          });

          if (insertResult.error) {
            errors.push(`Subject ${subject.id}: ${insertResult.error}`);
          } else if (insertResult.data?.[0]) {
            results.push(insertResult.data[0]);
          }
        } else {
          const selectResult = await executeQuery<SubjectRecord>(
            'SELECT * FROM MB.subjects WHERE id = @id',
            { id: subject.id }
          );

          if (selectResult.error) {
            errors.push(`Subject ${subject.id}: ${selectResult.error}`);
          } else if (selectResult.data?.[0]) {
            results.push(selectResult.data[0]);
          }
        }
      } catch (error: any) {
        errors.push(`Subject ${subject.id}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Upsert year groups
   */
  async upsertYearGroups(
    yearGroups: YearGroupRecord[],
    schoolId: number
  ): Promise<{ data: YearGroupRecord[] | null; error: string | null }> {
    if (!yearGroups || yearGroups.length === 0) {
      return { data: [], error: null };
    }

    const results: YearGroupRecord[] = [];
    const errors: string[] = [];

    for (const group of yearGroups) {
      try {
        const updateQuery = `
          UPDATE MB.year_groups
          SET
            school_id = @school_id,
            name = @name,
            short_name = @short_name,
            program = @program,
            grade = @grade,
            grade_number = @grade_number,
            updated_at = SYSDATETIMEOFFSET()
          WHERE id = @id;

          SELECT @@ROWCOUNT as rows_affected;
        `;

        const updateResult = await executeQuery<{ rows_affected: number }>(updateQuery, {
          id: group.id,
          school_id: schoolId,
          name: group.name,
          short_name: group.short_name || null,
          program: group.program,
          grade: group.grade,
          grade_number: group.grade_number
        });

        const rowsAffected = updateResult.data?.[0]?.rows_affected || 0;

        if (rowsAffected === 0) {
          const insertQuery = `
            SET IDENTITY_INSERT MB.year_groups ON;

            INSERT INTO MB.year_groups (
              id, school_id, name, short_name, program, grade, grade_number, created_at, updated_at
            ) VALUES (
              @id, @school_id, @name, @short_name, @program, @grade, @grade_number, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
            );

            SET IDENTITY_INSERT MB.year_groups OFF;

            SELECT * FROM MB.year_groups WHERE id = @id;
          `;

          const insertResult = await executeQuery<YearGroupRecord>(insertQuery, {
            id: group.id,
            school_id: schoolId,
            name: group.name,
            short_name: group.short_name || null,
            program: group.program,
            grade: group.grade,
            grade_number: group.grade_number
          });

          if (insertResult.error) {
            errors.push(`Year group ${group.id}: ${insertResult.error}`);
          } else if (insertResult.data?.[0]) {
            results.push(insertResult.data[0]);
          }
        } else {
          const selectResult = await executeQuery<YearGroupRecord>(
            'SELECT * FROM MB.year_groups WHERE id = @id',
            { id: group.id }
          );

          if (selectResult.error) {
            errors.push(`Year group ${group.id}: ${selectResult.error}`);
          } else if (selectResult.data?.[0]) {
            results.push(selectResult.data[0]);
          }
        }
      } catch (error: any) {
        errors.push(`Year group ${group.id}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Get all year groups for a school from the database
   */
  async getYearGroupsForSchool(schoolId: number): Promise<YearGroupRecord[]> {
    const query = `
      SELECT id, school_id, name, short_name, program, grade, grade_number, created_at, updated_at
      FROM MB.year_groups
      WHERE school_id = @school_id
    `;

    const result = await executeQuery<YearGroupRecord>(query, { school_id: schoolId });
    if (result.error || !result.data) {
      return [];
    }
    return result.data;
  }

  /**
   * Get all grades for a school from the database
   */
  async getGradesForSchool(
    schoolId: number
  ): Promise<Array<Pick<Grade, 'id' | 'program_code' | 'grade_number'>>> {
    const query = `
      SELECT id, program_code, grade_number
      FROM MB.grades
      WHERE school_id = @school_id
    `;

    const result = await executeQuery<Pick<Grade, 'id' | 'program_code' | 'grade_number'>>(query, { school_id: schoolId });
    if (result.error || !result.data) {
      return [];
    }
    return result.data;
  }

  /**
   * Get academic terms for a school
   */
  async getAcademicTermsForSchool(schoolId: number): Promise<AcademicTermRecord[]> {
    const query = `
      SELECT at.*
      FROM MB.academic_terms at
      INNER JOIN MB.academic_years ay ON at.academic_year_id = ay.id
      WHERE ay.school_id = @school_id
      ORDER BY ay.starts_on, at.starts_on
    `;

    const result = await executeQuery<AcademicTermRecord>(query, { school_id: schoolId });
    if (result.error || !result.data) {
      return [];
    }
    return result.data;
  }

  /**
   * Get class memberships for students in a year group (limited to first N students)
   */
  async getClassMembershipsForYearGroup(yearGroupId: number, limitStudents?: number): Promise<Array<{ class_id: number; user_id: number; role: string }>> {
    let query = `
      SELECT DISTINCT cm.class_id, cm.user_id, cm.role
      FROM MB.class_memberships cm
      INNER JOIN MB.year_group_students ygs ON cm.user_id = ygs.student_id
      WHERE ygs.year_group_id = @year_group_id
    `;

    if (limitStudents) {
      query += `
        AND ygs.student_id IN (
          SELECT TOP (@limit) student_id
          FROM MB.year_group_students
          WHERE year_group_id = @year_group_id
          ORDER BY student_id
        )
      `;
    }

    const params: Record<string, any> = { year_group_id: yearGroupId };
    if (limitStudents) {
      params.limit = limitStudents;
    }

    const result = await executeQuery<{ class_id: number; user_id: number; role: string }>(query, params);
    if (result.error || !result.data) {
      return [];
    }
    return result.data;
  }

  /**
   * Get class details by ID
   */
  async getClassById(classId: number): Promise<ClassRecord | null> {
    const query = `
      SELECT id, school_id, subject_id, name, description, uniq_id, class_section,
             language, program_code, grade_number, start_term_id, end_term_id,
             archived, lock_memberships, created_at, updated_at
      FROM MB.classes
      WHERE id = @class_id
    `;

    const result = await executeQuery<ClassRecord>(query, { class_id: classId });
    if (result.error || !result.data || result.data.length === 0) {
      return null;
    }
    return result.data[0];
  }

  /**
   * Get academic terms within a date range
   */
  async getAcademicTermsInRange(startTermId: number | null, endTermId: number | null): Promise<AcademicTermRecord[]> {
    if (!startTermId || !endTermId) {
      return [];
    }

    const query = `
      SELECT at.*
      FROM MB.academic_terms at
      WHERE at.id >= @start_term_id AND at.id <= @end_term_id
      ORDER BY at.starts_on
    `;

    const result = await executeQuery<AcademicTermRecord>(query, {
      start_term_id: startTermId,
      end_term_id: endTermId
    });

    if (result.error || !result.data) {
      return [];
    }
    return result.data;
  }

  /**
   * Upsert year group - student relationship
   */
  async upsertYearGroupStudent(
    yearGroupId: number,
    studentId: number
  ): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE MB.year_group_students AS target
        USING (SELECT @year_group_id AS year_group_id, @student_id AS student_id) AS source
        ON target.year_group_id = source.year_group_id AND target.student_id = source.student_id
        WHEN NOT MATCHED THEN
          INSERT (year_group_id, student_id, created_at)
          VALUES (@year_group_id, @student_id, SYSDATETIMEOFFSET());

        SELECT * FROM MB.year_group_students 
        WHERE year_group_id = @year_group_id AND student_id = @student_id;
      `;

      const result = await executeQuery<any>(query, {
        year_group_id: yearGroupId,
        student_id: studentId
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: (result.data && result.data[0]) || null, error: null };
    } catch (error: any) {
      return { data: null, error: error.message || 'Failed to upsert year group student relationship' };
    }
  }

  /**
   * Get students for a specific year group
   */
  async getStudentsForYearGroup(yearGroupId: number): Promise<Student[]> {
    const query = `
      SELECT s.*
      FROM MB.students s
      INNER JOIN MB.year_group_students ygs ON s.id = ygs.student_id
      WHERE ygs.year_group_id = @year_group_id
    `;

    const result = await executeQuery<Student>(query, { year_group_id: yearGroupId });
    if (result.error || !result.data) {
      return [];
    }
    return result.data;
  }

  /**
   * Upsert classes
   */
  async upsertClasses(classes: ClassRecord[], schoolId: number): Promise<{ data: ClassRecord[] | null; error: string | null }> {
    if (!classes || classes.length === 0) {
      return { data: [], error: null };
    }

    const results: ClassRecord[] = [];
    const errors: string[] = [];

    for (const classRecord of classes) {
      try {
        // Check if class exists
        const checkQuery = 'SELECT id FROM MB.classes WHERE id = @id';
        const checkResult = await executeQuery<{ id: number }>(checkQuery, { id: classRecord.id });

        if (checkResult.error) {
          errors.push(`Class ${classRecord.id}: ${checkResult.error}`);
          continue;
        }

        const existingClass = checkResult.data?.[0];

        if (existingClass) {
          // Update existing class
          const updateQuery = `
            UPDATE MB.classes
            SET
              school_id = @school_id,
              subject_id = @subject_id,
              name = @name,
              description = @description,
              uniq_id = @uniq_id,
              class_section = @class_section,
              language = @language,
              program_code = @program_code,
              grade_number = @grade_number,
              start_term_id = @start_term_id,
              end_term_id = @end_term_id,
              archived = @archived,
              lock_memberships = @lock_memberships,
              updated_at = SYSDATETIMEOFFSET()
            WHERE id = @id;

            SELECT * FROM MB.classes WHERE id = @id;
          `;

          const updateResult = await executeQuery<ClassRecord>(updateQuery, {
            id: classRecord.id,
            school_id: schoolId,
            subject_id: classRecord.subject_id || null,
            name: classRecord.name,
            description: classRecord.description || null,
            uniq_id: classRecord.uniq_id || null,
            class_section: classRecord.class_section || null,
            language: classRecord.language || 'en',
            program_code: classRecord.program_code,
            grade_number: classRecord.grade_number || null,
            start_term_id: classRecord.start_term_id || null,
            end_term_id: classRecord.end_term_id || null,
            archived: classRecord.archived || false,
            lock_memberships: classRecord.lock_memberships || null
          });

          if (updateResult.error) {
            errors.push(`Class ${classRecord.id}: ${updateResult.error}`);
          } else if (updateResult.data?.[0]) {
            results.push(updateResult.data[0]);
          }
        } else {
          // Insert new class with IDENTITY_INSERT
          const insertQuery = `
            SET IDENTITY_INSERT MB.classes ON;

            INSERT INTO MB.classes (
              id, school_id, subject_id, name, description, uniq_id, class_section,
              language, program_code, grade_number, start_term_id, end_term_id,
              archived, lock_memberships, created_at, updated_at
            ) VALUES (
              @id, @school_id, @subject_id, @name, @description, @uniq_id, @class_section,
              @language, @program_code, @grade_number, @start_term_id, @end_term_id,
              @archived, @lock_memberships, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
            );

            SET IDENTITY_INSERT MB.classes OFF;

            SELECT * FROM MB.classes WHERE id = @id;
          `;

          const insertResult = await executeQuery<ClassRecord>(insertQuery, {
            id: classRecord.id,
            school_id: schoolId,
            subject_id: classRecord.subject_id || null,
            name: classRecord.name,
            description: classRecord.description || null,
            uniq_id: classRecord.uniq_id || null,
            class_section: classRecord.class_section || null,
            language: classRecord.language || 'en',
            program_code: classRecord.program_code,
            grade_number: classRecord.grade_number || null,
            start_term_id: classRecord.start_term_id || null,
            end_term_id: classRecord.end_term_id || null,
            archived: classRecord.archived || false,
            lock_memberships: classRecord.lock_memberships || null
          });

          if (insertResult.error) {
            errors.push(`Class ${classRecord.id}: ${insertResult.error}`);
          } else if (insertResult.data?.[0]) {
            results.push(insertResult.data[0]);
          }
        }
      } catch (error: any) {
        errors.push(`Class ${classRecord.id}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Upsert class memberships
   */
  async upsertClassMemberships(memberships: ClassMembershipRecord[]): Promise<{ data: ClassMembershipRecord[] | null; error: string | null }> {
    if (!memberships || memberships.length === 0) {
      return { data: [], error: null };
    }

    const results: ClassMembershipRecord[] = [];
    const errors: string[] = [];

    for (const membership of memberships) {
      try {
        const query = `
          MERGE MB.class_memberships AS target
          USING (SELECT @class_id AS class_id, @user_id AS user_id, @role AS role) AS source
          ON target.class_id = source.class_id AND target.user_id = source.user_id AND target.role = source.role
          WHEN MATCHED THEN
            UPDATE SET
              level = @level,
              show_on_reports = @show_on_reports,
              first_joined_at = @first_joined_at,
              updated_at = SYSDATETIMEOFFSET()
          WHEN NOT MATCHED THEN
            INSERT (class_id, user_id, role, level, show_on_reports, first_joined_at, created_at, updated_at)
            VALUES (@class_id, @user_id, @role, @level, @show_on_reports, @first_joined_at, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());

          SELECT * FROM MB.class_memberships 
          WHERE class_id = @class_id AND user_id = @user_id AND role = @role;
        `;

        const result = await executeQuery<ClassMembershipRecord>(query, {
          class_id: membership.class_id,
          user_id: membership.user_id,
          role: membership.role,
          level: membership.level || null,
          show_on_reports: membership.show_on_reports !== undefined ? membership.show_on_reports : true,
          first_joined_at: membership.first_joined_at || null
        });

        if (result.error) {
          errors.push(`Membership class_id=${membership.class_id}, user_id=${membership.user_id}, role=${membership.role}: ${result.error}`);
        } else if (result.data?.[0]) {
          results.push(result.data[0]);
        }
      } catch (error: any) {
        errors.push(`Membership class_id=${membership.class_id}, user_id=${membership.user_id}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Upsert academic years for a program
   */
  async upsertAcademicYears(
    academicYears: AcademicYear[],
    schoolId: number,
    programCode: string
  ): Promise<{ data: AcademicYear[] | null; error: string | null }> {
    if (!academicYears || academicYears.length === 0) {
      return { data: [], error: null };
    }

    const results: AcademicYear[] = [];
    const errors: string[] = [];

    for (const year of academicYears) {
      try {
        const updateQuery = `
          UPDATE MB.academic_years
          SET 
            school_id = @school_id,
            program_code = @program_code,
            name = @name,
            starts_on = @starts_on,
            ends_on = @ends_on,
            updated_at = SYSDATETIMEOFFSET()
          WHERE id = @id;

          SELECT @@ROWCOUNT as rows_affected;
        `;

        const updateResult = await executeQuery<{ rows_affected: number }>(updateQuery, {
          id: year.id,
          school_id: schoolId,
          program_code: programCode,
          name: year.name,
          starts_on: year.starts_on,
          ends_on: year.ends_on
        });

        const rowsAffected = updateResult.data?.[0]?.rows_affected || 0;

        if (rowsAffected === 0) {
          const insertQuery = `
            SET IDENTITY_INSERT MB.academic_years ON;

            INSERT INTO MB.academic_years (
              id, school_id, program_code, name, starts_on, ends_on, created_at, updated_at
            ) VALUES (
              @id, @school_id, @program_code, @name, @starts_on, @ends_on, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
            );

            SET IDENTITY_INSERT MB.academic_years OFF;

            SELECT * FROM MB.academic_years WHERE id = @id;
          `;

          const insertResult = await executeQuery<AcademicYear>(insertQuery, {
            id: year.id,
            school_id: schoolId,
            program_code: programCode,
            name: year.name,
            starts_on: year.starts_on,
            ends_on: year.ends_on
          });

          if (insertResult.error) {
            errors.push(`Academic year ${year.id}: ${insertResult.error}`);
          } else if (insertResult.data?.[0]) {
            results.push(insertResult.data[0]);
          }
        } else {
          const selectResult = await executeQuery<AcademicYear>(
            'SELECT * FROM MB.academic_years WHERE id = @id',
            { id: year.id }
          );

          if (selectResult.error) {
            errors.push(`Academic year ${year.id}: ${selectResult.error}`);
          } else if (selectResult.data?.[0]) {
            results.push(selectResult.data[0]);
          }
        }
      } catch (error: any) {
        errors.push(`Academic year ${year.id}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Upsert academic terms for an academic year
   */
  async upsertAcademicTerms(
    terms: AcademicTermRecord[],
    academicYearId: number
  ): Promise<{ data: AcademicTermRecord[] | null; error: string | null }> {
    if (!terms || terms.length === 0) {
      return { data: [], error: null };
    }

    const results: AcademicTermRecord[] = [];
    const errors: string[] = [];

    for (const term of terms) {
      try {
        const updateQuery = `
          UPDATE MB.academic_terms
          SET 
            academic_year_id = @academic_year_id,
            name = @name,
            starts_on = @starts_on,
            ends_on = @ends_on,
            locked = @locked,
            exam_grade = @exam_grade,
            updated_at = SYSDATETIMEOFFSET()
          WHERE id = @id;

          SELECT @@ROWCOUNT as rows_affected;
        `;

        const updateResult = await executeQuery<{ rows_affected: number }>(updateQuery, {
          id: term.id,
          academic_year_id: academicYearId,
          name: term.name,
          starts_on: term.starts_on,
          ends_on: term.ends_on,
          locked: (term as any).locked ?? false,
          exam_grade: term.exam_grade || false
        });

        const rowsAffected = updateResult.data?.[0]?.rows_affected || 0;

        if (rowsAffected === 0) {
          const insertQuery = `
            SET IDENTITY_INSERT MB.academic_terms ON;

            INSERT INTO MB.academic_terms (
              id, academic_year_id, name, starts_on, ends_on, locked, exam_grade, created_at, updated_at
            ) VALUES (
              @id, @academic_year_id, @name, @starts_on, @ends_on, @locked, @exam_grade, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
            );

            SET IDENTITY_INSERT MB.academic_terms OFF;

            SELECT * FROM MB.academic_terms WHERE id = @id;
          `;

          const insertResult = await executeQuery<AcademicTermRecord>(insertQuery, {
            id: term.id,
            academic_year_id: academicYearId,
            name: term.name,
            starts_on: term.starts_on,
            ends_on: term.ends_on,
            locked: (term as any).locked ?? false,
            exam_grade: term.exam_grade || false
          });

          if (insertResult.error) {
            errors.push(`Academic term ${term.id}: ${insertResult.error}`);
          } else if (insertResult.data?.[0]) {
            results.push(insertResult.data[0]);
          }
        } else {
          const selectResult = await executeQuery<AcademicTermRecord>(
            'SELECT * FROM MB.academic_terms WHERE id = @id',
            { id: term.id }
          );

          if (selectResult.error) {
            errors.push(`Academic term ${term.id}: ${selectResult.error}`);
          } else if (selectResult.data?.[0]) {
            results.push(selectResult.data[0]);
          }
        }
      } catch (error: any) {
        errors.push(`Academic term ${term.id}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Get school by ID
   */
  async getSchool(schoolId: number): Promise<{ data: School | null; error: string | null }> {
    const query = 'SELECT * FROM MB.schools WHERE id = @schoolId';
    const result = await executeQuery<School>(query, { schoolId });

    if (result.error) {
      return { data: null, error: result.error };
    }

    return { data: (result.data && result.data[0]) || null, error: null };
  }

  /**
   * Upsert students
   */
  async upsertStudents(students: Student[]): Promise<{ data: Student[] | null; error: string | null }> {
    if (!students || students.length === 0) {
      return { data: [], error: null };
    }

    const results: Student[] = [];
    const errors: string[] = [];

    for (const student of students) {
      try {
        // First, try to update existing student
        const updateQuery = `
          UPDATE MB.students
          SET
            grade_id = @grade_id,
            year_group_id = @year_group_id,
            uniq_student_id = @uniq_student_id,
            first_name = @first_name,
            last_name = @last_name,
            email = @email,
            gender = @gender,
            birthday = @birthday,
            archived = @archived,
            program = @program,
            program_code = @program_code,
            class_grade = @class_grade,
            class_grade_number = @class_grade_number,
            graduating_year = @graduating_year,
            nationalities = @nationalities,
            languages = @languages,
            timezone = @timezone,
            ui_language = @ui_language,
            student_id = @student_id,
            identifier = @identifier,
            oa_id = @oa_id,
            withdrawn_on = @withdrawn_on,
            photo_url = @photo_url,
            homeroom_advisor_id = @homeroom_advisor_id,
            attendance_start_date = @attendance_start_date,
            parent_ids = @parent_ids,
            additional_homeroom_advisor_ids = @additional_homeroom_advisor_ids,
            updated_at = SYSDATETIMEOFFSET()
          WHERE id = @id;

          SELECT @@ROWCOUNT as rows_affected;
        `;

        const updateResult = await executeQuery<{ rows_affected: number }>(updateQuery, {
          id: student.id,
          grade_id: student.grade_id || null,
          year_group_id: student.year_group_id || null,
          uniq_student_id: student.uniq_student_id || null,
          first_name: student.first_name,
          last_name: student.last_name,
          email: student.email || null,
          gender: student.gender || null,
          birthday: student.birthday || null,
          archived: student.archived || false,
          program: student.program || null,
          program_code: student.program_code || null,
          class_grade: student.class_grade || null,
          class_grade_number: student.class_grade_number || null,
          graduating_year: student.graduating_year || null,
          nationalities: student.nationalities || '[]',
          languages: student.languages || '[]',
          timezone: student.timezone || null,
          ui_language: student.ui_language || null,
          student_id: student.student_id || null,
          identifier: student.identifier || null,
          oa_id: student.oa_id || null,
          withdrawn_on: student.withdrawn_on || null,
          photo_url: student.photo_url || null,
          homeroom_advisor_id: student.homeroom_advisor_id || null,
          attendance_start_date: student.attendance_start_date || null,
          parent_ids: student.parent_ids || '[]',
          additional_homeroom_advisor_ids: student.additional_homeroom_advisor_ids || '[]'
        });

        const rowsAffected = updateResult.data?.[0]?.rows_affected || 0;

        if (rowsAffected === 0) {
          // Student doesn't exist, insert with IDENTITY_INSERT
          const insertQuery = `
            SET IDENTITY_INSERT MB.students ON;

            INSERT INTO MB.students (
              id, grade_id, year_group_id, uniq_student_id, first_name, last_name,
              email, gender, birthday, archived, program, program_code,
              class_grade, class_grade_number, graduating_year, nationalities,
              languages, timezone, ui_language, student_id, identifier, oa_id,
              withdrawn_on, photo_url, homeroom_advisor_id, attendance_start_date,
              parent_ids, additional_homeroom_advisor_ids, created_at, updated_at
            ) VALUES (
              @id, @grade_id, @year_group_id, @uniq_student_id, @first_name, @last_name,
              @email, @gender, @birthday, @archived, @program, @program_code,
              @class_grade, @class_grade_number, @graduating_year, @nationalities,
              @languages, @timezone, @ui_language, @student_id, @identifier, @oa_id,
              @withdrawn_on, @photo_url, @homeroom_advisor_id, @attendance_start_date,
              @parent_ids, @additional_homeroom_advisor_ids,
              SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
            );

            SET IDENTITY_INSERT MB.students OFF;

            SELECT * FROM MB.students WHERE id = @id;
          `;

          const insertResult = await executeQuery<Student>(insertQuery, {
            id: student.id,
            grade_id: student.grade_id || null,
            year_group_id: student.year_group_id || null,
            uniq_student_id: student.uniq_student_id || null,
            first_name: student.first_name,
            last_name: student.last_name,
            email: student.email || null,
            gender: student.gender || null,
            birthday: student.birthday || null,
            archived: student.archived || false,
            program: student.program || null,
            program_code: student.program_code || null,
            class_grade: student.class_grade || null,
            class_grade_number: student.class_grade_number || null,
            graduating_year: student.graduating_year || null,
            nationalities: student.nationalities || '[]',
            languages: student.languages || '[]',
            timezone: student.timezone || null,
            ui_language: student.ui_language || null,
            student_id: student.student_id || null,
            identifier: student.identifier || null,
            oa_id: student.oa_id || null,
            withdrawn_on: student.withdrawn_on || null,
            photo_url: student.photo_url || null,
            homeroom_advisor_id: student.homeroom_advisor_id || null,
            attendance_start_date: student.attendance_start_date || null,
            parent_ids: student.parent_ids || '[]',
            additional_homeroom_advisor_ids: student.additional_homeroom_advisor_ids || '[]'
          });

          if (insertResult.error) {
            errors.push(`Student ${student.id}: ${insertResult.error}`);
          } else if (insertResult.data?.[0]) {
            results.push(insertResult.data[0]);
          }
        } else {
          // Update was successful, fetch the updated record
          const selectQuery = 'SELECT * FROM MB.students WHERE id = @id';
          const selectResult = await executeQuery<Student>(selectQuery, { id: student.id });

          if (selectResult.error) {
            errors.push(`Student ${student.id}: ${selectResult.error}`);
          } else if (selectResult.data?.[0]) {
            results.push(selectResult.data[0]);
          }
        }
      } catch (error: any) {
        errors.push(`Student ${student.id}: ${error.message || error}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Get students by school ID
   */
  async getStudents(schoolId?: number, filters?: {
    archived?: boolean;
    grade_id?: number;
    year_group_id?: number;
  }): Promise<{ data: Student[] | null; error: string | null }> {
    let query = 'SELECT * FROM MB.students WHERE 1=1';
    const params: Record<string, any> = {};

    if (filters?.archived !== undefined) {
      query += ' AND archived = @archived';
      params.archived = filters.archived;
    }

    if (filters?.grade_id) {
      query += ' AND grade_id = @grade_id';
      params.grade_id = filters.grade_id;
    }

    if (filters?.year_group_id) {
      query += ' AND year_group_id = @year_group_id';
      params.year_group_id = filters.year_group_id;
    }

    query += ' ORDER BY last_name, first_name';

    const result = await executeQuery<Student>(query, params);

    if (result.error) {
      return { data: null, error: result.error };
    }

    return { data: result.data, error: null };
  }

  /**
   * Upsert term grades
   */
  async upsertTermGrades(termGrades: TermGrade[]): Promise<{ data: TermGrade[] | null; error: string | null }> {
    if (!termGrades || termGrades.length === 0) {
      return { data: [], error: null };
    }

    // Filter out entries where both grade and average_percent are null
    // Only save entries where at least one of them has a value
    const validTermGrades = termGrades.filter(tg => 
      (tg.grade != null) || (tg.average_percent != null)
    );

    if (validTermGrades.length === 0) {
      return { data: [], error: null };
    }

    const results: TermGrade[] = [];
    const errors: string[] = [];

    for (const termGrade of validTermGrades) {
      // First, try to get existing term_grade_id
      const checkQuery = `
        SELECT id, student_id, class_id, term_id, grade, average_percent, comments, created_at, updated_at
        FROM MB.term_grades 
        WHERE student_id = @student_id 
          AND class_id = @class_id 
          AND term_id = @term_id;
      `;
      
      const checkResult = await executeQuery<TermGrade>(checkQuery, {
        student_id: termGrade.student_id,
        class_id: termGrade.class_id,
        term_id: termGrade.term_id
      });

      let termGradeId: number | undefined;
      if (checkResult.data && checkResult.data[0]) {
        termGradeId = checkResult.data[0].id;
      }

      // Now do the MERGE
      const mergeQuery = `
        MERGE MB.term_grades AS target
        USING (SELECT @student_id AS student_id, @class_id AS class_id,
                     @term_id AS term_id, @grade AS grade,
                     @average_percent AS average_percent, @comments AS comments) AS source
        ON target.student_id = source.student_id 
           AND target.class_id = source.class_id 
           AND target.term_id = source.term_id
        WHEN MATCHED THEN
          UPDATE SET
            grade = source.grade,
            average_percent = source.average_percent,
            comments = source.comments,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (student_id, class_id, term_id, grade, average_percent, comments, created_at, updated_at)
          VALUES (source.student_id, source.class_id, source.term_id, source.grade,
                  source.average_percent, source.comments,
                  SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `;

      await executeQuery(mergeQuery, {
        student_id: termGrade.student_id,
        class_id: termGrade.class_id,
        term_id: termGrade.term_id,
        grade: termGrade.grade || null,
        average_percent: termGrade.average_percent || null,
        comments: termGrade.comments || null
      });

      // Get the final result with id
      const finalResult = await executeQuery<TermGrade>(checkQuery, {
        student_id: termGrade.student_id,
        class_id: termGrade.class_id,
        term_id: termGrade.term_id
      });

      if (finalResult.error) {
        errors.push(`TermGrade ${termGrade.student_id}-${termGrade.class_id}-${termGrade.term_id}: ${finalResult.error}`);
      } else if (finalResult.data && finalResult.data[0]) {
        const savedTermGrade = finalResult.data[0];
        // Ensure id is present
        if (!savedTermGrade.id) {
          console.warn(`⚠️ Term grade missing id after save: student ${savedTermGrade.student_id}, class ${savedTermGrade.class_id}, term ${savedTermGrade.term_id}`);
        }
        results.push(savedTermGrade);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Upsert term grade rubrics
   */
  async upsertTermGradeRubrics(rubrics: TermGradeRubric[]): Promise<{ data: TermGradeRubric[] | null; error: string | null }> {
    if (!rubrics || rubrics.length === 0) {
      return { data: [], error: null };
    }

    const results: TermGradeRubric[] = [];
    const errors: string[] = [];

    for (const rubric of rubrics) {
      const query = `
        MERGE MB.term_grade_rubrics AS target
        USING (SELECT @term_grade_id AS term_grade_id, @rubric_id AS rubric_id,
                     @title AS title, @grade AS grade) AS source
        ON target.term_grade_id = source.term_grade_id 
           AND target.rubric_id = source.rubric_id
        WHEN MATCHED THEN
          UPDATE SET
            title = source.title,
            grade = source.grade,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (term_grade_id, rubric_id, title, grade, created_at, updated_at)
          VALUES (source.term_grade_id, source.rubric_id, source.title, source.grade,
                  SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        
        SELECT * FROM MB.term_grade_rubrics 
        WHERE term_grade_id = @term_grade_id 
          AND rubric_id = @rubric_id;
      `;

      const result = await executeQuery<TermGradeRubric>(query, {
        term_grade_id: rubric.term_grade_id,
        rubric_id: rubric.rubric_id,
        title: rubric.title,
        grade: rubric.grade || null
      });

      if (result.error) {
        errors.push(`TermGradeRubric ${rubric.term_grade_id}-${rubric.rubric_id}: ${result.error}`);
      } else if (result.data?.[0]) {
        results.push(result.data[0]);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return { data: null, error: errors.join('; ') };
    }

    return { data: results, error: errors.length > 0 ? errors.join('; ') : null };
  }

  /**
   * Get analytics data - student metrics
   */
  async getStudentMetrics(): Promise<{
    totalStudents: number;
    averageGrade: number;
    attendanceRate: number;
  }> {
    const totalStudentsQuery = `
      SELECT COUNT(*) as count 
      FROM MB.students 
      WHERE archived = 0
    `;

    const averageGradeQuery = `
      SELECT AVG(CAST(average_percent AS FLOAT)) as avg_grade
      FROM MB.term_grades
      WHERE average_percent IS NOT NULL
    `;

    const attendanceQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('present', 'Present') THEN 1 ELSE 0 END) as present
      FROM MB.class_attendance
    `;

    const [studentsResult, gradesResult, attendanceResult] = await Promise.all([
      executeQuery<{ count: number }>(totalStudentsQuery),
      executeQuery<{ avg_grade: number }>(averageGradeQuery),
      executeQuery<{ total: number; present: number }>(attendanceQuery)
    ]);

    const totalStudents = studentsResult.data?.[0]?.count || 0;
    const averageGrade = gradesResult.data?.[0]?.avg_grade || 0;
    const totalAttendance = attendanceResult.data?.[0]?.total || 0;
    const presentAttendance = attendanceResult.data?.[0]?.present || 0;
    const attendanceRate = totalAttendance > 0 ? (presentAttendance / totalAttendance) * 100 : 0;

    return {
      totalStudents,
      averageGrade: Math.round(averageGrade * 10) / 10,
      attendanceRate: Math.round(attendanceRate * 10) / 10
    };
  }

  /**
   * Get subject performance data
   */
  async getSubjectPerformance(): Promise<Array<{
    subject: string;
    averageGrade: number;
    studentCount: number;
  }>> {
    const query = `
      SELECT 
        s.name as subject,
        AVG(CAST(tg.average_percent AS FLOAT)) as average_grade,
        COUNT(DISTINCT tg.student_id) as student_count
      FROM MB.term_grades tg
      INNER JOIN MB.classes c ON tg.class_id = c.id
      INNER JOIN MB.subjects s ON c.subject_id = s.id
      WHERE tg.average_percent IS NOT NULL
      GROUP BY s.name
      ORDER BY average_grade DESC
    `;

    const result = await executeQuery<{
      subject: string;
      average_grade: number;
      student_count: number;
    }>(query);

    if (result.error || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      subject: row.subject,
      averageGrade: Math.round((row.average_grade || 0) * 10) / 10,
      studentCount: row.student_count || 0
    }));
  }

  /**
   * Get student vs class average data
   */
  async getStudentVsClassAverage(): Promise<Array<{
    subject: string;
    grade: string;
    classId: number;
    students: Array<{
      studentId: number;
      studentName: string;
      studentScore: number;
      classAverage: number;
      difference: number;
    }>;
  }>> {
    const query = `
      SELECT 
        tg.student_id,
        tg.class_id,
        tg.average_percent,
        s.first_name,
        s.last_name,
        s.class_grade,
        s.class_grade_number,
        subj.name as subject_name
      FROM MB.term_grades tg
      INNER JOIN MB.students s ON tg.student_id = s.id
      INNER JOIN MB.classes c ON tg.class_id = c.id
      INNER JOIN MB.subjects subj ON c.subject_id = subj.id
      WHERE tg.average_percent IS NOT NULL
        AND s.first_name IS NOT NULL
        AND s.last_name IS NOT NULL
      ORDER BY tg.class_id, s.last_name, s.first_name
    `;

    const result = await executeQuery<{
      student_id: number;
      class_id: number;
      average_percent: number;
      first_name: string;
      last_name: string;
      class_grade: string;
      class_grade_number: number;
      subject_name: string;
    }>(query);

    if (result.error || !result.data) {
      return [];
    }

    // Group by class and calculate averages
    const classMap = new Map<number, {
      subject: string;
      grade: string;
      classId: number;
      students: Array<{
        studentId: number;
        studentName: string;
        studentScore: number;
      }>;
    }>();

    result.data.forEach(row => {
      if (!classMap.has(row.class_id)) {
        classMap.set(row.class_id, {
          subject: row.subject_name,
          grade: row.class_grade || `Grade ${row.class_grade_number || 'Unknown'}`,
          classId: row.class_id,
          students: []
        });
      }

      const classData = classMap.get(row.class_id)!;
      classData.students.push({
        studentId: row.student_id,
        studentName: `${row.first_name} ${row.last_name}`.trim(),
        studentScore: row.average_percent || 0
      });
    });

    // Calculate class averages and differences
    const output: Array<{
      subject: string;
      grade: string;
      classId: number;
      students: Array<{
        studentId: number;
        studentName: string;
        studentScore: number;
        classAverage: number;
        difference: number;
      }>;
    }> = [];

    classMap.forEach((classData) => {
      if (classData.students.length < 2) return; // Skip classes with only one student

      const totalScore = classData.students.reduce((sum, s) => sum + s.studentScore, 0);
      const classAverage = totalScore / classData.students.length;

      const studentsWithDifference = classData.students.map(student => ({
        ...student,
        classAverage: Math.round(classAverage * 10) / 10,
        difference: Math.round((student.studentScore - classAverage) * 10) / 10
      }));

      output.push({
        ...classData,
        students: studentsWithDifference
      });
    });

    return output.sort((a, b) => a.subject.localeCompare(b.subject));
  }

  /**
   * Get performance data by program
   */
  async getPerformanceByProgram(): Promise<Array<{
    program: string;
    averageGrade: number;
    studentCount: number;
  }>> {
    const query = `
      SELECT 
        COALESCE(s.program_code, c.program_code, 'Unknown') as program,
        AVG(CAST(tg.average_percent AS FLOAT)) as average_grade,
        COUNT(DISTINCT tg.student_id) as student_count
      FROM MB.term_grades tg
      INNER JOIN MB.students s ON tg.student_id = s.id
      INNER JOIN MB.classes c ON tg.class_id = c.id
      WHERE tg.average_percent IS NOT NULL
      GROUP BY COALESCE(s.program_code, c.program_code, 'Unknown')
      ORDER BY average_grade DESC
    `;

    const result = await executeQuery<{
      program: string;
      average_grade: number;
      student_count: number;
    }>(query);

    if (result.error || !result.data) {
      return [];
    }

    return result.data.map(row => ({
      program: row.program,
      averageGrade: Math.round((row.average_grade || 0) * 10) / 10,
      studentCount: row.student_count || 0
    }));
  }

  /**
   * Get attendance data by grade level
   */
  async getAttendanceByGrade(): Promise<Array<{
    grade: string;
    attendanceRate: number;
    studentCount: number;
  }>> {
    const query = `
      SELECT 
        COALESCE(s.class_grade, CONCAT('Grade ', s.class_grade_number), 'Unknown') as grade,
        COUNT(*) as total_records,
        SUM(CASE WHEN ca.status IN ('present', 'Present') THEN 1 ELSE 0 END) as present_records,
        COUNT(DISTINCT ca.student_id) as student_count
      FROM MB.class_attendance ca
      INNER JOIN MB.students s ON ca.student_id = s.id
      GROUP BY COALESCE(s.class_grade, CONCAT('Grade ', s.class_grade_number), 'Unknown')
      ORDER BY grade
    `;

    const result = await executeQuery<{
      grade: string;
      total_records: number;
      present_records: number;
      student_count: number;
    }>(query);

    if (result.error || !result.data) {
      return [];
    }

    return result.data.map(row => {
      const attendanceRate = row.total_records > 0 
        ? (row.present_records / row.total_records) * 100 
        : 0;
      
      return {
        grade: row.grade,
        attendanceRate: Math.round(attendanceRate * 10) / 10,
        studentCount: row.student_count || 0
      };
    });
  }

  /**
   * Get student demographics by nationality
   */
  async getStudentDemographics(): Promise<Array<{
    nationality: string;
    studentCount: number;
  }>> {
    const query = `
      SELECT 
        nationalities
      FROM MB.students
      WHERE archived = 0
        AND nationalities IS NOT NULL
        AND nationalities != '[]'
    `;

    const result = await executeQuery<{ nationalities: string }>(query);

    if (result.error || !result.data) {
      return [];
    }

    // Parse JSON nationalities and count
    const nationalityMap = new Map<string, number>();

    result.data.forEach(row => {
      try {
        const nationalities = JSON.parse(row.nationalities || '[]');
        if (Array.isArray(nationalities)) {
          nationalities.forEach((nationality: string) => {
            nationalityMap.set(nationality, (nationalityMap.get(nationality) || 0) + 1);
          });
        }
      } catch (error) {
        // Skip invalid JSON
        console.warn('Invalid nationalities JSON:', row.nationalities);
      }
    });

    return Array.from(nationalityMap.entries())
      .map(([nationality, count]) => ({ nationality, studentCount: count }))
      .sort((a, b) => b.studentCount - a.studentCount)
      .slice(0, 10); // Top 10 nationalities
  }

  /**
   * Get performance trends over time
   */
  async getPerformanceTrends(): Promise<Array<{
    term: string;
    allStudents: number;
    financialAidRecipients: number;
  }>> {
    const query = `
      SELECT 
        COALESCE(at.name, CONCAT('Term ', tg.term_id)) as term_name,
        AVG(CAST(tg.average_percent AS FLOAT)) as avg_grade,
        COUNT(DISTINCT tg.student_id) as student_count
      FROM MB.term_grades tg
      LEFT JOIN MB.academic_terms at ON tg.term_id = at.id
      WHERE tg.average_percent IS NOT NULL
      GROUP BY tg.term_id, at.id, at.name, at.starts_on
      ORDER BY COALESCE(at.starts_on, '1900-01-01') ASC
    `;

    const result = await executeQuery<{
      term_name: string;
      avg_grade: number;
      student_count: number;
    }>(query);

    if (result.error || !result.data) {
      return [];
    }

    // For now, we'll use a placeholder for financial aid recipients
    // This would need to be determined from actual financial aid data if available
    return result.data.map(row => ({
      term: row.term_name,
      allStudents: Math.round((row.avg_grade || 0) * 10) / 10,
      financialAidRecipients: Math.round((row.avg_grade || 0) * 0.7 * 10) / 10 // Placeholder: 70% of average
    }));
  }

  /**
   * Get financial aid distribution
   */
  async getFinancialAidDistribution(): Promise<{
    receivingAid: number;
    noAid: number;
  }> {
    const query = `
      SELECT COUNT(*) as total_students
      FROM MB.students
      WHERE archived = 0
    `;

    const result = await executeQuery<{ total_students: number }>(query);

    if (result.error || !result.data || !result.data[0]) {
      return { receivingAid: 0, noAid: 0 };
    }

    const totalStudents = result.data[0].total_students || 0;
    
    // Try to get actual financial aid data if table exists
    let receivingAid = 0;
    try {
      const financialAidQuery = `
        SELECT COUNT(DISTINCT student_id) as aid_recipients
        FROM MB.student_financial_aid
      `;
      const aidResult = await executeQuery<{ aid_recipients: number }>(financialAidQuery);
      receivingAid = aidResult.data?.[0]?.aid_recipients || 0;
    } catch (error) {
      // Table might not exist or have data, use placeholder
      console.log('Financial aid table not available, using placeholder');
      receivingAid = Math.floor(totalStudents * 0.23); // 23% placeholder
    }
    
    const noAid = totalStudents - receivingAid;

    return {
      receivingAid,
      noAid
    };
  }

  // =============================================
  // NEXQUARE (NEX) SCHEMA METHODS
  // =============================================

  /**
   * Upsert school data in NEX schema
   */
  async upsertNexquareSchool(school: {
    sourced_id: string;
    name: string;
    identifier?: string | null;
    status?: string | null;
    type?: string | null;
    date_last_modified?: Date | string | null;
    metadata?: string | null; // JSON string
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.schools AS target
        USING (SELECT @sourced_id AS sourced_id) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            name = @name,
            identifier = @identifier,
            status = @status,
            type = @type,
            date_last_modified = @date_last_modified,
            metadata = @metadata,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (sourced_id, name, identifier, status, type, date_last_modified, metadata, created_at, updated_at)
          VALUES (@sourced_id, @name, @identifier, @status, @type, @date_last_modified, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        
        SELECT * FROM NEX.schools WHERE sourced_id = @sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        sourced_id: school.sourced_id,
        name: school.name,
        identifier: school.identifier || null,
        status: school.status || null,
        type: school.type || null,
        date_last_modified: school.date_last_modified ? new Date(school.date_last_modified) : null,
        metadata: school.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare school:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Get Nexquare school by sourced_id
   */
  async getNexquareSchool(sourcedId: string): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        SELECT * FROM NEX.schools WHERE sourced_id = @sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        sourced_id: sourcedId,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error getting Nexquare school:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert student data in NEX schema
   */
  async upsertNexquareStudent(student: {
    school_id?: string | null;
    sourced_id: string;
    identifier?: string | null;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    username?: string | null;
    user_type?: string | null;
    status?: string | null;
    date_last_modified?: Date | string | null;
    academic_year?: string | null;
    metadata?: string | null;
    // Academic/Class Information
    current_grade?: string | null;
    current_class?: string | null;
    current_class_id?: number | null;
    grades?: string | null; // JSON array
    // Contact Information
    phone?: string | null;
    mobile_number?: string | null;
    sms?: string | null;
    // Demographics
    gender?: string | null;
    student_dob?: Date | string | null;
    religion?: string | null;
    // Important Dates
    admission_date?: Date | string | null;
    join_date?: Date | string | null;
    // Guardian/Parent Information
    parent_name?: string | null;
    guardian_one_full_name?: string | null;
    guardian_two_full_name?: string | null;
    guardian_one_mobile?: string | null;
    guardian_two_mobile?: string | null;
    primary_contact?: string | null;
    // Additional Identifiers
    student_reg_id?: string | null;
    family_code?: string | null;
    student_national_id?: string | null;
    // Status
    student_status?: string | null;
    // Class Details
    class_grade?: string | null;
    class_section?: string | null;
    homeroom_teacher_sourced_id?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.students AS target
        USING (SELECT @sourced_id AS sourced_id) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            school_id = @school_id,
            identifier = @identifier,
            full_name = @full_name,
            first_name = @first_name,
            last_name = @last_name,
            email = @email,
            username = @username,
            user_type = @user_type,
            status = @status,
            date_last_modified = @date_last_modified,
            academic_year = @academic_year,
            metadata = @metadata,
            current_grade = @current_grade,
            current_class = @current_class,
            current_class_id = @current_class_id,
            grades = @grades,
            phone = @phone,
            mobile_number = @mobile_number,
            sms = @sms,
            gender = @gender,
            student_dob = @student_dob,
            religion = @religion,
            admission_date = @admission_date,
            join_date = @join_date,
            parent_name = @parent_name,
            guardian_one_full_name = @guardian_one_full_name,
            guardian_two_full_name = @guardian_two_full_name,
            guardian_one_mobile = @guardian_one_mobile,
            guardian_two_mobile = @guardian_two_mobile,
            primary_contact = @primary_contact,
            student_reg_id = @student_reg_id,
            family_code = @family_code,
            student_national_id = @student_national_id,
            student_status = @student_status,
            class_grade = @class_grade,
            class_section = @class_section,
            homeroom_teacher_sourced_id = @homeroom_teacher_sourced_id,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (
            school_id, sourced_id, identifier, full_name, first_name, last_name, email, username, 
            user_type, status, date_last_modified, academic_year, metadata,
            current_grade, current_class, current_class_id, grades,
            phone, mobile_number, sms,
            gender, student_dob, religion,
            admission_date, join_date,
            parent_name, guardian_one_full_name, guardian_two_full_name,
            guardian_one_mobile, guardian_two_mobile, primary_contact,
            student_reg_id, family_code, student_national_id,
            student_status, class_grade, class_section, homeroom_teacher_sourced_id,
            created_at, updated_at
          )
          VALUES (
            @school_id, @sourced_id, @identifier, @full_name, @first_name, @last_name, @email, @username,
            @user_type, @status, @date_last_modified, @academic_year, @metadata,
            @current_grade, @current_class, @current_class_id, @grades,
            @phone, @mobile_number, @sms,
            @gender, @student_dob, @religion,
            @admission_date, @join_date,
            @parent_name, @guardian_one_full_name, @guardian_two_full_name,
            @guardian_one_mobile, @guardian_two_mobile, @primary_contact,
            @student_reg_id, @family_code, @student_national_id,
            @student_status, @class_grade, @class_section, @homeroom_teacher_sourced_id,
            SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
          );
        
        SELECT * FROM NEX.students WHERE sourced_id = @sourced_id;
      `;

      // Helper function to parse date strings
      const parseDate = (dateStr: string | Date | null | undefined): Date | null => {
        if (!dateStr) return null;
        if (dateStr instanceof Date) return dateStr;
        try {
          return new Date(dateStr);
        } catch {
          return null;
        }
      };

      const result = await executeQuery<any>(query, {
        school_id: student.school_id || null,
        sourced_id: student.sourced_id,
        identifier: student.identifier || null,
        full_name: student.full_name || null,
        first_name: student.first_name || null,
        last_name: student.last_name || null,
        email: student.email || null,
        username: student.username || null,
        user_type: student.user_type || null,
        status: student.status || null,
        date_last_modified: parseDate(student.date_last_modified),
        academic_year: student.academic_year || null,
        metadata: student.metadata || null,
        current_grade: student.current_grade || null,
        current_class: student.current_class || null,
        current_class_id: student.current_class_id || null,
        grades: student.grades || null,
        phone: student.phone || null,
        mobile_number: student.mobile_number || null,
        sms: student.sms || null,
        gender: student.gender || null,
        student_dob: parseDate(student.student_dob),
        religion: student.religion || null,
        admission_date: parseDate(student.admission_date),
        join_date: parseDate(student.join_date),
        parent_name: student.parent_name || null,
        guardian_one_full_name: student.guardian_one_full_name || null,
        guardian_two_full_name: student.guardian_two_full_name || null,
        guardian_one_mobile: student.guardian_one_mobile || null,
        guardian_two_mobile: student.guardian_two_mobile || null,
        primary_contact: student.primary_contact || null,
        student_reg_id: student.student_reg_id || null,
        family_code: student.family_code || null,
        student_national_id: student.student_national_id || null,
        student_status: student.student_status || null,
        class_grade: student.class_grade || null,
        class_section: student.class_section || null,
        homeroom_teacher_sourced_id: student.homeroom_teacher_sourced_id || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare student:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert staff data in NEX schema
   */
  async upsertNexquareStaff(staff: {
    school_id?: string | null;
    sourced_id: string;
    identifier?: string | null;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    username?: string | null;
    user_type?: string | null;
    role?: string | null;
    status?: string | null;
    date_last_modified?: Date | string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.staff AS target
        USING (SELECT @sourced_id AS sourced_id) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            school_id = @school_id,
            identifier = @identifier,
            full_name = @full_name,
            first_name = @first_name,
            last_name = @last_name,
            email = @email,
            username = @username,
            user_type = @user_type,
            role = @role,
            status = @status,
            date_last_modified = @date_last_modified,
            metadata = @metadata,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (school_id, sourced_id, identifier, full_name, first_name, last_name, email, username, user_type, role, status, date_last_modified, metadata, created_at, updated_at)
          VALUES (@school_id, @sourced_id, @identifier, @full_name, @first_name, @last_name, @email, @username, @user_type, @role, @status, @date_last_modified, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        
        SELECT * FROM NEX.staff WHERE sourced_id = @sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        school_id: staff.school_id || null,
        sourced_id: staff.sourced_id,
        identifier: staff.identifier || null,
        full_name: staff.full_name || null,
        first_name: staff.first_name || null,
        last_name: staff.last_name || null,
        email: staff.email || null,
        username: staff.username || null,
        user_type: staff.user_type || null,
        role: staff.role || null,
        status: staff.status || null,
        date_last_modified: staff.date_last_modified ? new Date(staff.date_last_modified) : null,
        metadata: staff.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare staff:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert class data in NEX schema
   */
  async upsertNexquareClass(classData: {
    school_id?: string | null;
    sourced_id: string;
    title?: string | null;
    class_name?: string | null;
    grade_name?: string | null;
    course_code?: string | null;
    status?: string | null;
    date_last_modified?: Date | string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.classes AS target
        USING (SELECT @sourced_id AS sourced_id) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            school_id = @school_id,
            title = @title,
            class_name = @class_name,
            grade_name = @grade_name,
            course_code = @course_code,
            status = @status,
            date_last_modified = @date_last_modified,
            metadata = @metadata,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (school_id, sourced_id, title, class_name, grade_name, course_code, status, date_last_modified, metadata, created_at, updated_at)
          VALUES (@school_id, @sourced_id, @title, @class_name, @grade_name, @course_code, @status, @date_last_modified, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        
        SELECT * FROM NEX.classes WHERE sourced_id = @sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        school_id: classData.school_id || null,
        sourced_id: classData.sourced_id,
        title: classData.title || null,
        class_name: classData.class_name || null,
        grade_name: classData.grade_name || null,
        course_code: classData.course_code || null,
        status: classData.status || null,
        date_last_modified: classData.date_last_modified ? new Date(classData.date_last_modified) : null,
        metadata: classData.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare class:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert allocation master data in NEX schema
   */
  async upsertNexquareAllocationMaster(allocation: {
    school_id?: string | null;
    sourced_id?: string | null;
    allocation_type?: string | null;
    entity_type?: string | null;
    entity_sourced_id?: string | null;
    entity_name?: string | null;
    status?: string | null;
    date_last_modified?: Date | string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        INSERT INTO NEX.allocation_master 
        (school_id, sourced_id, allocation_type, entity_type, entity_sourced_id, entity_name, status, date_last_modified, metadata, created_at, updated_at)
        VALUES (@school_id, @sourced_id, @allocation_type, @entity_type, @entity_sourced_id, @entity_name, @status, @date_last_modified, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `;

      const result = await executeQuery<any>(query, {
        school_id: allocation.school_id || null,
        sourced_id: allocation.sourced_id || null,
        allocation_type: allocation.allocation_type || null,
        entity_type: allocation.entity_type || null,
        entity_sourced_id: allocation.entity_sourced_id || null,
        entity_name: allocation.entity_name || null,
        status: allocation.status || null,
        date_last_modified: allocation.date_last_modified ? new Date(allocation.date_last_modified) : null,
        metadata: allocation.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare allocation master:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert subject data in NEX schema
   */
  async upsertNexquareSubject(subject: {
    school_id?: string | null;
    sourced_id: string;
    subject_id?: number | null;
    subject_name: string;
    status?: string | null;
    date_last_modified?: Date | string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.subjects AS target
        USING (SELECT @sourced_id AS sourced_id) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            school_id = @school_id,
            subject_id = @subject_id,
            subject_name = @subject_name,
            status = @status,
            date_last_modified = @date_last_modified,
            metadata = @metadata,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (school_id, sourced_id, subject_id, subject_name, status, date_last_modified, metadata, created_at, updated_at)
          VALUES (@school_id, @sourced_id, @subject_id, @subject_name, @status, @date_last_modified, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        
        SELECT * FROM NEX.subjects WHERE sourced_id = @sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        school_id: subject.school_id || null,
        sourced_id: subject.sourced_id,
        subject_id: subject.subject_id || null,
        subject_name: subject.subject_name,
        status: subject.status || null,
        date_last_modified: subject.date_last_modified ? new Date(subject.date_last_modified) : null,
        metadata: subject.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare subject:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert cohort data in NEX schema
   */
  async upsertNexquareCohort(cohort: {
    school_id?: string | null;
    sourced_id: string;
    cohort_id?: number | null;
    cohort_name: string;
    status?: string | null;
    date_last_modified?: Date | string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.cohorts AS target
        USING (SELECT @sourced_id AS sourced_id) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            school_id = @school_id,
            cohort_id = @cohort_id,
            cohort_name = @cohort_name,
            status = @status,
            date_last_modified = @date_last_modified,
            metadata = @metadata,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (school_id, sourced_id, cohort_id, cohort_name, status, date_last_modified, metadata, created_at, updated_at)
          VALUES (@school_id, @sourced_id, @cohort_id, @cohort_name, @status, @date_last_modified, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        
        SELECT * FROM NEX.cohorts WHERE sourced_id = @sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        school_id: cohort.school_id || null,
        sourced_id: cohort.sourced_id,
        cohort_id: cohort.cohort_id || null,
        cohort_name: cohort.cohort_name,
        status: cohort.status || null,
        date_last_modified: cohort.date_last_modified ? new Date(cohort.date_last_modified) : null,
        metadata: cohort.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare cohort:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert group data in NEX schema
   */
  async upsertNexquareGroup(group: {
    school_id?: string | null;
    sourced_id: string;
    group_name: string;
    unique_key?: string | null;
    status?: string | null;
    date_last_modified?: Date | string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.groups AS target
        USING (SELECT @sourced_id AS sourced_id) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            school_id = @school_id,
            group_name = @group_name,
            unique_key = @unique_key,
            status = @status,
            date_last_modified = @date_last_modified,
            metadata = @metadata,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (school_id, sourced_id, group_name, unique_key, status, date_last_modified, metadata, created_at, updated_at)
          VALUES (@school_id, @sourced_id, @group_name, @unique_key, @status, @date_last_modified, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        
        SELECT * FROM NEX.groups WHERE sourced_id = @sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        school_id: group.school_id || null,
        sourced_id: group.sourced_id,
        group_name: group.group_name,
        unique_key: group.unique_key || null,
        status: group.status || null,
        date_last_modified: group.date_last_modified ? new Date(group.date_last_modified) : null,
        metadata: group.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare group:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert homeroom data in NEX schema
   */
  async upsertNexquareHomeroom(homeroom: {
    school_id?: string | null;
    sourced_id: string;
    class_name?: string | null;
    grade_name?: string | null;
    status?: string | null;
    date_last_modified?: Date | string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.homerooms AS target
        USING (SELECT @sourced_id AS sourced_id) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            school_id = @school_id,
            class_name = @class_name,
            grade_name = @grade_name,
            status = @status,
            date_last_modified = @date_last_modified,
            metadata = @metadata,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (school_id, sourced_id, class_name, grade_name, status, date_last_modified, metadata, created_at, updated_at)
          VALUES (@school_id, @sourced_id, @class_name, @grade_name, @status, @date_last_modified, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
        
        SELECT * FROM NEX.homerooms WHERE sourced_id = @sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        school_id: homeroom.school_id || null,
        sourced_id: homeroom.sourced_id,
        class_name: homeroom.class_name || null,
        grade_name: homeroom.grade_name || null,
        status: homeroom.status || null,
        date_last_modified: homeroom.date_last_modified ? new Date(homeroom.date_last_modified) : null,
        metadata: homeroom.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare homeroom:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert student allocation data in NEX schema
   * Creates one record per subject/cohort/lesson allocation
   */
  async upsertNexquareStudentAllocation(allocation: {
    student_id?: number | null;
    student_sourced_id: string;
    school_id?: string | null;
    academic_year?: string | null;
    subject_sourced_id?: string | null;
    subject_id?: number | null;
    subject_name?: string | null;
    allocation_type?: string | null;
    cohort_sourced_id?: string | null;
    cohort_id?: number | null;
    cohort_name?: string | null;
    lesson_sourced_id?: string | null;
    lesson_id?: string | null;
    lesson_name?: string | null;
    class_id?: number | null;
    homeroom_sourced_id?: string | null;
    homeroom_class_name?: string | null;
    homeroom_grade_name?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        INSERT INTO NEX.student_allocations 
        (student_id, student_sourced_id, school_id, academic_year, 
         subject_sourced_id, subject_id, subject_name, allocation_type,
         cohort_sourced_id, cohort_id, cohort_name,
         lesson_sourced_id, lesson_id, lesson_name, class_id,
         homeroom_sourced_id, homeroom_class_name, homeroom_grade_name,
         created_at, updated_at)
        VALUES 
        (@student_id, @student_sourced_id, @school_id, @academic_year,
         @subject_sourced_id, @subject_id, @subject_name, @allocation_type,
         @cohort_sourced_id, @cohort_id, @cohort_name,
         @lesson_sourced_id, @lesson_id, @lesson_name, @class_id,
         @homeroom_sourced_id, @homeroom_class_name, @homeroom_grade_name,
         SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `;

      const result = await executeQuery<any>(query, {
        student_id: allocation.student_id || null,
        student_sourced_id: allocation.student_sourced_id,
        school_id: allocation.school_id || null,
        academic_year: allocation.academic_year || null,
        subject_sourced_id: allocation.subject_sourced_id || null,
        subject_id: allocation.subject_id || null,
        subject_name: allocation.subject_name || null,
        allocation_type: allocation.allocation_type || null,
        cohort_sourced_id: allocation.cohort_sourced_id || null,
        cohort_id: allocation.cohort_id || null,
        cohort_name: allocation.cohort_name || null,
        lesson_sourced_id: allocation.lesson_sourced_id || null,
        lesson_id: allocation.lesson_id || null,
        lesson_name: allocation.lesson_name || null,
        class_id: allocation.class_id || null,
        homeroom_sourced_id: allocation.homeroom_sourced_id || null,
        homeroom_class_name: allocation.homeroom_class_name || null,
        homeroom_grade_name: allocation.homeroom_grade_name || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare student allocation:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert staff allocation data in NEX schema
   * Creates one record per subject/cohort/lesson allocation
   */
  async upsertNexquareStaffAllocation(allocation: {
    staff_id?: number | null;
    staff_sourced_id: string;
    school_id?: string | null;
    academic_year?: string | null;
    subject_sourced_id?: string | null;
    subject_id?: number | null;
    subject_name?: string | null;
    allocation_type?: string | null;
    cohort_sourced_id?: string | null;
    cohort_id?: number | null;
    cohort_name?: string | null;
    lesson_sourced_id?: string | null;
    lesson_id?: string | null;
    lesson_name?: string | null;
    class_id?: number | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        INSERT INTO NEX.staff_allocations 
        (staff_id, staff_sourced_id, school_id, academic_year, 
         subject_sourced_id, subject_id, subject_name, allocation_type,
         cohort_sourced_id, cohort_id, cohort_name,
         lesson_sourced_id, lesson_id, lesson_name, class_id,
         created_at, updated_at)
        VALUES 
        (@staff_id, @staff_sourced_id, @school_id, @academic_year,
         @subject_sourced_id, @subject_id, @subject_name, @allocation_type,
         @cohort_sourced_id, @cohort_id, @cohort_name,
         @lesson_sourced_id, @lesson_id, @lesson_name, @class_id,
         SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `;

      const result = await executeQuery<any>(query, {
        staff_id: allocation.staff_id || null,
        staff_sourced_id: allocation.staff_sourced_id,
        school_id: allocation.school_id || null,
        academic_year: allocation.academic_year || null,
        subject_sourced_id: allocation.subject_sourced_id || null,
        subject_id: allocation.subject_id || null,
        subject_name: allocation.subject_name || null,
        allocation_type: allocation.allocation_type || null,
        cohort_sourced_id: allocation.cohort_sourced_id || null,
        cohort_id: allocation.cohort_id || null,
        cohort_name: allocation.cohort_name || null,
        lesson_sourced_id: allocation.lesson_sourced_id || null,
        lesson_id: allocation.lesson_id || null,
        lesson_name: allocation.lesson_name || null,
        class_id: allocation.class_id || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare staff allocation:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert daily plan data in NEX schema
   */
  async upsertNexquareDailyPlan(plan: {
    school_id?: string | null;
    plan_date: Date | string;
    timetable_lesson_sourced_id?: string | null;
    lesson_id?: string | null;
    lesson_name?: string | null;
    subject_sourced_id?: string | null;
    subject_name?: string | null;
    class_sourced_id?: string | null;
    class_name?: string | null;
    cohort_sourced_id?: string | null;
    cohort_name?: string | null;
    teacher_sourced_id?: string | null;
    teacher_name?: string | null;
    location_sourced_id?: string | null;
    location_name?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    period_number?: number | null;
    status?: string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        INSERT INTO NEX.daily_plans 
        (school_id, plan_date, timetable_lesson_sourced_id, lesson_id, lesson_name,
         subject_sourced_id, subject_name, class_sourced_id, class_name,
         cohort_sourced_id, cohort_name, teacher_sourced_id, teacher_name,
         location_sourced_id, location_name, start_time, end_time, period_number,
         status, metadata, created_at, updated_at)
        VALUES 
        (@school_id, @plan_date, @timetable_lesson_sourced_id, @lesson_id, @lesson_name,
         @subject_sourced_id, @subject_name, @class_sourced_id, @class_name,
         @cohort_sourced_id, @cohort_name, @teacher_sourced_id, @teacher_name,
         @location_sourced_id, @location_name, @start_time, @end_time, @period_number,
         @status, @metadata, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `;

      const result = await executeQuery<any>(query, {
        school_id: plan.school_id || null,
        plan_date: plan.plan_date instanceof Date ? plan.plan_date : new Date(plan.plan_date),
        timetable_lesson_sourced_id: plan.timetable_lesson_sourced_id || null,
        lesson_id: plan.lesson_id || null,
        lesson_name: plan.lesson_name || null,
        subject_sourced_id: plan.subject_sourced_id || null,
        subject_name: plan.subject_name || null,
        class_sourced_id: plan.class_sourced_id || null,
        class_name: plan.class_name || null,
        cohort_sourced_id: plan.cohort_sourced_id || null,
        cohort_name: plan.cohort_name || null,
        teacher_sourced_id: plan.teacher_sourced_id || null,
        teacher_name: plan.teacher_name || null,
        location_sourced_id: plan.location_sourced_id || null,
        location_name: plan.location_name || null,
        start_time: plan.start_time || null,
        end_time: plan.end_time || null,
        period_number: plan.period_number || null,
        status: plan.status || null,
        metadata: plan.metadata || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare daily plan:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert timetable lesson student data in NEX schema
   */
  async upsertNexquareTimetableLessonStudent(record: {
    timetable_lesson_id?: number | null;
    timetable_lesson_sourced_id: string;
    student_id?: number | null;
    student_sourced_id: string;
    school_id?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.timetable_lesson_students AS target
        USING (SELECT @timetable_lesson_sourced_id AS timetable_lesson_sourced_id, @student_sourced_id AS student_sourced_id) AS source
        ON target.timetable_lesson_sourced_id = source.timetable_lesson_sourced_id 
           AND target.student_sourced_id = source.student_sourced_id
        WHEN NOT MATCHED THEN
          INSERT (timetable_lesson_id, timetable_lesson_sourced_id, student_id, student_sourced_id, school_id, created_at)
          VALUES (@timetable_lesson_id, @timetable_lesson_sourced_id, @student_id, @student_sourced_id, @school_id, SYSDATETIMEOFFSET());
        
        SELECT * FROM NEX.timetable_lesson_students 
        WHERE timetable_lesson_sourced_id = @timetable_lesson_sourced_id 
          AND student_sourced_id = @student_sourced_id;
      `;

      const result = await executeQuery<any>(query, {
        timetable_lesson_id: record.timetable_lesson_id || null,
        timetable_lesson_sourced_id: record.timetable_lesson_sourced_id,
        student_id: record.student_id || null,
        student_sourced_id: record.student_sourced_id,
        school_id: record.school_id || null,
      });

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare timetable lesson student:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert daily attendance data in NEX schema
   */
  async upsertNexquareDailyAttendance(attendance: {
    school_id?: string | null;
    student_id?: number | null;
    student_sourced_id?: string | null;
    attendance_date: Date | string;
    status?: string | null;
    category_code?: string | null;
    category_name?: string | null;
    category_required?: boolean | null;
    range_type?: number | null;
    notes?: string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        INSERT INTO NEX.daily_attendance 
        (school_id, student_id, student_sourced_id, attendance_date, status,
         category_code, category_name, category_required, range_type, notes, metadata,
         created_at, updated_at)
        VALUES 
        (@school_id, @student_id, @student_sourced_id, @attendance_date, @status,
         @category_code, @category_name, @category_required, @range_type, @notes, @metadata,
         SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `;

      // Ensure all string values are properly converted (null becomes empty string for SQL Server compatibility)
      const params: Record<string, any> = {
        school_id: attendance.school_id || null,
        student_id: attendance.student_id || null,
        student_sourced_id: attendance.student_sourced_id || null,
        attendance_date: attendance.attendance_date instanceof Date 
          ? attendance.attendance_date 
          : new Date(attendance.attendance_date),
        status: attendance.status ? String(attendance.status) : null,
        category_code: attendance.category_code ? String(attendance.category_code) : null,
        category_name: attendance.category_name ? String(attendance.category_name) : null,
        category_required: attendance.category_required !== null && attendance.category_required !== undefined 
          ? Boolean(attendance.category_required) 
          : false,
        range_type: attendance.range_type !== null && attendance.range_type !== undefined 
          ? Number(attendance.range_type) 
          : null,
        notes: attendance.notes ? String(attendance.notes) : null,
        metadata: attendance.metadata ? String(attendance.metadata) : null,
      };

      const result = await executeQuery<any>(query, params);

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare daily attendance:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert lesson attendance data in NEX schema
   */
  async upsertNexquareLessonAttendance(attendance: {
    school_id?: string | null;
    student_id?: number | null;
    student_sourced_id?: string | null;
    lesson_id?: string | null;
    timetable_lesson_sourced_id?: string | null;
    attendance_date: Date | string;
    attendance_time?: string | null;
    status?: string | null;
    category_code?: string | null;
    category_name?: string | null;
    subject_sourced_id?: string | null;
    subject_name?: string | null;
    class_sourced_id?: string | null;
    class_name?: string | null;
    teacher_sourced_id?: string | null;
    teacher_name?: string | null;
    notes?: string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        INSERT INTO NEX.lesson_attendance 
        (school_id, student_id, student_sourced_id, lesson_id, timetable_lesson_sourced_id,
         attendance_date, attendance_time, status, category_code, category_name,
         subject_sourced_id, subject_name, class_sourced_id, class_name,
         teacher_sourced_id, teacher_name, notes, metadata,
         created_at, updated_at)
        VALUES 
        (@school_id, @student_id, @student_sourced_id, @lesson_id, @timetable_lesson_sourced_id,
         @attendance_date, @attendance_time, @status, @category_code, @category_name,
         @subject_sourced_id, @subject_name, @class_sourced_id, @class_name,
         @teacher_sourced_id, @teacher_name, @notes, @metadata,
         SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `;

      // Ensure all string values are properly converted
      const params: Record<string, any> = {
        school_id: attendance.school_id || null,
        student_id: attendance.student_id || null,
        student_sourced_id: attendance.student_sourced_id || null,
        lesson_id: attendance.lesson_id ? String(attendance.lesson_id) : null,
        timetable_lesson_sourced_id: attendance.timetable_lesson_sourced_id ? String(attendance.timetable_lesson_sourced_id) : null,
        attendance_date: attendance.attendance_date instanceof Date 
          ? attendance.attendance_date 
          : new Date(attendance.attendance_date),
        attendance_time: attendance.attendance_time ? String(attendance.attendance_time) : null,
        status: attendance.status ? String(attendance.status) : null,
        category_code: attendance.category_code ? String(attendance.category_code) : null,
        category_name: attendance.category_name ? String(attendance.category_name) : null,
        subject_sourced_id: attendance.subject_sourced_id ? String(attendance.subject_sourced_id) : null,
        subject_name: attendance.subject_name ? String(attendance.subject_name) : null,
        class_sourced_id: attendance.class_sourced_id ? String(attendance.class_sourced_id) : null,
        class_name: attendance.class_name ? String(attendance.class_name) : null,
        teacher_sourced_id: attendance.teacher_sourced_id ? String(attendance.teacher_sourced_id) : null,
        teacher_name: attendance.teacher_name ? String(attendance.teacher_name) : null,
        notes: attendance.notes ? String(attendance.notes) : null,
        metadata: attendance.metadata ? String(attendance.metadata) : null,
      };

      const result = await executeQuery<any>(query, params);

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare lesson attendance:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Upsert Nexquare student assessment record
   */
  async upsertNexquareStudentAssessment(assessment: {
    school_id?: string | null;
    student_id?: number | null;
    student_sourced_id?: string | null;
    academic_year?: string | null;
    assessment_name?: string | null;
    assessment_type?: string | null;
    subject_sourced_id?: string | null;
    subject_name?: string | null;
    class_sourced_id?: string | null;
    class_name?: string | null;
    grade?: string | null;
    score?: number | null;
    max_score?: number | null;
    percentage?: number | null;
    assessment_date?: Date | string | null;
    due_date?: Date | string | null;
    teacher_sourced_id?: string | null;
    teacher_name?: string | null;
    comments?: string | null;
    metadata?: string | null;
  }): Promise<{ data: any | null; error: string | null }> {
    try {
      const query = `
        MERGE NEX.student_assessments AS target
        USING (SELECT 
          @school_id AS school_id,
          @student_sourced_id AS student_sourced_id,
          @academic_year AS academic_year,
          @assessment_name AS assessment_name,
          @subject_sourced_id AS subject_sourced_id,
          @class_sourced_id AS class_sourced_id,
          @assessment_date AS assessment_date
        ) AS source
        ON target.school_id = source.school_id
          AND target.student_sourced_id = source.student_sourced_id
          AND target.academic_year = source.academic_year
          AND target.assessment_name = source.assessment_name
          AND target.subject_sourced_id = source.subject_sourced_id
          AND target.class_sourced_id = source.class_sourced_id
          AND target.assessment_date = source.assessment_date
        WHEN MATCHED THEN
          UPDATE SET
            student_id = @student_id,
            assessment_type = @assessment_type,
            subject_name = @subject_name,
            class_name = @class_name,
            grade = @grade,
            score = @score,
            max_score = @max_score,
            percentage = @percentage,
            due_date = @due_date,
            teacher_sourced_id = @teacher_sourced_id,
            teacher_name = @teacher_name,
            comments = @comments,
            metadata = @metadata,
            updated_at = SYSDATETIMEOFFSET()
        WHEN NOT MATCHED THEN
          INSERT (school_id, student_id, student_sourced_id, academic_year, assessment_name,
                  assessment_type, subject_sourced_id, subject_name, class_sourced_id, class_name,
                  grade, score, max_score, percentage, assessment_date, due_date,
                  teacher_sourced_id, teacher_name, comments, metadata,
                  created_at, updated_at)
          VALUES (@school_id, @student_id, @student_sourced_id, @academic_year, @assessment_name,
                  @assessment_type, @subject_sourced_id, @subject_name, @class_sourced_id, @class_name,
                  @grade, @score, @max_score, @percentage, @assessment_date, @due_date,
                  @teacher_sourced_id, @teacher_name, @comments, @metadata,
                  SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
      `;

      // Parse dates
      const assessmentDate = assessment.assessment_date 
        ? (assessment.assessment_date instanceof Date 
          ? assessment.assessment_date 
          : new Date(assessment.assessment_date))
        : null;
      
      const dueDate = assessment.due_date 
        ? (assessment.due_date instanceof Date 
          ? assessment.due_date 
          : new Date(assessment.due_date))
        : null;

      const params: Record<string, any> = {
        school_id: assessment.school_id || null,
        student_id: assessment.student_id || null,
        student_sourced_id: assessment.student_sourced_id ? String(assessment.student_sourced_id) : null,
        academic_year: assessment.academic_year ? String(assessment.academic_year) : null,
        assessment_name: assessment.assessment_name ? String(assessment.assessment_name) : null,
        assessment_type: assessment.assessment_type ? String(assessment.assessment_type) : null,
        subject_sourced_id: assessment.subject_sourced_id ? String(assessment.subject_sourced_id) : null,
        subject_name: assessment.subject_name ? String(assessment.subject_name) : null,
        class_sourced_id: assessment.class_sourced_id ? String(assessment.class_sourced_id) : null,
        class_name: assessment.class_name ? String(assessment.class_name) : null,
        grade: assessment.grade ? String(assessment.grade) : null,
        score: assessment.score !== null && assessment.score !== undefined ? Number(assessment.score) : null,
        max_score: assessment.max_score !== null && assessment.max_score !== undefined ? Number(assessment.max_score) : null,
        percentage: assessment.percentage !== null && assessment.percentage !== undefined ? Number(assessment.percentage) : null,
        assessment_date: assessmentDate,
        due_date: dueDate,
        teacher_sourced_id: assessment.teacher_sourced_id ? String(assessment.teacher_sourced_id) : null,
        teacher_name: assessment.teacher_name ? String(assessment.teacher_name) : null,
        comments: assessment.comments ? String(assessment.comments) : null,
        metadata: assessment.metadata ? String(assessment.metadata) : null,
      };

      const result = await executeQuery<any>(query, params);

      if (result.error) {
        return { data: null, error: result.error };
      }

      return { data: result.data?.[0] || null, error: null };
    } catch (error: any) {
      console.error('Error upserting Nexquare student assessment:', error);
      return { data: null, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Bulk insert daily attendance records using transaction
   * Much faster than row-by-row inserts
   */
  async bulkInsertDailyAttendance(
    records: Array<{
      school_id?: string | null;
      student_id?: number | null;
      student_sourced_id?: string | null;
      attendance_date: Date | string;
      status?: string | null;
      category_code?: string | null;
      category_name?: string | null;
      category_required?: boolean | null;
      range_type?: number | null;
      notes?: string | null;
      metadata?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      // Batch size: 100 records per batch (100 * 11 columns = 1100 parameters, well under 2100 limit)
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        // Build VALUES clause for batch insert
        const values = batch.map((record, index) => {
          const baseIndex = i + index;
          return `(
            @schoolId${baseIndex},
            @studentId${baseIndex},
            @studentSourcedId${baseIndex},
            @attendanceDate${baseIndex},
            @status${baseIndex},
            @categoryCode${baseIndex},
            @categoryName${baseIndex},
            @categoryRequired${baseIndex},
            @rangeType${baseIndex},
            @notes${baseIndex},
            @metadata${baseIndex},
            SYSDATETIMEOFFSET(),
            SYSDATETIMEOFFSET()
          )`;
        }).join(',');

        const batchQuery = `
          INSERT INTO NEX.daily_attendance (
            school_id, student_id, student_sourced_id, attendance_date, status,
            category_code, category_name, category_required, range_type, notes, metadata,
            created_at, updated_at
          ) VALUES ${values};
        `;

        const request = transaction.request();

        // Add parameters for each record in the batch
        batch.forEach((record, index) => {
          const baseIndex = i + index;

          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`studentId${baseIndex}`, sql.BigInt, record.student_id || null);
          request.input(`studentSourcedId${baseIndex}`, sql.NVarChar(100), record.student_sourced_id || null);
          
          const attendanceDate = record.attendance_date instanceof Date 
            ? record.attendance_date 
            : new Date(record.attendance_date);
          request.input(`attendanceDate${baseIndex}`, sql.Date, attendanceDate);
          
          request.input(`status${baseIndex}`, sql.NVarChar(50), record.status || null);
          request.input(`categoryCode${baseIndex}`, sql.NVarChar(50), record.category_code || null);
          request.input(`categoryName${baseIndex}`, sql.NVarChar(255), record.category_name || null);
          request.input(`categoryRequired${baseIndex}`, sql.Bit, record.category_required !== null && record.category_required !== undefined ? record.category_required : false);
          request.input(`rangeType${baseIndex}`, sql.Int, record.range_type !== null && record.range_type !== undefined ? record.range_type : null);
          request.input(`notes${baseIndex}`, sql.NVarChar(sql.MAX), record.notes || null);
          request.input(`metadata${baseIndex}`, sql.NVarChar(sql.MAX), record.metadata || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert daily attendance:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Bulk insert lesson attendance records using transaction
   * Much faster than row-by-row inserts
   */
  async bulkInsertLessonAttendance(
    records: Array<{
      school_id?: string | null;
      student_id?: number | null;
      student_sourced_id?: string | null;
      lesson_id?: string | null;
      timetable_lesson_sourced_id?: string | null;
      attendance_date: Date | string;
      attendance_time?: string | null;
      status?: string | null;
      category_code?: string | null;
      category_name?: string | null;
      subject_sourced_id?: string | null;
      subject_name?: string | null;
      class_sourced_id?: string | null;
      class_name?: string | null;
      teacher_sourced_id?: string | null;
      teacher_name?: string | null;
      notes?: string | null;
      metadata?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      // Batch size: 100 records per batch (100 * 18 columns = 1800 parameters, under 2100 limit)
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        // Build VALUES clause for batch insert
        const values = batch.map((record, index) => {
          const baseIndex = i + index;
          return `(
            @schoolId${baseIndex},
            @studentId${baseIndex},
            @studentSourcedId${baseIndex},
            @lessonId${baseIndex},
            @timetableLessonSourcedId${baseIndex},
            @attendanceDate${baseIndex},
            @attendanceTime${baseIndex},
            @status${baseIndex},
            @categoryCode${baseIndex},
            @categoryName${baseIndex},
            @subjectSourcedId${baseIndex},
            @subjectName${baseIndex},
            @classSourcedId${baseIndex},
            @className${baseIndex},
            @teacherSourcedId${baseIndex},
            @teacherName${baseIndex},
            @notes${baseIndex},
            @metadata${baseIndex},
            SYSDATETIMEOFFSET(),
            SYSDATETIMEOFFSET()
          )`;
        }).join(',');

        const batchQuery = `
          INSERT INTO NEX.lesson_attendance (
            school_id, student_id, student_sourced_id, lesson_id, timetable_lesson_sourced_id,
            attendance_date, attendance_time, status, category_code, category_name,
            subject_sourced_id, subject_name, class_sourced_id, class_name,
            teacher_sourced_id, teacher_name, notes, metadata,
            created_at, updated_at
          ) VALUES ${values};
        `;

        const request = transaction.request();

        // Add parameters for each record in the batch
        batch.forEach((record, index) => {
          const baseIndex = i + index;

          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`studentId${baseIndex}`, sql.BigInt, record.student_id || null);
          request.input(`studentSourcedId${baseIndex}`, sql.NVarChar(100), record.student_sourced_id || null);
          request.input(`lessonId${baseIndex}`, sql.NVarChar(255), record.lesson_id || null);
          request.input(`timetableLessonSourcedId${baseIndex}`, sql.NVarChar(100), record.timetable_lesson_sourced_id || null);
          
          const attendanceDate = record.attendance_date instanceof Date 
            ? record.attendance_date 
            : new Date(record.attendance_date);
          request.input(`attendanceDate${baseIndex}`, sql.Date, attendanceDate);
          
          request.input(`attendanceTime${baseIndex}`, sql.Time, record.attendance_time || null);
          request.input(`status${baseIndex}`, sql.NVarChar(50), record.status || null);
          request.input(`categoryCode${baseIndex}`, sql.NVarChar(50), record.category_code || null);
          request.input(`categoryName${baseIndex}`, sql.NVarChar(255), record.category_name || null);
          request.input(`subjectSourcedId${baseIndex}`, sql.NVarChar(100), record.subject_sourced_id || null);
          request.input(`subjectName${baseIndex}`, sql.NVarChar(500), record.subject_name || null);
          request.input(`classSourcedId${baseIndex}`, sql.NVarChar(100), record.class_sourced_id || null);
          request.input(`className${baseIndex}`, sql.NVarChar(500), record.class_name || null);
          request.input(`teacherSourcedId${baseIndex}`, sql.NVarChar(100), record.teacher_sourced_id || null);
          request.input(`teacherName${baseIndex}`, sql.NVarChar(500), record.teacher_name || null);
          request.input(`notes${baseIndex}`, sql.NVarChar(sql.MAX), record.notes || null);
          request.input(`metadata${baseIndex}`, sql.NVarChar(sql.MAX), record.metadata || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert lesson attendance:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Ultra-fast bulk insert using temporary table approach
   * This method uses a temp table to batch insert, which can be faster for very large datasets
   * Uses parameterized queries for safety
   */
  async bulkInsertDailyAttendanceViaTempTable(
    records: Array<{
      school_id?: string | null;
      student_id?: number | null;
      student_sourced_id?: string | null;
      attendance_date: Date | string;
      status?: string | null;
      category_code?: string | null;
      category_name?: string | null;
      category_required?: boolean | null;
      range_type?: number | null;
      notes?: string | null;
      metadata?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();
      // Use a single request object for all operations to maintain temp table scope
      const request = transaction.request();

      // Create temporary table
      await request.query(`
        CREATE TABLE #TempDailyAttendance (
          school_id BIGINT NULL,
          student_id BIGINT NULL,
          student_sourced_id NVARCHAR(100) NULL,
          attendance_date DATE NOT NULL,
          status NVARCHAR(50) NULL,
          category_code NVARCHAR(50) NULL,
          category_name NVARCHAR(255) NULL,
          category_required BIT NULL,
          range_type INT NULL,
          notes NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL
        );
      `);

      // Insert using the same batch approach but into temp table first
      // This allows SQL Server to optimize the final insert
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        const values = batch.map((record, index) => {
          const baseIndex = i + index;
          return `(
            @schoolId${baseIndex},
            @studentId${baseIndex},
            @studentSourcedId${baseIndex},
            @attendanceDate${baseIndex},
            @status${baseIndex},
            @categoryCode${baseIndex},
            @categoryName${baseIndex},
            @categoryRequired${baseIndex},
            @rangeType${baseIndex},
            @notes${baseIndex},
            @metadata${baseIndex}
          )`;
        }).join(',');

        const batchQuery = `
          INSERT INTO #TempDailyAttendance (
            school_id, student_id, student_sourced_id, attendance_date, status,
            category_code, category_name, category_required, range_type, notes, metadata
          ) VALUES ${values};
        `;

        // Reuse the same request object - clear previous parameters first
        // Note: mssql request objects can be reused, but we need to add all parameters for this batch
        batch.forEach((record, index) => {
          const baseIndex = i + index;
          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`studentId${baseIndex}`, sql.BigInt, record.student_id || null);
          request.input(`studentSourcedId${baseIndex}`, sql.NVarChar(100), record.student_sourced_id || null);
          
          const attendanceDate = record.attendance_date instanceof Date 
            ? record.attendance_date 
            : new Date(record.attendance_date);
          request.input(`attendanceDate${baseIndex}`, sql.Date, attendanceDate);
          
          request.input(`status${baseIndex}`, sql.NVarChar(50), record.status || null);
          request.input(`categoryCode${baseIndex}`, sql.NVarChar(50), record.category_code || null);
          request.input(`categoryName${baseIndex}`, sql.NVarChar(255), record.category_name || null);
          request.input(`categoryRequired${baseIndex}`, sql.Bit, record.category_required !== null && record.category_required !== undefined ? record.category_required : false);
          request.input(`rangeType${baseIndex}`, sql.Int, record.range_type !== null && record.range_type !== undefined ? record.range_type : null);
          request.input(`notes${baseIndex}`, sql.NVarChar(sql.MAX), record.notes || null);
          request.input(`metadata${baseIndex}`, sql.NVarChar(sql.MAX), record.metadata || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      // Now insert from temp table to actual table in one operation
      // This is faster than individual inserts because SQL Server can optimize it
      // Reuse the same request object
      await request.query(`
        INSERT INTO NEX.daily_attendance (
          school_id, student_id, student_sourced_id, attendance_date, status,
          category_code, category_name, category_required, range_type, notes, metadata,
          created_at, updated_at
        )
        SELECT 
          school_id, student_id, student_sourced_id, attendance_date, status,
          category_code, category_name, category_required, range_type, notes, metadata,
          SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
        FROM #TempDailyAttendance;
      `);

      // Drop temp table (reuse same request)
      await request.query(`DROP TABLE #TempDailyAttendance;`);

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert daily attendance via temp table:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Ultra-fast bulk insert for lesson attendance using temporary table approach
   * This method uses a temp table to batch insert, which can be faster for very large datasets
   * Uses parameterized queries for safety
   */
  async bulkInsertLessonAttendanceViaTempTable(
    records: Array<{
      school_id?: string | null;
      student_id?: number | null;
      student_sourced_id?: string | null;
      lesson_id?: string | null;
      timetable_lesson_sourced_id?: string | null;
      attendance_date: Date | string;
      attendance_time?: string | null;
      status?: string | null;
      category_code?: string | null;
      category_name?: string | null;
      subject_sourced_id?: string | null;
      subject_name?: string | null;
      class_sourced_id?: string | null;
      class_name?: string | null;
      teacher_sourced_id?: string | null;
      teacher_name?: string | null;
      notes?: string | null;
      metadata?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();
      // Use a single request object for all operations to maintain temp table scope
      const request = transaction.request();

      // Create temporary table
      await request.query(`
        CREATE TABLE #TempLessonAttendance (
          school_id BIGINT NULL,
          student_id BIGINT NULL,
          student_sourced_id NVARCHAR(100) NULL,
          lesson_id NVARCHAR(255) NULL,
          timetable_lesson_sourced_id NVARCHAR(100) NULL,
          attendance_date DATE NOT NULL,
          attendance_time TIME NULL,
          status NVARCHAR(50) NULL,
          category_code NVARCHAR(50) NULL,
          category_name NVARCHAR(255) NULL,
          subject_sourced_id NVARCHAR(100) NULL,
          subject_name NVARCHAR(500) NULL,
          class_sourced_id NVARCHAR(100) NULL,
          class_name NVARCHAR(500) NULL,
          teacher_sourced_id NVARCHAR(100) NULL,
          teacher_name NVARCHAR(500) NULL,
          notes NVARCHAR(MAX) NULL,
          metadata NVARCHAR(MAX) NULL
        );
      `);

      // Insert using the same batch approach but into temp table first
      // This allows SQL Server to optimize the final insert
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        const values = batch.map((record, index) => {
          const baseIndex = i + index;
          return `(
            @schoolId${baseIndex},
            @studentId${baseIndex},
            @studentSourcedId${baseIndex},
            @lessonId${baseIndex},
            @timetableLessonSourcedId${baseIndex},
            @attendanceDate${baseIndex},
            @attendanceTime${baseIndex},
            @status${baseIndex},
            @categoryCode${baseIndex},
            @categoryName${baseIndex},
            @subjectSourcedId${baseIndex},
            @subjectName${baseIndex},
            @classSourcedId${baseIndex},
            @className${baseIndex},
            @teacherSourcedId${baseIndex},
            @teacherName${baseIndex},
            @notes${baseIndex},
            @metadata${baseIndex}
          )`;
        }).join(',');

        const batchQuery = `
          INSERT INTO #TempLessonAttendance (
            school_id, student_id, student_sourced_id, lesson_id, timetable_lesson_sourced_id,
            attendance_date, attendance_time, status, category_code, category_name,
            subject_sourced_id, subject_name, class_sourced_id, class_name,
            teacher_sourced_id, teacher_name, notes, metadata
          ) VALUES ${values};
        `;

        // Reuse the same request object - add all parameters for this batch
        batch.forEach((record, index) => {
          const baseIndex = i + index;

          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`studentId${baseIndex}`, sql.BigInt, record.student_id || null);
          request.input(`studentSourcedId${baseIndex}`, sql.NVarChar(100), record.student_sourced_id || null);
          request.input(`lessonId${baseIndex}`, sql.NVarChar(255), record.lesson_id || null);
          request.input(`timetableLessonSourcedId${baseIndex}`, sql.NVarChar(100), record.timetable_lesson_sourced_id || null);
          
          const attendanceDate = record.attendance_date instanceof Date 
            ? record.attendance_date 
            : new Date(record.attendance_date);
          request.input(`attendanceDate${baseIndex}`, sql.Date, attendanceDate);
          
          request.input(`attendanceTime${baseIndex}`, sql.Time, record.attendance_time || null);
          request.input(`status${baseIndex}`, sql.NVarChar(50), record.status || null);
          request.input(`categoryCode${baseIndex}`, sql.NVarChar(50), record.category_code || null);
          request.input(`categoryName${baseIndex}`, sql.NVarChar(255), record.category_name || null);
          request.input(`subjectSourcedId${baseIndex}`, sql.NVarChar(100), record.subject_sourced_id || null);
          request.input(`subjectName${baseIndex}`, sql.NVarChar(500), record.subject_name || null);
          request.input(`classSourcedId${baseIndex}`, sql.NVarChar(100), record.class_sourced_id || null);
          request.input(`className${baseIndex}`, sql.NVarChar(500), record.class_name || null);
          request.input(`teacherSourcedId${baseIndex}`, sql.NVarChar(100), record.teacher_sourced_id || null);
          request.input(`teacherName${baseIndex}`, sql.NVarChar(500), record.teacher_name || null);
          request.input(`notes${baseIndex}`, sql.NVarChar(sql.MAX), record.notes || null);
          request.input(`metadata${baseIndex}`, sql.NVarChar(sql.MAX), record.metadata || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      // Now insert from temp table to actual table in one operation
      // This is faster than individual inserts because SQL Server can optimize it
      // Reuse the same request object
      await request.query(`
        INSERT INTO NEX.lesson_attendance (
          school_id, student_id, student_sourced_id, lesson_id, timetable_lesson_sourced_id,
          attendance_date, attendance_time, status, category_code, category_name,
          subject_sourced_id, subject_name, class_sourced_id, class_name,
          teacher_sourced_id, teacher_name, notes, metadata,
          created_at, updated_at
        )
        SELECT 
          school_id, student_id, student_sourced_id, lesson_id, timetable_lesson_sourced_id,
          attendance_date, attendance_time, status, category_code, category_name,
          subject_sourced_id, subject_name, class_sourced_id, class_name,
          teacher_sourced_id, teacher_name, notes, metadata,
          SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
        FROM #TempLessonAttendance;
      `);

      // Drop temp table (reuse same request)
      await request.query(`DROP TABLE #TempLessonAttendance;`);

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert lesson attendance via temp table:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Bulk insert students using batched parameterized inserts
   */
  async bulkInsertStudents(
    records: Array<{
      school_id?: string | null;
      sourced_id: string;
      identifier?: string | null;
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      username?: string | null;
      user_type?: string | null;
      status?: string | null;
      date_last_modified?: Date | string | null;
      academic_year?: string | null;
      metadata?: string | null;
      current_grade?: string | null;
      current_class?: string | null;
      current_class_id?: number | null;
      grades?: string | null;
      phone?: string | null;
      mobile_number?: string | null;
      sms?: string | null;
      gender?: string | null;
      student_dob?: Date | string | null;
      religion?: string | null;
      admission_date?: Date | string | null;
      join_date?: Date | string | null;
      parent_name?: string | null;
      guardian_one_full_name?: string | null;
      guardian_two_full_name?: string | null;
      guardian_one_mobile?: string | null;
      guardian_two_mobile?: string | null;
      primary_contact?: string | null;
      student_reg_id?: string | null;
      family_code?: string | null;
      student_national_id?: string | null;
      student_status?: string | null;
      class_grade?: string | null;
      class_section?: string | null;
      homeroom_teacher_sourced_id?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      // Batch size: 50 records per batch (50 * 35 columns = 1750 parameters, under 2100 limit)
      const batchSize = 50;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        // Use individual MERGE statements in a batch - more reliable than VALUES in MERGE
        const mergeStatements = batch.map((record, index) => {
          const baseIndex = i + index;
          return `
            MERGE NEX.students AS target
            USING (SELECT @sourcedId${baseIndex} AS sourced_id) AS source
            ON target.sourced_id = source.sourced_id
            WHEN MATCHED THEN
              UPDATE SET
                school_id = @schoolId${baseIndex}, identifier = @identifier${baseIndex}, full_name = @fullName${baseIndex},
                first_name = @firstName${baseIndex}, last_name = @lastName${baseIndex}, email = @email${baseIndex},
                username = @username${baseIndex}, user_type = @userType${baseIndex}, status = @status${baseIndex},
                date_last_modified = @dateLastModified${baseIndex}, academic_year = @academicYear${baseIndex},
                metadata = @metadata${baseIndex}, current_grade = @currentGrade${baseIndex}, current_class = @currentClass${baseIndex},
                current_class_id = @currentClassId${baseIndex}, grades = @grades${baseIndex}, phone = @phone${baseIndex},
                mobile_number = @mobileNumber${baseIndex}, sms = @sms${baseIndex}, gender = @gender${baseIndex},
                student_dob = @studentDob${baseIndex}, religion = @religion${baseIndex}, admission_date = @admissionDate${baseIndex},
                join_date = @joinDate${baseIndex}, parent_name = @parentName${baseIndex},
                guardian_one_full_name = @guardianOneFullName${baseIndex}, guardian_two_full_name = @guardianTwoFullName${baseIndex},
                guardian_one_mobile = @guardianOneMobile${baseIndex}, guardian_two_mobile = @guardianTwoMobile${baseIndex},
                primary_contact = @primaryContact${baseIndex}, student_reg_id = @studentRegId${baseIndex},
                family_code = @familyCode${baseIndex}, student_national_id = @studentNationalId${baseIndex},
                student_status = @studentStatus${baseIndex}, class_grade = @classGrade${baseIndex},
                class_section = @classSection${baseIndex}, homeroom_teacher_sourced_id = @homeroomTeacherSourcedId${baseIndex},
                updated_at = SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN
              INSERT (
                school_id, sourced_id, identifier, full_name, first_name, last_name, email, username,
                user_type, status, date_last_modified, academic_year, metadata,
                current_grade, current_class, current_class_id, grades,
                phone, mobile_number, sms, gender, student_dob, religion,
                admission_date, join_date, parent_name, guardian_one_full_name, guardian_two_full_name,
                guardian_one_mobile, guardian_two_mobile, primary_contact,
                student_reg_id, family_code, student_national_id, student_status,
                class_grade, class_section, homeroom_teacher_sourced_id, created_at, updated_at
              )
              VALUES (
                @schoolId${baseIndex}, @sourcedId${baseIndex}, @identifier${baseIndex}, @fullName${baseIndex},
                @firstName${baseIndex}, @lastName${baseIndex}, @email${baseIndex}, @username${baseIndex},
                @userType${baseIndex}, @status${baseIndex}, @dateLastModified${baseIndex}, @academicYear${baseIndex},
                @metadata${baseIndex}, @currentGrade${baseIndex}, @currentClass${baseIndex}, @currentClassId${baseIndex},
                @grades${baseIndex}, @phone${baseIndex}, @mobileNumber${baseIndex}, @sms${baseIndex},
                @gender${baseIndex}, @studentDob${baseIndex}, @religion${baseIndex}, @admissionDate${baseIndex},
                @joinDate${baseIndex}, @parentName${baseIndex}, @guardianOneFullName${baseIndex}, @guardianTwoFullName${baseIndex},
                @guardianOneMobile${baseIndex}, @guardianTwoMobile${baseIndex}, @primaryContact${baseIndex},
                @studentRegId${baseIndex}, @familyCode${baseIndex}, @studentNationalId${baseIndex}, @studentStatus${baseIndex},
                @classGrade${baseIndex}, @classSection${baseIndex}, @homeroomTeacherSourcedId${baseIndex},
                SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
              );
          `;
        }).join('\n');

        const batchQuery = mergeStatements;

        const request = transaction.request();
        batch.forEach((record, index) => {
          const baseIndex = i + index;
          const parseDate = (dateStr: Date | string | null | undefined): Date | null => {
            if (!dateStr) return null;
            if (dateStr instanceof Date) return dateStr;
            try {
              return new Date(dateStr);
            } catch {
              return null;
            }
          };

          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`sourcedId${baseIndex}`, sql.NVarChar(100), record.sourced_id);
          request.input(`identifier${baseIndex}`, sql.NVarChar(100), record.identifier || null);
          request.input(`fullName${baseIndex}`, sql.NVarChar(500), record.full_name || null);
          request.input(`firstName${baseIndex}`, sql.NVarChar(255), record.first_name || null);
          request.input(`lastName${baseIndex}`, sql.NVarChar(255), record.last_name || null);
          request.input(`email${baseIndex}`, sql.NVarChar(255), record.email || null);
          request.input(`username${baseIndex}`, sql.NVarChar(255), record.username || null);
          request.input(`userType${baseIndex}`, sql.NVarChar(50), record.user_type || null);
          request.input(`status${baseIndex}`, sql.NVarChar(50), record.status || null);
          request.input(`dateLastModified${baseIndex}`, sql.DateTimeOffset, parseDate(record.date_last_modified));
          request.input(`academicYear${baseIndex}`, sql.NVarChar(50), record.academic_year || null);
          request.input(`metadata${baseIndex}`, sql.NVarChar(sql.MAX), record.metadata || null);
          request.input(`currentGrade${baseIndex}`, sql.NVarChar(100), record.current_grade || null);
          request.input(`currentClass${baseIndex}`, sql.NVarChar(500), record.current_class || null);
          request.input(`currentClassId${baseIndex}`, sql.BigInt, record.current_class_id || null);
          request.input(`grades${baseIndex}`, sql.NVarChar(sql.MAX), record.grades || null);
          request.input(`phone${baseIndex}`, sql.NVarChar(50), record.phone || null);
          request.input(`mobileNumber${baseIndex}`, sql.NVarChar(50), record.mobile_number || null);
          request.input(`sms${baseIndex}`, sql.NVarChar(50), record.sms || null);
          request.input(`gender${baseIndex}`, sql.NVarChar(50), record.gender || null);
          request.input(`studentDob${baseIndex}`, sql.Date, parseDate(record.student_dob));
          request.input(`religion${baseIndex}`, sql.NVarChar(100), record.religion || null);
          request.input(`admissionDate${baseIndex}`, sql.Date, parseDate(record.admission_date));
          request.input(`joinDate${baseIndex}`, sql.Date, parseDate(record.join_date));
          request.input(`parentName${baseIndex}`, sql.NVarChar(500), record.parent_name || null);
          request.input(`guardianOneFullName${baseIndex}`, sql.NVarChar(500), record.guardian_one_full_name || null);
          request.input(`guardianTwoFullName${baseIndex}`, sql.NVarChar(500), record.guardian_two_full_name || null);
          request.input(`guardianOneMobile${baseIndex}`, sql.NVarChar(50), record.guardian_one_mobile || null);
          request.input(`guardianTwoMobile${baseIndex}`, sql.NVarChar(50), record.guardian_two_mobile || null);
          request.input(`primaryContact${baseIndex}`, sql.NVarChar(500), record.primary_contact || null);
          request.input(`studentRegId${baseIndex}`, sql.NVarChar(100), record.student_reg_id || null);
          request.input(`familyCode${baseIndex}`, sql.NVarChar(100), record.family_code || null);
          request.input(`studentNationalId${baseIndex}`, sql.NVarChar(100), record.student_national_id || null);
          request.input(`studentStatus${baseIndex}`, sql.NVarChar(100), record.student_status || null);
          request.input(`classGrade${baseIndex}`, sql.NVarChar(100), record.class_grade || null);
          request.input(`classSection${baseIndex}`, sql.NVarChar(100), record.class_section || null);
          request.input(`homeroomTeacherSourcedId${baseIndex}`, sql.NVarChar(100), record.homeroom_teacher_sourced_id || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert students:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Bulk insert staff using batched parameterized inserts
   */
  async bulkInsertStaff(
    records: Array<{
      school_id?: string | null;
      sourced_id: string;
      identifier?: string | null;
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      username?: string | null;
      user_type?: string | null;
      role?: string | null;
      status?: string | null;
      date_last_modified?: Date | string | null;
      metadata?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      // Batch size: 100 records per batch (100 * 12 columns = 1200 parameters)
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        // Use individual MERGE statements in a batch
        const mergeStatements = batch.map((record, index) => {
          const baseIndex = i + index;
          return `
            MERGE NEX.staff AS target
            USING (SELECT @sourcedId${baseIndex} AS sourced_id) AS source
            ON target.sourced_id = source.sourced_id
            WHEN MATCHED THEN
              UPDATE SET
                school_id = @schoolId${baseIndex}, identifier = @identifier${baseIndex}, full_name = @fullName${baseIndex},
                first_name = @firstName${baseIndex}, last_name = @lastName${baseIndex}, email = @email${baseIndex},
                username = @username${baseIndex}, user_type = @userType${baseIndex}, role = @role${baseIndex},
                status = @status${baseIndex}, date_last_modified = @dateLastModified${baseIndex},
                metadata = @metadata${baseIndex}, updated_at = SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN
              INSERT (school_id, sourced_id, identifier, full_name, first_name, last_name, email, username,
                      user_type, role, status, date_last_modified, metadata, created_at, updated_at)
              VALUES (@schoolId${baseIndex}, @sourcedId${baseIndex}, @identifier${baseIndex}, @fullName${baseIndex},
                      @firstName${baseIndex}, @lastName${baseIndex}, @email${baseIndex}, @username${baseIndex},
                      @userType${baseIndex}, @role${baseIndex}, @status${baseIndex}, @dateLastModified${baseIndex},
                      @metadata${baseIndex}, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
          `;
        }).join('\n');

        const batchQuery = mergeStatements;

        const request = transaction.request();
        batch.forEach((record, index) => {
          const baseIndex = i + index;
          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`sourcedId${baseIndex}`, sql.NVarChar(100), record.sourced_id);
          request.input(`identifier${baseIndex}`, sql.NVarChar(100), record.identifier || null);
          request.input(`fullName${baseIndex}`, sql.NVarChar(500), record.full_name || null);
          request.input(`firstName${baseIndex}`, sql.NVarChar(255), record.first_name || null);
          request.input(`lastName${baseIndex}`, sql.NVarChar(255), record.last_name || null);
          request.input(`email${baseIndex}`, sql.NVarChar(255), record.email || null);
          request.input(`username${baseIndex}`, sql.NVarChar(255), record.username || null);
          request.input(`userType${baseIndex}`, sql.NVarChar(50), record.user_type || null);
          request.input(`role${baseIndex}`, sql.NVarChar(255), record.role || null);
          request.input(`status${baseIndex}`, sql.NVarChar(50), record.status || null);
          request.input(`dateLastModified${baseIndex}`, sql.DateTimeOffset, record.date_last_modified ? new Date(record.date_last_modified) : null);
          request.input(`metadata${baseIndex}`, sql.NVarChar(sql.MAX), record.metadata || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert staff:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Bulk insert classes using batched parameterized inserts
   */
  async bulkInsertClasses(
    records: Array<{
      school_id?: string | null;
      sourced_id: string;
      title?: string | null;
      class_name?: string | null;
      grade_name?: string | null;
      course_code?: string | null;
      status?: string | null;
      date_last_modified?: Date | string | null;
      metadata?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      // Batch size: 100 records per batch (100 * 9 columns = 900 parameters)
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        // Use individual MERGE statements in a batch
        const mergeStatements = batch.map((record, index) => {
          const baseIndex = i + index;
          return `
            MERGE NEX.classes AS target
            USING (SELECT @sourcedId${baseIndex} AS sourced_id) AS source
            ON target.sourced_id = source.sourced_id
            WHEN MATCHED THEN
              UPDATE SET
                school_id = @schoolId${baseIndex}, title = @title${baseIndex}, class_name = @className${baseIndex},
                grade_name = @gradeName${baseIndex}, course_code = @courseCode${baseIndex}, status = @status${baseIndex},
                date_last_modified = @dateLastModified${baseIndex}, metadata = @metadata${baseIndex},
                updated_at = SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN
              INSERT (school_id, sourced_id, title, class_name, grade_name, course_code, status, date_last_modified, metadata, created_at, updated_at)
              VALUES (@schoolId${baseIndex}, @sourcedId${baseIndex}, @title${baseIndex}, @className${baseIndex},
                      @gradeName${baseIndex}, @courseCode${baseIndex}, @status${baseIndex}, @dateLastModified${baseIndex},
                      @metadata${baseIndex}, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
          `;
        }).join('\n');

        const batchQuery = mergeStatements;

        const request = transaction.request();
        batch.forEach((record, index) => {
          const baseIndex = i + index;
          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`sourcedId${baseIndex}`, sql.NVarChar(100), record.sourced_id);
          request.input(`title${baseIndex}`, sql.NVarChar(500), record.title || null);
          request.input(`className${baseIndex}`, sql.NVarChar(500), record.class_name || null);
          request.input(`gradeName${baseIndex}`, sql.NVarChar(100), record.grade_name || null);
          request.input(`courseCode${baseIndex}`, sql.NVarChar(100), record.course_code || null);
          request.input(`status${baseIndex}`, sql.NVarChar(50), record.status || null);
          request.input(`dateLastModified${baseIndex}`, sql.DateTimeOffset, record.date_last_modified ? new Date(record.date_last_modified) : null);
          request.input(`metadata${baseIndex}`, sql.NVarChar(sql.MAX), record.metadata || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert classes:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Bulk insert daily plans using batched parameterized inserts
   */
  async bulkInsertDailyPlans(
    records: Array<{
      school_id?: string | null;
      plan_date: Date | string;
      timetable_lesson_sourced_id?: string | null;
      lesson_id?: string | null;
      lesson_name?: string | null;
      subject_sourced_id?: string | null;
      subject_name?: string | null;
      class_sourced_id?: string | null;
      class_name?: string | null;
      cohort_sourced_id?: string | null;
      cohort_name?: string | null;
      teacher_sourced_id?: string | null;
      teacher_name?: string | null;
      location_sourced_id?: string | null;
      location_name?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      period_number?: number | null;
      status?: string | null;
      metadata?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      // Batch size: 100 records per batch (100 * 20 columns = 2000 parameters)
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        const values = batch.map((record, index) => {
          const baseIndex = i + index;
          return `(
            @schoolId${baseIndex}, @planDate${baseIndex}, @timetableLessonSourcedId${baseIndex}, @lessonId${baseIndex},
            @lessonName${baseIndex}, @subjectSourcedId${baseIndex}, @subjectName${baseIndex}, @classSourcedId${baseIndex},
            @className${baseIndex}, @cohortSourcedId${baseIndex}, @cohortName${baseIndex}, @teacherSourcedId${baseIndex},
            @teacherName${baseIndex}, @locationSourcedId${baseIndex}, @locationName${baseIndex}, @startTime${baseIndex},
            @endTime${baseIndex}, @periodNumber${baseIndex}, @status${baseIndex}, @metadata${baseIndex},
            SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
          )`;
        }).join(',');

        const batchQuery = `
          INSERT INTO NEX.daily_plans (
            school_id, plan_date, timetable_lesson_sourced_id, lesson_id, lesson_name,
            subject_sourced_id, subject_name, class_sourced_id, class_name,
            cohort_sourced_id, cohort_name, teacher_sourced_id, teacher_name,
            location_sourced_id, location_name, start_time, end_time, period_number,
            status, metadata, created_at, updated_at
          ) VALUES ${values};
        `;

        const request = transaction.request();
        batch.forEach((record, index) => {
          const baseIndex = i + index;
          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`planDate${baseIndex}`, sql.Date, record.plan_date instanceof Date ? record.plan_date : new Date(record.plan_date));
          request.input(`timetableLessonSourcedId${baseIndex}`, sql.NVarChar(100), record.timetable_lesson_sourced_id || null);
          request.input(`lessonId${baseIndex}`, sql.NVarChar(255), record.lesson_id || null);
          request.input(`lessonName${baseIndex}`, sql.NVarChar(500), record.lesson_name || null);
          request.input(`subjectSourcedId${baseIndex}`, sql.NVarChar(100), record.subject_sourced_id || null);
          request.input(`subjectName${baseIndex}`, sql.NVarChar(500), record.subject_name || null);
          request.input(`classSourcedId${baseIndex}`, sql.NVarChar(100), record.class_sourced_id || null);
          request.input(`className${baseIndex}`, sql.NVarChar(500), record.class_name || null);
          request.input(`cohortSourcedId${baseIndex}`, sql.NVarChar(100), record.cohort_sourced_id || null);
          request.input(`cohortName${baseIndex}`, sql.NVarChar(500), record.cohort_name || null);
          request.input(`teacherSourcedId${baseIndex}`, sql.NVarChar(100), record.teacher_sourced_id || null);
          request.input(`teacherName${baseIndex}`, sql.NVarChar(500), record.teacher_name || null);
          request.input(`locationSourcedId${baseIndex}`, sql.NVarChar(100), record.location_sourced_id || null);
          request.input(`locationName${baseIndex}`, sql.NVarChar(500), record.location_name || null);
          request.input(`startTime${baseIndex}`, sql.NVarChar(50), record.start_time || null);
          request.input(`endTime${baseIndex}`, sql.NVarChar(50), record.end_time || null);
          request.input(`periodNumber${baseIndex}`, sql.Int, record.period_number || null);
          request.input(`status${baseIndex}`, sql.NVarChar(50), record.status || null);
          request.input(`metadata${baseIndex}`, sql.NVarChar(sql.MAX), record.metadata || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert daily plans:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Bulk insert student allocations using batched parameterized inserts
   */
  async bulkInsertStudentAllocations(
    records: Array<{
      student_id?: number | null;
      student_sourced_id: string;
      school_id?: string | null;
      academic_year?: string | null;
      subject_sourced_id?: string | null;
      subject_id?: number | null;
      subject_name?: string | null;
      allocation_type?: string | null;
      cohort_sourced_id?: string | null;
      cohort_id?: number | null;
      cohort_name?: string | null;
      lesson_sourced_id?: string | null;
      lesson_id?: string | null;
      lesson_name?: string | null;
      class_id?: number | null;
      homeroom_sourced_id?: string | null;
      homeroom_class_name?: string | null;
      homeroom_grade_name?: string | null;
      group_sourced_id?: string | null;
      group_id?: number | null;
      group_name?: string | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      // Batch size: 90 records per batch (90 * 23 columns = 2070 parameters, staying under SQL Server's 2100 limit)
      const batchSize = 90;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        const values = batch.map((record, index) => {
          const baseIndex = i + index;
          return `(
            @studentId${baseIndex}, @studentSourcedId${baseIndex}, @schoolId${baseIndex}, @academicYear${baseIndex},
            @subjectSourcedId${baseIndex}, @subjectId${baseIndex}, @subjectName${baseIndex}, @allocationType${baseIndex},
            @cohortSourcedId${baseIndex}, @cohortId${baseIndex}, @cohortName${baseIndex}, @lessonSourcedId${baseIndex},
            @lessonId${baseIndex}, @lessonName${baseIndex}, @classId${baseIndex}, @homeroomSourcedId${baseIndex},
            @homeroomClassName${baseIndex}, @homeroomGradeName${baseIndex}, @groupSourcedId${baseIndex}, @groupId${baseIndex},
            @groupName${baseIndex}, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
          )`;
        }).join(',');

        const batchQuery = `
          INSERT INTO NEX.student_allocations (
            student_id, student_sourced_id, school_id, academic_year,
            subject_sourced_id, subject_id, subject_name, allocation_type,
            cohort_sourced_id, cohort_id, cohort_name,
            lesson_sourced_id, lesson_id, lesson_name, class_id,
            homeroom_sourced_id, homeroom_class_name, homeroom_grade_name,
            group_sourced_id, group_id, group_name,
            created_at, updated_at
          ) VALUES ${values};
        `;

        const request = transaction.request();
        batch.forEach((record, index) => {
          const baseIndex = i + index;
          request.input(`studentId${baseIndex}`, sql.BigInt, record.student_id || null);
          request.input(`studentSourcedId${baseIndex}`, sql.NVarChar(100), record.student_sourced_id);
          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`academicYear${baseIndex}`, sql.NVarChar(50), record.academic_year || null);
          request.input(`subjectSourcedId${baseIndex}`, sql.NVarChar(100), record.subject_sourced_id || null);
          request.input(`subjectId${baseIndex}`, sql.BigInt, record.subject_id || null);
          request.input(`subjectName${baseIndex}`, sql.NVarChar(500), record.subject_name || null);
          request.input(`allocationType${baseIndex}`, sql.NVarChar(100), record.allocation_type || null);
          request.input(`cohortSourcedId${baseIndex}`, sql.NVarChar(100), record.cohort_sourced_id || null);
          request.input(`cohortId${baseIndex}`, sql.BigInt, record.cohort_id || null);
          request.input(`cohortName${baseIndex}`, sql.NVarChar(500), record.cohort_name || null);
          request.input(`lessonSourcedId${baseIndex}`, sql.NVarChar(100), record.lesson_sourced_id || null);
          request.input(`lessonId${baseIndex}`, sql.NVarChar(255), record.lesson_id || null);
          request.input(`lessonName${baseIndex}`, sql.NVarChar(500), record.lesson_name || null);
          request.input(`classId${baseIndex}`, sql.BigInt, record.class_id || null);
          request.input(`homeroomSourcedId${baseIndex}`, sql.NVarChar(100), record.homeroom_sourced_id || null);
          request.input(`homeroomClassName${baseIndex}`, sql.NVarChar(500), record.homeroom_class_name || null);
          request.input(`homeroomGradeName${baseIndex}`, sql.NVarChar(100), record.homeroom_grade_name || null);
          request.input(`groupSourcedId${baseIndex}`, sql.NVarChar(100), record.group_sourced_id || null);
          request.input(`groupId${baseIndex}`, sql.BigInt, record.group_id || null);
          request.input(`groupName${baseIndex}`, sql.NVarChar(500), record.group_name || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert student allocations:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * Bulk insert staff allocations using batched parameterized inserts
   */
  async bulkInsertStaffAllocations(
    records: Array<{
      staff_id?: number | null;
      staff_sourced_id: string;
      school_id?: string | null;
      academic_year?: string | null;
      subject_sourced_id?: string | null;
      subject_id?: number | null;
      subject_name?: string | null;
      allocation_type?: string | null;
      cohort_sourced_id?: string | null;
      cohort_id?: number | null;
      cohort_name?: string | null;
      lesson_sourced_id?: string | null;
      lesson_id?: string | null;
      lesson_name?: string | null;
      class_id?: number | null;
    }>
  ): Promise<{ inserted: number; error: string | null }> {
    if (records.length === 0) {
      return { inserted: 0, error: null };
    }

    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);

    try {
      await transaction.begin();

      // Batch size: 100 records per batch (100 * 14 columns = 1400 parameters)
      const batchSize = 100;
      let totalInserted = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);

        const values = batch.map((record, index) => {
          const baseIndex = i + index;
          return `(
            @staffId${baseIndex}, @staffSourcedId${baseIndex}, @schoolId${baseIndex}, @academicYear${baseIndex},
            @subjectSourcedId${baseIndex}, @subjectId${baseIndex}, @subjectName${baseIndex}, @allocationType${baseIndex},
            @cohortSourcedId${baseIndex}, @cohortId${baseIndex}, @cohortName${baseIndex}, @lessonSourcedId${baseIndex},
            @lessonId${baseIndex}, @lessonName${baseIndex}, @classId${baseIndex}, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET()
          )`;
        }).join(',');

        const batchQuery = `
          INSERT INTO NEX.staff_allocations (
            staff_id, staff_sourced_id, school_id, academic_year,
            subject_sourced_id, subject_id, subject_name, allocation_type,
            cohort_sourced_id, cohort_id, cohort_name,
            lesson_sourced_id, lesson_id, lesson_name, class_id,
            created_at, updated_at
          ) VALUES ${values};
        `;

        const request = transaction.request();
        batch.forEach((record, index) => {
          const baseIndex = i + index;
          request.input(`staffId${baseIndex}`, sql.BigInt, record.staff_id || null);
          request.input(`staffSourcedId${baseIndex}`, sql.NVarChar(100), record.staff_sourced_id);
          request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
          request.input(`academicYear${baseIndex}`, sql.NVarChar(50), record.academic_year || null);
          request.input(`subjectSourcedId${baseIndex}`, sql.NVarChar(100), record.subject_sourced_id || null);
          request.input(`subjectId${baseIndex}`, sql.BigInt, record.subject_id || null);
          request.input(`subjectName${baseIndex}`, sql.NVarChar(500), record.subject_name || null);
          request.input(`allocationType${baseIndex}`, sql.NVarChar(100), record.allocation_type || null);
          request.input(`cohortSourcedId${baseIndex}`, sql.NVarChar(100), record.cohort_sourced_id || null);
          request.input(`cohortId${baseIndex}`, sql.BigInt, record.cohort_id || null);
          request.input(`cohortName${baseIndex}`, sql.NVarChar(500), record.cohort_name || null);
          request.input(`lessonSourcedId${baseIndex}`, sql.NVarChar(100), record.lesson_sourced_id || null);
          request.input(`lessonId${baseIndex}`, sql.NVarChar(255), record.lesson_id || null);
          request.input(`lessonName${baseIndex}`, sql.NVarChar(500), record.lesson_name || null);
          request.input(`classId${baseIndex}`, sql.BigInt, record.class_id || null);
        });

        try {
          await request.query(batchQuery);
          totalInserted += batch.length;

          if (batchNum % 10 === 0 || batchNum === totalBatches) {
            console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${records.length} records)`);
          }
        } catch (batchError: any) {
          console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
          throw batchError;
        }
      }

      await transaction.commit();
      return { inserted: totalInserted, error: null };
    } catch (error: any) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
      }
      console.error('   ❌ Failed to bulk insert staff allocations:', error);
      return { inserted: 0, error: error.message || 'Bulk insert failed' };
    }
  }

  /**
   * @deprecated This function is no longer used. Student fallout data is not populated
   * in RP.student_fallout table because:
   * 1. The fallout status and gender information are available directly from
   *    NEX.student_allocations and NEX.groups tables
   * 2. NEX.students table only contains current students, not historical/exited students
   * 3. The student_allocations table maintains complete historical data including
   *    students who have exited the system
   * 
   * Upsert student fallout data after student allocations are inserted
   * This is a set-based operation that updates RP.student_fallout for all students
   * based on whether they are in the 'fallout' group in student_allocations
   */
  async upsertStudentFallout(): Promise<{ updated: number; error: string | null }> {
    try {
      console.log('🔄 Upserting student fallout data...');

      const query = `
        MERGE RP.student_fallout AS target
        USING (
          SELECT 
            s.id,
            CAST(s.school_id AS NVARCHAR(100)) AS school_id,
            s.sourced_id,
            s.identifier,
            s.full_name,
            s.first_name,
            s.last_name,
            s.email,
            s.username,
            s.user_type,
            s.status,
            s.date_last_modified,
            s.academic_year,
            s.metadata,
            s.created_at,
            s.updated_at,
            s.current_grade,
            s.current_class,
            s.current_class_id,
            s.grades,
            s.phone,
            s.mobile_number,
            s.sms,
            s.gender,
            s.student_dob,
            s.religion,
            s.admission_date,
            s.join_date,
            s.parent_name,
            s.guardian_one_full_name,
            s.guardian_two_full_name,
            s.guardian_one_mobile,
            s.guardian_two_mobile,
            s.primary_contact,
            s.student_reg_id,
            s.family_code,
            s.student_national_id,
            s.student_status,
            s.class_grade,
            s.class_section,
            s.homeroom_teacher_sourced_id,
            -- Set fallout_indicator to 'fallout' if student is in fallout group, NULL otherwise
            CASE 
              WHEN sa.student_sourced_id IS NOT NULL THEN 'fallout'
              ELSE NULL 
            END AS fallout_indicator
          FROM NEX.students s
          LEFT JOIN (
            -- Get distinct students in fallout group
            SELECT DISTINCT student_sourced_id
            FROM NEX.student_allocations
            WHERE group_name = 'fallout'
          ) sa ON s.sourced_id = sa.student_sourced_id
        ) AS source
        ON target.sourced_id = source.sourced_id
        WHEN MATCHED THEN
          UPDATE SET
            id = source.id,
            school_id = source.school_id,
            identifier = source.identifier,
            full_name = source.full_name,
            first_name = source.first_name,
            last_name = source.last_name,
            email = source.email,
            username = source.username,
            user_type = source.user_type,
            status = source.status,
            date_last_modified = source.date_last_modified,
            academic_year = source.academic_year,
            metadata = source.metadata,
            created_at = source.created_at,
            updated_at = source.updated_at,
            current_grade = source.current_grade,
            current_class = source.current_class,
            current_class_id = source.current_class_id,
            grades = source.grades,
            phone = source.phone,
            mobile_number = source.mobile_number,
            sms = source.sms,
            gender = source.gender,
            student_dob = source.student_dob,
            religion = source.religion,
            admission_date = source.admission_date,
            join_date = source.join_date,
            parent_name = source.parent_name,
            guardian_one_full_name = source.guardian_one_full_name,
            guardian_two_full_name = source.guardian_two_full_name,
            guardian_one_mobile = source.guardian_one_mobile,
            guardian_two_mobile = source.guardian_two_mobile,
            primary_contact = source.primary_contact,
            student_reg_id = source.student_reg_id,
            family_code = source.family_code,
            student_national_id = source.student_national_id,
            student_status = source.student_status,
            class_grade = source.class_grade,
            class_section = source.class_section,
            homeroom_teacher_sourced_id = source.homeroom_teacher_sourced_id,
            fallout_indicator = source.fallout_indicator
        WHEN NOT MATCHED THEN
          INSERT (
            id, school_id, sourced_id, identifier, full_name, first_name, last_name,
            email, username, user_type, status, date_last_modified, academic_year,
            metadata, created_at, updated_at, current_grade, current_class, current_class_id,
            grades, phone, mobile_number, sms, gender, student_dob, religion,
            admission_date, join_date, parent_name, guardian_one_full_name, guardian_two_full_name,
            guardian_one_mobile, guardian_two_mobile, primary_contact, student_reg_id,
            family_code, student_national_id, student_status, class_grade, class_section,
            homeroom_teacher_sourced_id, fallout_indicator
          )
          VALUES (
            source.id, source.school_id, source.sourced_id, source.identifier, source.full_name,
            source.first_name, source.last_name, source.email, source.username, source.user_type,
            source.status, source.date_last_modified, source.academic_year, source.metadata,
            source.created_at, source.updated_at, source.current_grade, source.current_class,
            source.current_class_id, source.grades, source.phone, source.mobile_number, source.sms,
            source.gender, source.student_dob, source.religion, source.admission_date, source.join_date,
            source.parent_name, source.guardian_one_full_name, source.guardian_two_full_name,
            source.guardian_one_mobile, source.guardian_two_mobile, source.primary_contact,
            source.student_reg_id, source.family_code, source.student_national_id, source.student_status,
            source.class_grade, source.class_section, source.homeroom_teacher_sourced_id, source.fallout_indicator
          );
        
        SELECT @@ROWCOUNT as rows_affected;
      `;

      const result = await executeQuery<{ rows_affected: number }>(query);

      if (result.error) {
        console.error('❌ Failed to upsert student fallout:', result.error);
        return { updated: 0, error: result.error };
      }

      const rowsAffected = result.data?.[0]?.rows_affected || 0;
      console.log(`✅ Upserted ${rowsAffected} student record(s) in RP.student_fallout`);
      return { updated: rowsAffected, error: null };
    } catch (error: any) {
      console.error('❌ Failed to upsert student fallout:', error);
      return { updated: 0, error: error.message || 'Upsert failed' };
    }
  }
}

export const databaseService = new DatabaseService();

