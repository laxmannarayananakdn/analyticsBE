/**
 * Polls FIS SFTP unprocessed folder and moves files after a processing step.
 * Processing is a stub for now; file parsing/load will be added later.
 */
import { getFisSftpConfig } from '../config/fisSftp.js';
import { withFisSftp } from './FisSftpService.js';
let pollInProgress = false;
async function processFileStub(file) {
    console.log(`[FisSftp] Processing stub for ${file.name} (${file.size} bytes) – no-op until parsers are wired`);
}
/**
 * List unprocessed files, run the processing stub, then move to processed (or error on failure).
 */
export async function pollFisSftpUnprocessedFiles() {
    const result = {
        scanned: 0,
        movedToProcessed: 0,
        movedToError: 0,
        skipped: 0,
        errors: [],
    };
    const config = getFisSftpConfig();
    if (!config) {
        return result;
    }
    if (pollInProgress) {
        console.warn('[FisSftp] Poll already in progress – skipping this run');
        return result;
    }
    pollInProgress = true;
    const startedAt = Date.now();
    try {
        await withFisSftp(config, async (sftp) => {
            const files = await sftp.listFiles(config.unprocessedDir);
            result.scanned = files.length;
            if (files.length === 0) {
                console.log('[FisSftp] No files in unprocessed folder');
                return;
            }
            console.log(`[FisSftp] Found ${files.length} file(s) in ${config.unprocessedDir}`);
            for (const file of files) {
                try {
                    await processFileStub(file);
                    await sftp.moveFile(file.remotePath, config.processedDir, file.name);
                    result.movedToProcessed += 1;
                    console.log(`[FisSftp] Moved to processed: ${file.name}`);
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    result.errors.push({ file: file.name, message });
                    result.skipped += 1;
                    console.error(`[FisSftp] Failed on ${file.name} (left in unprocessed; error folder not used yet):`, message);
                }
            }
        });
        const elapsedMs = Date.now() - startedAt;
        console.log(`[FisSftp] Poll complete in ${elapsedMs}ms – scanned=${result.scanned}, processed=${result.movedToProcessed}, error=${result.movedToError}, skipped=${result.skipped}`);
    }
    finally {
        pollInProgress = false;
    }
    return result;
}
//# sourceMappingURL=FisSftpPoller.js.map