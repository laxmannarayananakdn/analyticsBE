/**
 * Load and normalize SFTP private key material (file or env).
 */
import { existsSync, readFileSync } from 'fs';
export function normalizePrivateKey(raw) {
    let key = raw.trim();
    if (key.startsWith('"') && key.endsWith('"')) {
        key = key.slice(1, -1);
    }
    if (key.includes('\\r\\n')) {
        key = key.replace(/\\r\\n/g, '\n');
    }
    if (key.includes('\\r')) {
        key = key.replace(/\\r/g, '\n');
    }
    if (key.includes('\\n')) {
        key = key.replace(/\\n/g, '\n');
    }
    // Normalize Windows newlines if present.
    key = key.replace(/\r\n/g, '\n');
    return key.trim();
}
export function isValidPrivateKeyPem(key) {
    return /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----/.test(key);
}
function decodeBase64IfPem(raw) {
    try {
        const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
        if (isValidPrivateKeyPem(decoded)) {
            return decoded;
        }
    }
    catch {
        // Ignore decode errors; caller will handle validation.
    }
    return raw;
}
/**
 * Prefer FIS_SFTP_PRIVATE_KEY env (Key Vault reference on Azure), else read from file path.
 */
export function loadFisSftpPrivateKey(privateKeyPath) {
    const fromEnv = process.env.FIS_SFTP_PRIVATE_KEY;
    if (fromEnv?.trim()) {
        const key = decodeBase64IfPem(normalizePrivateKey(fromEnv));
        if (isValidPrivateKeyPem(key)) {
            return key;
        }
        console.warn('[FisSftp] FIS_SFTP_PRIVATE_KEY is set but does not look like a PEM private key');
    }
    if (!existsSync(privateKeyPath)) {
        throw new Error(`Private key file not found: ${privateKeyPath}`);
    }
    const key = decodeBase64IfPem(normalizePrivateKey(readFileSync(privateKeyPath, 'utf8')));
    if (!isValidPrivateKeyPem(key)) {
        throw new Error(`Invalid private key at ${privateKeyPath}. Expected PEM (-----BEGIN ... PRIVATE KEY-----). ` +
            'If stored in Key Vault, use raw PEM (real line breaks), or a base64-encoded PEM.');
    }
    return key;
}
//# sourceMappingURL=fisSftpKey.js.map