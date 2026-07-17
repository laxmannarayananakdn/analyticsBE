/**
 * Post-MB→RP verification for RP.vw_IB_SchoolAvg_vs_Global.
 * Non-blocking: logs warnings when the view has no row for the synced school/year.
 */
export interface IbSchoolAvgVerificationInput {
    schoolId: string;
    academicYearRp: string;
    totalPointsRowsAffected?: number;
    ibTotalCandidates?: number;
}
export interface IbSchoolAvgVerificationResult {
    present: boolean;
    viewRowCount: number;
    totalPointsCount: number;
    hints: string[];
}
export declare function verifyIbSchoolAvgVsGlobalAfterMbSync(input: IbSchoolAvgVerificationInput): Promise<IbSchoolAvgVerificationResult>;
export declare function logIbSchoolAvgVerification(schoolId: string, academicYearRp: string, result: IbSchoolAvgVerificationResult): void;
//# sourceMappingURL=IbSchoolAvgVerificationService.d.ts.map