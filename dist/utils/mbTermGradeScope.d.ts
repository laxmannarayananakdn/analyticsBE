export type MbTermGradeSyncScope = {
    grade_number: number;
    school_id: number;
    program_codes: string[];
};
/** Default scope for scheduled MB sync: DP students in grade_number 13. */
export declare function defaultMbTermGradeSyncScope(schoolId: number): MbTermGradeSyncScope;
/** SQL fragment: restrict MB.year_groups rows to Diploma Programme. */
export declare function yearGroupDpProgramSql(alias?: string, programCodes?: string[]): string;
//# sourceMappingURL=mbTermGradeScope.d.ts.map