/**
 * Load and normalize SFTP private key material (file or env).
 */
export declare function normalizePrivateKey(raw: string): string;
export declare function isValidPrivateKeyPem(key: string): boolean;
/**
 * Prefer FIS_SFTP_PRIVATE_KEY env (Key Vault reference on Azure), else read from file path.
 */
export declare function loadFisSftpPrivateKey(privateKeyPath: string): string;
//# sourceMappingURL=fisSftpKey.d.ts.map