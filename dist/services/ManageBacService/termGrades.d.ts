/**
 * Term Grades Methods
 * Handles fetching and saving term grades from ManageBac API
 */
import type { TermGradeResponse } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function getTermGrades(this: BaseManageBacService, apiKey: string, classId: number, termId: number, baseUrl?: string): Promise<TermGradeResponse>;
export declare function syncAllTermGrades(this: BaseManageBacService, apiKey: string, baseUrl?: string, options?: {
    grade_number?: number;
    term_id?: number;
    class_id?: number;
    school_id?: number;
}): Promise<{
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