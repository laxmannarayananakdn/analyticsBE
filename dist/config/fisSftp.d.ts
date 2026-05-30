/**
 * FIS SFTP poller configuration (environment variables).
 */
export interface FisSftpConfig {
    host: string;
    port: number;
    username: string;
    privateKeyPath: string;
    unprocessedDir: string;
    processedDir: string;
    errorDir: string;
}
export declare function isFisSftpPollerEnabled(): boolean;
export declare function getFisSftpCronExpression(): string;
export declare function getFisSftpUploadedBy(): string;
export declare function getFisSftpConfig(): FisSftpConfig | null;
//# sourceMappingURL=fisSftp.d.ts.map