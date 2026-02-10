/**
 * TypeScript type definitions for ManageBac API responses
 */
export interface ApiResponse<T> {
    data: T;
    success: boolean;
    message?: string;
    errors?: string[];
}
export interface SchoolDetails {
    id: number;
    subdomain: string;
    name: string;
    address: string;
    address_ii?: string;
    city: string;
    state?: string;
    zipcode?: string;
    country: string;
    timezone: string;
    language: string;
    session_in_may: boolean;
    logo?: string;
    top_nav_logo?: string;
    high_res_logo?: string;
    programs?: string[];
    enabled_programs?: Array<{
        name: string;
        code: string;
    }>;
    kbl_id?: number;
}
export interface AcademicYear {
    id: number;
    name: string;
    starts_on: string;
    ends_on: string;
    updated_at?: string;
    academic_terms?: AcademicTerm[];
}
export interface AcademicTerm {
    id: number;
    name: string;
    starts_on?: string;
    ends_on?: string;
    updated_at?: string;
    exam_grade?: boolean;
}
export interface YearGroup {
    id: number;
    name: string;
    short_name?: string;
    program: string;
    grade: string;
    grade_number: number;
    student_ids?: number[];
}
export interface Grade {
    uid: number;
    name: string;
    label: string;
    code: string;
    grade_number: number;
    program_code?: string;
    program_name?: string;
    description?: string;
    student_count?: number;
}
export interface Subject {
    id: number;
    name: string;
    group: string;
    group_id?: number;
    hl: boolean;
    sl: boolean;
    self_taught?: boolean;
    levels?: string[];
    program_code?: string;
    program?: string;
    custom?: boolean;
    enabled?: boolean;
    max_phase?: string;
}
export interface Teacher {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    department: string;
    position?: string;
    phone?: string;
    avatar_url?: string;
    is_active: boolean;
    subjects: string[];
}
export interface Student {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    student_id: string;
    grade_id: string;
    date_of_birth?: string;
    avatar_url?: string;
    parent_emails: string[];
    enrollment_date: string;
    is_active: boolean;
}
export interface Class {
    id: number;
    name: string;
    description?: string;
    uniq_id?: string;
    archived: boolean;
    language: string;
    class_section?: string;
    start_term_id?: number;
    end_term_id?: number;
    created_at: string;
    updated_at: string;
    grade: string;
    grade_number: number;
    applicable_levels: number[];
    program: string;
    program_code: string;
    lock_memberships?: string;
    subject_id: number;
    subject_name: string;
    subject_group: string;
    subject_group_id: number;
    teachers?: Array<{
        teacher_id: number;
        show_on_reports: boolean;
        teacher_archived: boolean;
    }>;
}
export interface Membership {
    id: number;
    user_id: number;
    class_id: number;
    role: string;
    level?: number;
    user_email: string;
    uniq_class_id?: string;
    uniq_student_id?: string;
    created_at: string;
    updated_at: string;
}
export interface TermGrade {
    student_id: number;
    class_id: number;
    term_id: number;
    grade?: string;
    average_percent?: number;
    comments?: string;
    created_at?: string;
    updated_at?: string;
}
export interface TermGradeRubric {
    id: number;
    title: string;
    grade?: string | null;
}
export interface TermGradeResponse {
    students: Array<{
        id: number;
        name: string;
        term_grade: {
            grade?: string | null;
            average?: {
                percent?: number;
                grade?: string;
            };
            comments?: string | null;
            rubrics?: TermGradeRubric[];
        };
    }>;
    meta?: {
        current_page: number;
        total_pages: number;
        total_count: number;
        per_page: number;
    };
}
export interface ApiError {
    code: string;
    message: string;
    details?: any;
}
//# sourceMappingURL=managebac.d.ts.map