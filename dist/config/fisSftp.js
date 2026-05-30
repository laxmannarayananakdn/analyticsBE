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
export function getFisSftpUploadedBy() {
    return process.env.FIS_SFTP_UPLOADED_BY?.trim() || 'sftp@aks';
}
export function getFisSftpConfig() {
    if (!isFisSftpPollerEnabled()) {
        return null;
    }
    const host = process.env.FIS_SFTP_HOST?.trim();
    const username = process.env.FIS_SFTP_USERNAME?.trim();
    const privateKeyPath = process.env.FIS_SFTP_PRIVATE_KEY_PATH?.trim();
    const privateKeyFromEnv = process.env.FIS_SFTP_PRIVATE_KEY?.trim();
    if (!host || !username) {
        console.error('[FisSftp] ENABLE_FIS_SFTP_POLLER=true but FIS_SFTP_HOST or FIS_SFTP_USERNAME is missing');
        return null;
    }
    if (!privateKeyFromEnv && !privateKeyPath) {
        console.error('[FisSftp] Provide either FIS_SFTP_PRIVATE_KEY (recommended) or FIS_SFTP_PRIVATE_KEY_PATH');
        return null;
    }
    // Path is optional when key is injected via FIS_SFTP_PRIVATE_KEY.
    // Keep a fallback path for compatibility with file-based startup scripts.
    const resolvedKeyPath = privateKeyPath
        ? resolve(privateKeyPath)
        : '/home/site/secrets/akssftp_key.pem';
    if (!privateKeyFromEnv && !existsSync(resolvedKeyPath)) {
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