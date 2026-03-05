/**
 * Student Assessments Methods
 * Handles fetching and saving student assessments/grade book data from Nexquare API
 * Fetches CSV or Excel file from API, parses it, and saves to database
 */
import type { NexquareConfig } from '../../middleware/configLoader.js';
import type { BaseNexquareService } from './BaseNexquareService.js';
/**
 * Get student assessment/grade book data
 * Fetches CSV file from API, parses it, and saves to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getStudentAssessments(this: BaseNexquareService, config: NexquareConfig, schoolId?: string, academicYear?: string, fileName?: string, limit?: number, offset?: number, onLog?: (msg: string) => void, options?: {
    loadRpSchema?: boolean;
}): Promise<any[]>;
/**
 * Save a batch of assessment records to database using temporary table approach
 * This is faster than batched INSERT statements as SQL Server can optimize the final insert
 * Helper function used by getStudentAssessments
 */
export declare function saveAssessmentBatch(this: BaseNexquareService, records: any[], schoolSourcedId: string | null, 
/** Schedule academic year (e.g. "2024 - 2025"). Used when Excel Academic Year missing or for consistency with RP sync. */
academicYearParam?: string): Promise<number>;
/**
 * Sync student assessments from NEX.student_assessments to RP.student_assessments
 *
 * Two-path logic:
 * - Path A (Internal): Component + term filters (SQL LIKE). For grades with subject mapping,
 *   only mapped subjects; for grades without mapping, all subjects. Captures internal exam rows.
 * - Path B (External): For grades where subject mapping exists, pull rows where subject is in
 *   mapping (no component/term filter). Captures external exam rows with non-standard component names.
 *
 * Results from both paths are combined with UNION (dedupes). After sync: deletes from
 * NEX.student_assessments for school+academic_year.
 */
export declare function syncStudentAssessmentsToRP(this: BaseNexquareService, schoolSourcedId: string, academicYear?: string): Promise<number>;
/**
 * Update reported_subject in RP.student_assessments for a specific school
 * This function updates existing records with the correct reported_subject from admin.subject_mapping
 *
 * @param schoolSourcedId - School sourced_id to filter updates
 * @returns Number of records updated
 */
export declare function updateReportedSubjectForSchool(this: BaseNexquareService, schoolSourcedId: string): Promise<number>;
//# sourceMappingURL=studentAssessments.d.ts.map