/**
 * FIS SFTP poller configuration (environment variables).
 */
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
export declare function isFisSftpPollerEnabled(): boolean;
export declare function getFisSftpCronExpression(): string;
export declare function getFisSftpUploadedBy(): string;
export declare function getFisSftpConfig(): FisSftpConfig | null;
//# sourceMappingURL=fisSftp.d.ts.map