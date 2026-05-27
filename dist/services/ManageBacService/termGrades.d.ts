/**
 * Term Grades Methods
 * Handles fetching and saving term grades from ManageBac API
 */
import type { TermGradeResponse } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function getTermGrades(this: BaseManageBacService, apiKey: string, classId: number, termId: number, baseUrl?: string, options?: {
    allowedStudentIds?: Set<number>;
}): Promise<TermGradeResponse>;
export type SyncAllTermGradesOptions = {
    grade_number?: number;
    term_id?: number;
    class_id?: number;
    school_id?: number;
    /** Sync schedule / manual run academic year (matches admin.mb_term_grade_rubric_config) */
    academic_year?: string;
    /** Optional: extra program filter; leave empty to scope by grade_number only */
    program_codes?: string[];
    /** Apply default grade 13 scope using currentSchoolId when true */
    dp_grade_13_only?: boolean;
    /** Explicit term allow-list; overrides config lookup when set */
    allowed_term_ids?: number[];
};
export declare function syncAllTermGrades(this: BaseManageBacService, apiKey: string, baseUrl?: string, options?: SyncAllTermGradesOptions): Promise<{
    classesProcessed: number;
    classesSkipped: number;
    totalCombinations: number;
    termGradesFetched: number;
    errors: number;
    details: Array<{
        classId: number;
        className: string;
        termId: number;
        termName: string;
        count: number;
        error?: string;
    }>;
}>;
export declare function syncTermGradesForYearGroup(this: BaseManageBacService, apiKey: string, yearGroupId: number): Promise<void>;
//# sourceMappingURL=termGrades.d.ts.map