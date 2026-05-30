/**
 * Low-level SFTP client for FIS file folders.
 */
import { extname, basename } from 'path';
import SftpClient from 'ssh2-sftp-client';
import { loadFisSftpPrivateKey } from '../config/fisSftpKey.js';
function isFileEntry(entry) {
    if (entry.name === '.' || entry.name === '..')
        return false;
    return entry.type === '-' || entry.type === 'l';
}
function joinRemotePath(dir, name) {
    const base = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    return `${base}/${name}`;
}
export function withTimestampSuffix(fileName, date = new Date()) {
    const ext = extname(fileName);
    const base = basename(fileName, ext);
    const ts = date.toISOString().replace(/[:.]/g, '-');
    return `${base}_${ts}${ext}`;
}
export class FisSftpService {
    config;
    client = new SftpClient();
    constructor(config) {
        this.config = config;
    }
    async connect() {
        const privateKey = loadFisSftpPrivateKey(this.config.privateKeyPath);
        await this.client.connect({
            host: this.config.host,
            port: this.config.port,
            username: this.config.username,
            privateKey,
            readyTimeout: 30_000,
        });
    }
    async disconnect() {
        await this.client.end();
    }
    async listFiles(remoteDir) {
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
    async ensureDirectory(remoteDir) {
        const exists = await this.client.exists(remoteDir);
        if (!exists) {
            await this.client.mkdir(remoteDir, true);
        }
    }
    async moveFile(sourcePath, destDir, fileName) {
        await this.moveFileWithFallback(sourcePath, destDir, fileName);
    }
    /**
     * Move a remote file, retrying with a timestamp suffix if the destination name already exists.
     */
    async moveFileWithFallback(sourcePath, destDir, fileName) {
        await this.ensureDirectory(destDir);
        try {
            await this.client.rename(sourcePath, joinRemotePath(destDir, fileName));
            return { destFileName: fileName, usedFallback: false };
        }
        catch (firstErr) {
            const fallbackName = withTimestampSuffix(fileName);
            try {
                await this.client.rename(sourcePath, joinRemotePath(destDir, fallbackName));
                return { destFileName: fallbackName, usedFallback: true };
            }
            catch (secondErr) {
                const firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr);
                const secondMessage = secondErr instanceof Error ? secondErr.message : String(secondErr);
                throw new Error(`Rename failed for ${fileName} and ${fallbackName}: ${firstMessage}; fallback: ${secondMessage}`);
            }
        }
    }
    async downloadFile(remotePath) {
        const data = await this.client.get(remotePath);
        if (Buffer.isBuffer(data)) {
            return data;
        }
        throw new Error(`Unexpected SFTP download response for ${remotePath}`);
    }
}
export async function withFisSftp(config, fn) {
    const service = new FisSftpService(config);
    await service.connect();
    try {
        return await fn(service);
    }
    finally {
        await service.disconnect();
    }
}
//# sourceMappingURL=FisSftpService.js.map