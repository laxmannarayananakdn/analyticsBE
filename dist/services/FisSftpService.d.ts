/**
 * Low-level SFTP client for FIS file folders.
 */
import type { FisSftpConfig } from '../config/fisSftp.js';
export interface SftpFileEntry {
    name: string;
    remotePath: string;
    size: number;
    modifyTime?: number;
}
export declare function withTimestampSuffix(fileName: string, date?: Date): string;
export interface MoveFileResult {
    destFileName: string;
    usedFallback: boolean;
}
export declare class FisSftpService {
    private readonly config;
    private client;
    constructor(config: FisSftpConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    listFiles(remoteDir: string): Promise<SftpFileEntry[]>;
    ensureDirectory(remoteDir: string): Promise<void>;
    moveFile(sourcePath: string, destDir: string, fileName: string): Promise<void>;
    /**
     * Move a remote file, retrying with a timestamp suffix if the destination name already exists.
     */
    moveFileWithFallback(sourcePath: string, destDir: string, fileName: string): Promise<MoveFileResult>;
    downloadFile(remotePath: string): Promise<Buffer>;
}
export declare function withFisSftp<T>(config: FisSftpConfig, fn: (service: FisSftpService) => Promise<T>): Promise<T>;
//# sourceMappingURL=FisSftpService.d.ts.map