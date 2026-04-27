/**
 * EF Service
 * Handles all database operations for External Files Upload System
 */
import { FileType, Upload, UploadStatus, IBExternalExam, MSNAVFinancialAid, CEMPredictionReport, CEMSubjectLevelAnalysis, HREmployeeData, HRBudgetVsActual, FinanceDictionaryRecord, FinanceTrialBalanceRecord } from '../types/ef.js';
export declare class EFService {
    private static readonly FINANCE_DICTIONARY_CODES;
    /**
     * Get MB (ManageBac) schools for MSNAV Financial Aid upload dropdown.
     * MSNAV data is for MB schools only; UCI matches MB.students.uniq_student_id.
     */
    getMBSchools(): Promise<Array<{
        school_id: string;
        school_name: string;
    }>>;
    /**
     * Get all active file types
     */
    getActiveFileTypes(): Promise<FileType[]>;
    /**
     * Create a new upload record
     * @param schoolId Required for MSNAV_FINANCIAL_AID; used to trigger RP refresh for the school
     * @returns The ID of the created upload
     */
    createUpload(fileTypeCode: string, fileName: string, fileSize: number, uploadedBy?: string, schoolId?: string | null): Promise<number>;
    /**
     * Update upload status
     */
    updateUploadStatus(uploadId: number, status: UploadStatus, rowCount?: number, errorMessage?: string): Promise<void>;
    /**
     * Insert IB External Exams records using bulk insert
     */
    insertIBExternalExams(uploadId: number, fileName: string, uploadedBy: string, records: IBExternalExam[]): Promise<number>;
    /**
     * Insert MSNAV Financial Aid records using bulk insert
     */
    insertMSNAVFinancialAid(uploadId: number, fileName: string, uploadedBy: string, records: MSNAVFinancialAid[]): Promise<number>;
    /**
     * Insert CEM Prediction Report records using bulk insert
     */
    insertCEMPredictionReport(uploadId: number, fileName: string, uploadedBy: string, records: CEMPredictionReport[]): Promise<number>;
    /**
     * Insert CEM Subject Level Analysis records using bulk insert
     */
    insertCEMSubjectLevelAnalysis(uploadId: number, fileName: string, uploadedBy: string, records: CEMSubjectLevelAnalysis[]): Promise<number>;
    /**
     * Delete all rows from EF.HR_EmployeeData (for overwrite before new upload)
     */
    deleteAllHREmployeeData(): Promise<void>;
    /**
     * Delete all rows from EF.HR_BudgetVsActual (for overwrite before new upload)
     */
    deleteAllHRBudgetVsActual(): Promise<void>;
    /**
     * Insert HR Employee Data records using bulk insert
     */
    insertHREmployeeData(uploadId: number, fileName: string, uploadedBy: string, records: HREmployeeData[]): Promise<number>;
    /**
     * Insert HR Budget vs Actual records using bulk insert
     */
    insertHRBudgetVsActual(uploadId: number, fileName: string, uploadedBy: string, records: HRBudgetVsActual[]): Promise<number>;
    deleteAllFINDictionaryByType(dictionaryType: string): Promise<void>;
    deleteAllFINTrialBalanceByType(tbType: 'ACTUAL' | 'BUDGET'): Promise<void>;
    insertFINDictionary(uploadId: number, fileName: string, uploadedBy: string, dictionaryType: string, records: FinanceDictionaryRecord[]): Promise<number>;
    insertFINTrialBalance(uploadId: number, fileName: string, uploadedBy: string, tbType: 'ACTUAL' | 'BUDGET', records: FinanceTrialBalanceRecord[]): Promise<number>;
    /** File types that support Promote to RP (EF → reporting tables). */
    private static readonly PROMOTABLE_TO_RP;
    /**
     * Promote completed upload to RP schema (copy EF data to RP mart table).
     * @param mode replace: clear RP mart table then load this upload; append: insert this upload without clearing RP.
     */
    promoteUploadToRP(uploadId: number, mode?: 'replace' | 'append'): Promise<{
        rowCount: number;
        fileType: string;
        mode: 'replace' | 'append';
    }>;
    /**
     * Trigger RP refresh after MSNAV Financial Aid upload.
     * Gets school_id from upload and academic_year from uploaded MSNAV data,
     * then triggers the full RP refresh pipeline in the background.
     */
    triggerRPRefreshAfterMsnavUpload(uploadId: number): Promise<{
        school_id: string;
        academic_year: string;
    } | null>;
    /**
     * Get upload by ID
     */
    getUploadById(uploadId: number): Promise<Upload | null>;
    /**
     * Get recent uploads
     */
    getRecentUploads(fileTypeCode?: string, limit?: number): Promise<Upload[]>;
    /**
     * Get upload data (paginated)
     * Returns data from the appropriate table based on upload's file type
     */
    getUploadData(uploadId: number, page?: number, limit?: number, search?: string): Promise<{
        data: any[];
        total: number;
        page: number;
        limit: number;
    }>;
    /**
     * Delete an upload and its associated data
     * Uses dynamic table name from FileTypes.target_table for extensibility
     */
    deleteUpload(uploadId: number): Promise<void>;
}
export declare const efService: EFService;
//# sourceMappingURL=EFService.d.ts.map