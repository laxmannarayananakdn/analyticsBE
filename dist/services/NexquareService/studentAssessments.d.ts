/**
 * Student Assessments Methods
 * Handles fetching and saving student assessments/grade book data from Nexquare API
 * Fetches CSV or Excel file from API, parses it, and saves to database
 */
import type { NexquareConfig } from '../../middleware/configLoader';
import type { BaseNexquareService } from './BaseNexquareService';
/**
 * Get student assessment/grade book data
 * Fetches CSV file from API, parses it, and saves to database
 * Can be added to a class that extends BaseNexquareService
 */
export declare function getStudentAssessments(this: BaseNexquareService, config: NexquareConfig, schoolId?: string, academicYear?: string, fileName?: string, limit?: number, offset?: number): Promise<any[]>;
/**
 * Save a batch of assessment records to database using temporary table approach
 * This is faster than batched INSERT statements as SQL Server can optimize the final insert
 * Helper function used by getStudentAssessments
 */
export declare function saveAssessmentBatch(this: BaseNexquareService, records: any[], schoolSourcedId: string | null): Promise<number>;
//# sourceMappingURL=studentAssessments.d.ts.map