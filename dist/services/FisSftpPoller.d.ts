/**
 * Polls FIS SFTP unprocessed folder, loads finance files via EF upload pipeline,
 * then moves files to processed or error folders.
 *
 * Processing order per poll: all Dic* files first, then all TB* files.
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
 * List unprocessed files, load Dic then TB via EF pipeline, move to processed/error.
 */
export declare function pollFisSftpUnprocessedFiles(): Promise<FisSftpPollResult>;
//# sourceMappingURL=FisSftpPoller.d.ts.map