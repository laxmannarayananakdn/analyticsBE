/**
 * EF Service
 * Handles all database operations for External Files Upload System
 */
import { FileType, Upload, UploadStatus, IBExternalExam, MSNAVFinancialAid, CEMPredictionReport, CEMSubjectLevelAnalysis, HREmployeeData, HRBudgetVsActual } from '../types/ef.js';
export declare class EFService {
    /**
     * Get all active file types
     */
    getActiveFileTypes(): Promise<FileType[]>;
    /**
     * Create a new upload record
     * @returns The ID of the created upload
     */
    createUpload(fileTypeCode: string, fileName: string, fileSize: number, uploadedBy?: string): Promise<number>;
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
    /**
     * Promote HR upload to RP schema (copy EF data to RP, full replace)
     */
    promoteUploadToRP(uploadId: number): Promise<{
        rowCount: number;
        fileType: string;
    }>;
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
    getUploadData(uploadId: number, page?: number, limit?: number): Promise<{
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