/**
 * Load and normalize SFTP private key material (file or env).
 */

import { existsSync, readFileSync } from 'fs';

export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  return key.trim();
}

export function isValidPrivateKeyPem(key: string): boolean {
  return /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----/.test(key);
}

/**
 * Prefer FIS_SFTP_PRIVATE_KEY env (Key Vault reference on Azure), else read from file path.
 */
export function loadFisSftpPrivateKey(privateKeyPath: string): string {
  const fromEnv = process.env.FIS_SFTP_PRIVATE_KEY;
  
  if (fromEnv?.trim()) {
    const key = normalizePrivateKey(fromEnv);
    if (isValidPrivateKeyPem(key)) {
      return key;
    }
    console.warn('[FisSftp] FIS_SFTP_PRIVATE_KEY is set but does not look like a PEM private key');
  }

  if (!existsSync(privateKeyPath)) {
    throw new Error(`Private key file not found: ${privateKeyPath}`);
  }

  const key = normalizePrivateKey(readFileSync(privateKeyPath, 'utf8'));
  
  if (!isValidPrivateKeyPem(key)) {
    throw new Error(
      `Invalid private key at ${privateKeyPath}. Expected PEM (-----BEGIN ... PRIVATE KEY-----). ` +
        'If stored in Key Vault, paste the key with real line breaks, not literal \\n characters.'
    );
  }

  return key;
}
