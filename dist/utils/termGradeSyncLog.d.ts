/**
 * File logger for ManageBac term-grades sync diagnostics.
 * Writes to backend/logs/term-grades-sync.log on local dev only (not Azure).
 * Always mirrors to console.
 */
export declare function getTermGradeSyncLogPath(): string | null;
export declare function beginTermGradeSyncLog(context: {
    schoolId?: number | string;
    academicYear?: string;
    syncRunId?: number;
}): void;
export declare function logTermGradeSync(message: string): void;
export declare function warnTermGradeSync(message: string): void;
export declare function errorTermGradeSync(message: string): void;
//# sourceMappingURL=termGradeSyncLog.d.ts.map