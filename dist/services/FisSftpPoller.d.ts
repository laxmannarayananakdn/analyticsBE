/**
 * Polls FIS SFTP unprocessed folder and moves files after a processing step.
 * Processing is a stub for now; file parsing/load will be added later.
 */
export interface FisSftpPollResult {
    scanned: number;
    movedToProcessed: number;
    movedToError: number;
    skipped: number;
    errors: Array<{
        file: string;
        message: string;
    }>;
}
/**
 * List unprocessed files, run the processing stub, then move to processed (or error on failure).
 */
export declare function pollFisSftpUnprocessedFiles(): Promise<FisSftpPollResult>;
//# sourceMappingURL=FisSftpPoller.d.ts.map