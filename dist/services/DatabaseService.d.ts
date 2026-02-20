/**
 * Database Service
 * Handles all database operations with Azure SQL Database
 */
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
    nationalities?: string;
    languages?: string;
    timezone?: string;
    ui_language?: string;
    student_id?: string;
    identifier?: string;
    oa_id?: string;
    withdrawn_on?: Date;
    photo_url?: string;
    homeroom_advisor_id?: number;
    attendance_start_date?: Date;
    parent_ids?: string;
    additional_homeroom_advisor_ids?: string;
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
export declare class DatabaseService {
    private gradesConstraintChecked;
    /**
     * Upsert school data
     */
    upsertSchool(school: School): Promise<{
        data: School | null;
        error: string | null;
    }>;
    /**
     * Upsert programs for a school
     */
    upsertPrograms(programs: Array<{
        name: string;
        code: string;
    }>, schoolId: number): Promise<{
        data: any[] | null;
        error: string | null;
    }>;
    /**
     * Ensure grades table supports multiple rows per program/grade number by dropping legacy constraints
     */
    private ensureGradesConstraintAllowsMultipleEntries;
    /**
     * Upsert grades for a school
     */
    upsertGrades(grades: Grade[], schoolId: number): Promise<{
        data: Grade[] | null;
        error: string | null;
    }>;
    /**
     * Upsert subject groups
     */
    upsertSubjectGroups(groups: SubjectGroupRecord[], schoolId: number): Promise<{
        data: SubjectGroupRecord[] | null;
        error: string | null;
    }>;
    /**
     * Upsert subjects
     */
    upsertSubjects(subjects: SubjectRecord[], schoolId: number): Promise<{
        data: SubjectRecord[] | null;
        error: string | null;
    }>;
    /**
     * Upsert year groups
     */
    upsertYearGroups(yearGroups: YearGroupRecord[], schoolId: number): Promise<{
        data: YearGroupRecord[] | null;
        error: string | null;
    }>;
    /**
     * Get all year groups for a school from the database
     */
    getYearGroupsForSchool(schoolId: number): Promise<YearGroupRecord[]>;
    /**
     * Get all grades for a school from the database
     */
    getGradesForSchool(schoolId: number): Promise<Array<Pick<Grade, 'id' | 'program_code' | 'grade_number'>>>;
    /**
     * Get academic terms for a school
     */
    getAcademicTermsForSchool(schoolId: number): Promise<AcademicTermRecord[]>;
    /**
     * Get distinct class IDs that have at least one membership (for term grades sync)
     * @param filters - Optional: grade_number (filter by year groups with this grade), class_id (single class only), school_id (required when grade_number used)
     */
    getDistinctClassesWithMemberships(filters?: {
        grade_number?: number;
        class_id?: number;
        school_id?: number;
    }): Promise<number[]>;
    /**
     * Get class memberships for students in a year group (limited to first N students)
     */
    getClassMembershipsForYearGroup(yearGroupId: number, limitStudents?: number): Promise<Array<{
        class_id: number;
        user_id: number;
        role: string;
    }>>;
    /**
     * Get class details by ID
     */
    getClassById(classId: number): Promise<ClassRecord | null>;
    /**
     * Get academic terms within a date range
     */
    getAcademicTermsInRange(startTermId: number | null, endTermId: number | null): Promise<AcademicTermRecord[]>;
    /**
     * Upsert year group - student relationship
     */
    upsertYearGroupStudent(yearGroupId: number, studentId: number): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Get students for a specific year group
     */
    getStudentsForYearGroup(yearGroupId: number): Promise<Student[]>;
    /**
     * Upsert classes
     */
    upsertClasses(classes: ClassRecord[], schoolId: number): Promise<{
        data: ClassRecord[] | null;
        error: string | null;
    }>;
    /**
     * Upsert class memberships
     */
    upsertClassMemberships(memberships: ClassMembershipRecord[]): Promise<{
        data: ClassMembershipRecord[] | null;
        error: string | null;
    }>;
    /**
     * Upsert academic years for a program
     */
    upsertAcademicYears(academicYears: AcademicYear[], schoolId: number, programCode: string): Promise<{
        data: AcademicYear[] | null;
        error: string | null;
    }>;
    /**
     * Upsert academic terms for an academic year
     */
    upsertAcademicTerms(terms: AcademicTermRecord[], academicYearId: number): Promise<{
        data: AcademicTermRecord[] | null;
        error: string | null;
    }>;
    /**
     * Get school by ID
     */
    getSchool(schoolId: number): Promise<{
        data: School | null;
        error: string | null;
    }>;
    /**
     * Upsert students
     */
    upsertStudents(students: Student[]): Promise<{
        data: Student[] | null;
        error: string | null;
    }>;
    /**
     * Get students by school ID
     */
    getStudents(schoolId?: number, filters?: {
        archived?: boolean;
        grade_id?: number;
        year_group_id?: number;
    }): Promise<{
        data: Student[] | null;
        error: string | null;
    }>;
    /**
     * Bulk upsert ManageBac students using batched MERGE (much faster than one-by-one)
     */
    bulkUpsertManageBacStudents(students: Student[], onProgress?: (current: number, total: number, batchNum: number, totalBatches: number) => void): Promise<{
        upserted: number;
        error: string | null;
    }>;
    /**
     * Upsert teachers (MB.users + MB.teachers)
     * Teachers must exist in MB.users first (FK constraint)
     */
    upsertTeachers(teachers: Array<Record<string, any>>, schoolId: number, onLog?: (msg: string) => void): Promise<{
        data: any[] | null;
        error: string | null;
    }>;
    /**
     * Upsert term grades
     */
    upsertTermGrades(termGrades: TermGrade[]): Promise<{
        data: TermGrade[] | null;
        error: string | null;
    }>;
    /**
     * Upsert term grade rubrics
     */
    upsertTermGradeRubrics(rubrics: TermGradeRubric[]): Promise<{
        data: TermGradeRubric[] | null;
        error: string | null;
    }>;
    /**
     * Get analytics data - student metrics
     */
    getStudentMetrics(): Promise<{
        totalStudents: number;
        averageGrade: number;
        attendanceRate: number;
    }>;
    /**
     * Get subject performance data
     */
    getSubjectPerformance(): Promise<Array<{
        subject: string;
        averageGrade: number;
        studentCount: number;
    }>>;
    /**
     * Get student vs class average data
     */
    getStudentVsClassAverage(): Promise<Array<{
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
    }>>;
    /**
     * Get performance data by program
     */
    getPerformanceByProgram(): Promise<Array<{
        program: string;
        averageGrade: number;
        studentCount: number;
    }>>;
    /**
     * Get attendance data by grade level
     */
    getAttendanceByGrade(): Promise<Array<{
        grade: string;
        attendanceRate: number;
        studentCount: number;
    }>>;
    /**
     * Get student demographics by nationality
     */
    getStudentDemographics(): Promise<Array<{
        nationality: string;
        studentCount: number;
    }>>;
    /**
     * Get performance trends over time
     */
    getPerformanceTrends(): Promise<Array<{
        term: string;
        allStudents: number;
        financialAidRecipients: number;
    }>>;
    /**
     * Get financial aid distribution
     */
    getFinancialAidDistribution(): Promise<{
        receivingAid: number;
        noAid: number;
    }>;
    /**
     * Upsert school data in NEX schema
     */
    upsertNexquareSchool(school: {
        sourced_id: string;
        name: string;
        identifier?: string | null;
        status?: string | null;
        type?: string | null;
        date_last_modified?: Date | string | null;
        metadata?: string | null;
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Get Nexquare school by sourced_id
     */
    getNexquareSchool(sourcedId: string): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert student data in NEX schema
     */
    upsertNexquareStudent(student: {
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
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert staff data in NEX schema
     */
    upsertNexquareStaff(staff: {
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
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert class data in NEX schema
     */
    upsertNexquareClass(classData: {
        school_id?: string | null;
        sourced_id: string;
        title?: string | null;
        class_name?: string | null;
        grade_name?: string | null;
        course_code?: string | null;
        status?: string | null;
        date_last_modified?: Date | string | null;
        metadata?: string | null;
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert allocation master data in NEX schema
     */
    upsertNexquareAllocationMaster(allocation: {
        school_id?: string | null;
        sourced_id?: string | null;
        allocation_type?: string | null;
        entity_type?: string | null;
        entity_sourced_id?: string | null;
        entity_name?: string | null;
        status?: string | null;
        date_last_modified?: Date | string | null;
        metadata?: string | null;
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert subject data in NEX schema
     */
    upsertNexquareSubject(subject: {
        school_id?: string | null;
        sourced_id: string;
        subject_id?: number | null;
        subject_name: string;
        status?: string | null;
        date_last_modified?: Date | string | null;
        metadata?: string | null;
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert cohort data in NEX schema
     */
    upsertNexquareCohort(cohort: {
        school_id?: string | null;
        sourced_id: string;
        cohort_id?: number | null;
        cohort_name: string;
        status?: string | null;
        date_last_modified?: Date | string | null;
        metadata?: string | null;
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert group data in NEX schema
     */
    upsertNexquareGroup(group: {
        school_id?: string | null;
        sourced_id: string;
        group_name: string;
        unique_key?: string | null;
        status?: string | null;
        date_last_modified?: Date | string | null;
        metadata?: string | null;
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert homeroom data in NEX schema
     */
    upsertNexquareHomeroom(homeroom: {
        school_id?: string | null;
        sourced_id: string;
        class_name?: string | null;
        grade_name?: string | null;
        status?: string | null;
        date_last_modified?: Date | string | null;
        metadata?: string | null;
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert student allocation data in NEX schema
     * Creates one record per subject/cohort/lesson allocation
     */
    upsertNexquareStudentAllocation(allocation: {
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
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert staff allocation data in NEX schema
     * Creates one record per subject/cohort/lesson allocation
     */
    upsertNexquareStaffAllocation(allocation: {
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
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert daily plan data in NEX schema
     */
    upsertNexquareDailyPlan(plan: {
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
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert timetable lesson student data in NEX schema
     */
    upsertNexquareTimetableLessonStudent(record: {
        timetable_lesson_id?: number | null;
        timetable_lesson_sourced_id: string;
        student_id?: number | null;
        student_sourced_id: string;
        school_id?: string | null;
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert daily attendance data in NEX schema
     */
    upsertNexquareDailyAttendance(attendance: {
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
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert lesson attendance data in NEX schema
     */
    upsertNexquareLessonAttendance(attendance: {
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
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Upsert Nexquare student assessment record
     */
    upsertNexquareStudentAssessment(assessment: {
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
    }): Promise<{
        data: any | null;
        error: string | null;
    }>;
    /**
     * Bulk insert daily attendance records using transaction
     * Much faster than row-by-row inserts
     */
    bulkInsertDailyAttendance(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Bulk insert lesson attendance records using transaction
     * Much faster than row-by-row inserts
     */
    bulkInsertLessonAttendance(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Ultra-fast bulk insert using temporary table approach
     * This method uses a temp table to batch insert, which can be faster for very large datasets
     * Uses parameterized queries for safety
     */
    bulkInsertDailyAttendanceViaTempTable(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Ultra-fast bulk insert for lesson attendance using temporary table approach
     * This method uses a temp table to batch insert, which can be faster for very large datasets
     * Uses parameterized queries for safety
     */
    bulkInsertLessonAttendanceViaTempTable(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Bulk insert students using batched parameterized inserts
     */
    bulkInsertStudents(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Bulk insert staff using batched parameterized inserts
     */
    bulkInsertStaff(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Bulk insert classes using batched parameterized inserts
     */
    bulkInsertClasses(records: Array<{
        school_id?: string | null;
        sourced_id: string;
        title?: string | null;
        class_name?: string | null;
        grade_name?: string | null;
        course_code?: string | null;
        status?: string | null;
        date_last_modified?: Date | string | null;
        metadata?: string | null;
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Bulk insert daily plans using batched parameterized inserts
     */
    bulkInsertDailyPlans(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Bulk insert student allocations using batched parameterized inserts
     */
    bulkInsertStudentAllocations(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
    /**
     * Bulk insert staff allocations using batched parameterized inserts
     */
    bulkInsertStaffAllocations(records: Array<{
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
    }>): Promise<{
        inserted: number;
        error: string | null;
    }>;
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
    upsertStudentFallout(): Promise<{
        updated: number;
        error: string | null;
    }>;
}
export declare const databaseService: DatabaseService;
//# sourceMappingURL=DatabaseService.d.ts.map