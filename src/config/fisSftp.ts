/**
 * FIS SFTP poller configuration (environment variables).
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

export interface FisSftpConfig {
  host: string;
  port: number;
  username: string;
  /** Password auth (preferred when set via FIS_SFTP_PASSWORD). */
  password?: string;
  /** Private key file path when using key-based auth. */
  privateKeyPath?: string;
  unprocessedDir: string;
  processedDir: string;
  errorDir: string;
}

const DEFAULT_UNPROCESSED = '/aksfisreports/FIS/UnprocessedFilesNew';
const DEFAULT_PROCESSED = '/aksfisreports/FIS/ProcessedFilesNew';
const DEFAULT_ERROR = '/aksfisreports/FIS/ErrorFilesNew';

export function isFisSftpPollerEnabled(): boolean {
  return process.env.ENABLE_FIS_SFTP_POLLER === 'true';
}

export function getFisSftpCronExpression(): string {
  return process.env.FIS_SFTP_CRON || '*/5 * * * *';
}

export function getFisSftpUploadedBy(): string {
  return process.env.FIS_SFTP_UPLOADED_BY?.trim() || 'sftp@aks';
}

export function getFisSftpConfig(): FisSftpConfig | null {
  if (!isFisSftpPollerEnabled()) {
    return null;
  }

  const host = process.env.FIS_SFTP_HOST?.trim();
  const username = process.env.FIS_SFTP_USERNAME?.trim();
  const password = process.env.FIS_SFTP_PASSWORD?.trim();
  const privateKeyPath = process.env.FIS_SFTP_PRIVATE_KEY_PATH?.trim();
  const privateKeyFromEnv = process.env.FIS_SFTP_PRIVATE_KEY?.trim();

  if (!host || !username) {
    console.error(
      '[FisSftp] ENABLE_FIS_SFTP_POLLER=true but FIS_SFTP_HOST or FIS_SFTP_USERNAME is missing'
    );
    return null;
  }

  const usePasswordAuth = Boolean(password);
  const useKeyAuth = Boolean(privateKeyFromEnv || privateKeyPath);

  if (!usePasswordAuth && !useKeyAuth) {
    console.error(
      '[FisSftp] Provide FIS_SFTP_PASSWORD or FIS_SFTP_PRIVATE_KEY / FIS_SFTP_PRIVATE_KEY_PATH'
    );
    return null;
  }

  let resolvedKeyPath: string | undefined;
  if (useKeyAuth && !usePasswordAuth) {
    // Path is optional when key is injected via FIS_SFTP_PRIVATE_KEY.
    // Keep a fallback path for compatibility with file-based startup scripts.
    resolvedKeyPath = privateKeyPath
      ? resolve(privateKeyPath)
      : '/home/site/secrets/akssftp_key.pem';

    if (!privateKeyFromEnv && !existsSync(resolvedKeyPath)) {
      console.error(`[FisSftp] Private key file not found: ${resolvedKeyPath}`);
      return null;
    }
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
    password: usePasswordAuth ? password : undefined,
    privateKeyPath: resolvedKeyPath,
    unprocessedDir: process.env.FIS_SFTP_UNPROCESSED_DIR?.trim() || DEFAULT_UNPROCESSED,
    processedDir: process.env.FIS_SFTP_PROCESSED_DIR?.trim() || DEFAULT_PROCESSED,
    errorDir: process.env.FIS_SFTP_ERROR_DIR?.trim() || DEFAULT_ERROR,
  };
}
