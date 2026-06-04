/**
 * Shared finance EF upload processing (UI upload + FIS SFTP poller).
 */
import { UploadError } from '../types/errors.js';
export interface ProcessFinanceFileParams {
    fileName: string;
    fileBuffer: Buffer;
    fileTypeCode: string;
    uploadedBy: string;
    skipInvalidRows?: boolean;
}
export interface ProcessFinanceFileResult {
    success: boolean;
    uploadId?: number;
    rowCount?: number;
    skippedRows?: number;
    totalRows?: number;
    errorMessage?: string;
    errors?: UploadError[];
    /** Present when TB load succeeded but FIS column sync did not */
    fisSyncWarning?: string;
}
/**
 * Parse and load a finance file into FIN.* tables with EF.Uploads audit row.
 */
export declare function processFinanceFile(params: ProcessFinanceFileParams): Promise<ProcessFinanceFileResult>;
//# sourceMappingURL=FinanceEfUploadService.d.ts.map