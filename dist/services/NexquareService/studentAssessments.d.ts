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
export declare function getStudentAssessments(this: BaseNexquareService, config: NexquareConfig, schoolId?: string, academicYear?: string, fileName?: string, limit?: number, offset?: number, onLog?: (msg: string) => void): Promise<any[]>;
/**
 * Save a batch of assessment records to database using temporary table approach
 * This is faster than batched INSERT statements as SQL Server can optimize the final insert
 * Helper function used by getStudentAssessments
 */
export declare function saveAssessmentBatch(this: BaseNexquareService, records: any[], schoolSourcedId: string | null): Promise<number>;
/**
 * Sync student assessments from NEX.student_assessments to RP.student_assessments
 * This function runs after the main processing completes
 * Filters by school_id, grades '10' and '12', and only inserts records that don't already exist
 *
 * Note: school_id in NEX.student_assessments is NVARCHAR(100) and stores the sourced_id
 */
export declare function syncStudentAssessmentsToRP(this: BaseNexquareService, schoolSourcedId: string): Promise<number>;
/**
 * Update reported_subject in RP.student_assessments for a specific school
 * This function updates existing records with the correct reported_subject from RP.subject_mapping
 *
 * @param schoolSourcedId - School sourced_id to filter updates
 * @returns Number of records updated
 */
export declare function updateReportedSubjectForSchool(this: BaseNexquareService, schoolSourcedId: string): Promise<number>;
//# sourceMappingURL=studentAssessments.d.ts.map