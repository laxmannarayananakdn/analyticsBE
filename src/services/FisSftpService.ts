/**
 * Low-level SFTP client for FIS file folders.
 */

import { extname, basename } from 'path';
import SftpClient from 'ssh2-sftp-client';
import type { FisSftpConfig } from '../config/fisSftp.js';
import { loadFisSftpPrivateKey } from '../config/fisSftpKey.js';

export interface SftpFileEntry {
  name: string;
  remotePath: string;
  size: number;
  modifyTime?: number;
}

function isFileEntry(entry: { type: string; name: string }): boolean {
  if (entry.name === '.' || entry.name === '..') return false;
  return entry.type === '-' || entry.type === 'l';
}

function joinRemotePath(dir: string, name: string): string {
  const base = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  return `${base}/${name}`;
}

export function withTimestampSuffix(fileName: string, date = new Date()): string {
  const ext = extname(fileName);
  const base = basename(fileName, ext);
  const ts = date.toISOString().replace(/[:.]/g, '-');
  return `${base}_${ts}${ext}`;
}

export interface MoveFileResult {
  destFileName: string;
  usedFallback: boolean;
}

export class FisSftpService {
  private client = new SftpClient();

  constructor(private readonly config: FisSftpConfig) {}

  async connect(): Promise<void> {
    const connectOptions: {
      host: string;
      port: number;
      username: string;
      readyTimeout: number;
      password?: string;
      privateKey?: string;
    } = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      readyTimeout: 30_000,
    };

    if (this.config.password) {
      connectOptions.password = this.config.password;
    } else if (this.config.privateKeyPath) {
      connectOptions.privateKey = loadFisSftpPrivateKey(this.config.privateKeyPath);
    } else {
      throw new Error('[FisSftp] No authentication credentials configured');
    }

    await this.client.connect(connectOptions);
  }

  async disconnect(): Promise<void> {
    await this.client.end();
  }

  async listFiles(remoteDir: string): Promise<SftpFileEntry[]> {
    const entries = await this.client.list(remoteDir);
    return entries
      .filter(isFileEntry)
      .map((entry) => ({
        name: entry.name,
        remotePath: joinRemotePath(remoteDir, entry.name),
        size: entry.size,
        modifyTime: entry.modifyTime,
      }));
  }

  async ensureDirectory(remoteDir: string): Promise<void> {
    const exists = await this.client.exists(remoteDir);
    if (!exists) {
      await this.client.mkdir(remoteDir, true);
    }
  }

  async moveFile(sourcePath: string, destDir: string, fileName: string): Promise<void> {
    await this.moveFileWithFallback(sourcePath, destDir, fileName);
  }

  /**
   * Move a remote file, retrying with a timestamp suffix if the destination name already exists.
   */
  async moveFileWithFallback(
    sourcePath: string,
    destDir: string,
    fileName: string
  ): Promise<MoveFileResult> {
    await this.ensureDirectory(destDir);

    try {
      await this.client.rename(sourcePath, joinRemotePath(destDir, fileName));
      return { destFileName: fileName, usedFallback: false };
    } catch (firstErr) {
      const fallbackName = withTimestampSuffix(fileName);
      try {
        await this.client.rename(sourcePath, joinRemotePath(destDir, fallbackName));
        return { destFileName: fallbackName, usedFallback: true };
      } catch (secondErr) {
        const firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr);
        const secondMessage = secondErr instanceof Error ? secondErr.message : String(secondErr);
        throw new Error(
          `Rename failed for ${fileName} and ${fallbackName}: ${firstMessage}; fallback: ${secondMessage}`
        );
      }
    }
  }

  async downloadFile(remotePath: string): Promise<Buffer> {
    const data = await this.client.get(remotePath);
    if (Buffer.isBuffer(data)) {
      return data;
    }
    throw new Error(`Unexpected SFTP download response for ${remotePath}`);
  }
}

export async function withFisSftp<T>(
  config: FisSftpConfig,
  fn: (service: FisSftpService) => Promise<T>
): Promise<T> {
  const service = new FisSftpService(config);
  await service.connect();
  try {
    return await fn(service);
  } finally {
    await service.disconnect();
  }
}
