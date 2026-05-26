/**
 * Low-level SFTP client for FIS file folders.
 */
import { readFileSync } from 'fs';
import SftpClient from 'ssh2-sftp-client';
function isFileEntry(entry) {
    if (entry.name === '.' || entry.name === '..')
        return false;
    return entry.type === '-' || entry.type === 'l';
}
function joinRemotePath(dir, name) {
    const base = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    return `${base}/${name}`;
}
export class FisSftpService {
    config;
    client = new SftpClient();
    constructor(config) {
        this.config = config;
    }
    async connect() {
        const privateKey = readFileSync(this.config.privateKeyPath, 'utf8');
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
        await this.ensureDirectory(destDir);
        const destPath = joinRemotePath(destDir, fileName);
        await this.client.rename(sourcePath, destPath);
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