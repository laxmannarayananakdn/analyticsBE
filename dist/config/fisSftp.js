/**
 * FIS SFTP poller configuration (environment variables).
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
const DEFAULT_UNPROCESSED = '/FIS/Development/UnprocessedFilesNew';
const DEFAULT_PROCESSED = '/FIS/Development/ProcessedFilesNew';
const DEFAULT_ERROR = '/FIS/Development/ErrorFilesNew';
export function isFisSftpPollerEnabled() {
    return process.env.ENABLE_FIS_SFTP_POLLER === 'true';
}
export function getFisSftpCronExpression() {
    return process.env.FIS_SFTP_CRON || '*/5 * * * *';
}
export function getFisSftpConfig() {
    if (!isFisSftpPollerEnabled()) {
        return null;
    }
    const host = process.env.FIS_SFTP_HOST?.trim();
    const username = process.env.FIS_SFTP_USERNAME?.trim();
    const privateKeyPath = process.env.FIS_SFTP_PRIVATE_KEY_PATH?.trim();
    if (!host || !username || !privateKeyPath) {
        console.error('[FisSftp] ENABLE_FIS_SFTP_POLLER=true but FIS_SFTP_HOST, FIS_SFTP_USERNAME, or FIS_SFTP_PRIVATE_KEY_PATH is missing');
        return null;
    }
    const resolvedKeyPath = resolve(privateKeyPath);
    if (!existsSync(resolvedKeyPath)) {
        console.error(`[FisSftp] Private key file not found: ${resolvedKeyPath}`);
        return null;
    }
    const port = Number(process.env.FIS_SFTP_PORT || '22');
    if (!Number.isFinite(port) || port <= 0) {
        console.error(`[FisSftp] Invalid FIS_SFTP_PORT: ${process.env.FIS_SFTP_PORT}`);
        return null;
    }
    return {
        host,
        port,
        username,
        privateKeyPath: resolvedKeyPath,
        unprocessedDir: process.env.FIS_SFTP_UNPROCESSED_DIR?.trim() || DEFAULT_UNPROCESSED,
        processedDir: process.env.FIS_SFTP_PROCESSED_DIR?.trim() || DEFAULT_PROCESSED,
        errorDir: process.env.FIS_SFTP_ERROR_DIR?.trim() || DEFAULT_ERROR,
    };
}
//# sourceMappingURL=fisSftp.js.map