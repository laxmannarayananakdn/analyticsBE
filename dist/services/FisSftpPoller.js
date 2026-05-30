/**
 * Polls FIS SFTP unprocessed folder, loads finance files via EF upload pipeline,
 * then moves files to processed or error folders.
 *
 * Processing order per poll: all Dic* files first, then all TB* files.
 */
import { getFisSftpConfig, getFisSftpUploadedBy } from '../config/fisSftp.js';
import { processFinanceFile } from './FinanceEfUploadService.js';
import { withFisSftp } from './FisSftpService.js';
import { getFinanceFileCategory, resolveFinanceFileType, } from '../utils/financeFileNameResolver.js';
let pollInProgress = false;
function classifyFiles(files) {
    const dic = [];
    const tb = [];
    const unknown = [];
    for (const file of files) {
        const category = getFinanceFileCategory(file.name);
        if (category === 'DIC')
            dic.push(file);
        else if (category === 'TB')
            tb.push(file);
        else
            unknown.push(file);
    }
    dic.sort((a, b) => a.name.localeCompare(b.name));
    tb.sort((a, b) => a.name.localeCompare(b.name));
    return { dic, tb, unknown };
}
async function moveUnknownFile(sftp, file, errorDir, result) {
    const message = 'Unrecognized file name (expected Dic_* or TB_* finance files)';
    try {
        await sftp.moveFile(file.remotePath, errorDir, file.name);
        result.movedToError += 1;
        result.errors.push({ file: file.name, message });
        console.warn(`[FisSftp] Moved unknown file to error: ${file.name}`);
    }
    catch (err) {
        const moveMessage = err instanceof Error ? err.message : String(err);
        result.skipped += 1;
        result.errors.push({
            file: file.name,
            message: `${message}; could not move to error folder: ${moveMessage}`,
        });
    }
}
async function processFinanceSftpFile(sftp, file, processedDir, errorDir, uploadedBy, result) {
    const resolved = resolveFinanceFileType(file.name);
    if (!resolved) {
        const message = `Could not resolve finance file type from name: ${file.name}`;
        try {
            await sftp.moveFile(file.remotePath, errorDir, file.name);
            result.movedToError += 1;
            result.errors.push({ file: file.name, message });
            console.warn(`[FisSftp] ${message}`);
        }
        catch (err) {
            const moveMessage = err instanceof Error ? err.message : String(err);
            result.skipped += 1;
            result.errors.push({ file: file.name, message: `${message}; move failed: ${moveMessage}` });
        }
        return;
    }
    console.log(`[FisSftp] Processing ${file.name} as ${resolved.fileTypeCode} (${file.size} bytes)`);
    try {
        const buffer = await sftp.downloadFile(file.remotePath);
        const uploadResult = await processFinanceFile({
            fileName: file.name,
            fileBuffer: buffer,
            fileTypeCode: resolved.fileTypeCode,
            uploadedBy,
        });
        if (uploadResult.success) {
            await sftp.moveFile(file.remotePath, processedDir, file.name);
            result.movedToProcessed += 1;
            console.log(`[FisSftp] Loaded ${uploadResult.rowCount} rows from ${file.name} (upload ${uploadResult.uploadId}) → processed`);
            return;
        }
        await sftp.moveFile(file.remotePath, errorDir, file.name);
        result.movedToError += 1;
        const message = uploadResult.errorMessage || 'Finance upload failed';
        result.errors.push({ file: file.name, message });
        console.error(`[FisSftp] Failed ${file.name} (upload ${uploadResult.uploadId ?? 'n/a'}): ${message} → error`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ file: file.name, message });
        try {
            await sftp.moveFile(file.remotePath, errorDir, file.name);
            result.movedToError += 1;
            console.error(`[FisSftp] Failed ${file.name}: ${message} → error`);
        }
        catch (moveErr) {
            const moveMessage = moveErr instanceof Error ? moveErr.message : String(moveErr);
            result.skipped += 1;
            result.errors.push({
                file: file.name,
                message: `${message}; could not move to error folder: ${moveMessage}`,
            });
            console.error(`[FisSftp] Failed ${file.name} and could not move to error: ${moveMessage}`);
        }
    }
}
/**
 * List unprocessed files, load Dic then TB via EF pipeline, move to processed/error.
 */
export async function pollFisSftpUnprocessedFiles() {
    const result = {
        scanned: 0,
        movedToProcessed: 0,
        movedToError: 0,
        skipped: 0,
        errors: [],
    };
    const config = getFisSftpConfig();
    if (!config) {
        return result;
    }
    if (pollInProgress) {
        console.warn('[FisSftp] Poll already in progress – skipping this run');
        return result;
    }
    pollInProgress = true;
    const startedAt = Date.now();
    const uploadedBy = getFisSftpUploadedBy();
    try {
        await withFisSftp(config, async (sftp) => {
            const files = await sftp.listFiles(config.unprocessedDir);
            result.scanned = files.length;
            if (files.length === 0) {
                console.log('[FisSftp] No files in unprocessed folder');
                return;
            }
            const { dic, tb, unknown } = classifyFiles(files);
            console.log(`[FisSftp] Found ${files.length} file(s): ${dic.length} Dic, ${tb.length} TB, ${unknown.length} unknown`);
            for (const file of dic) {
                await processFinanceSftpFile(sftp, file, config.processedDir, config.errorDir, uploadedBy, result);
            }
            for (const file of tb) {
                await processFinanceSftpFile(sftp, file, config.processedDir, config.errorDir, uploadedBy, result);
            }
            for (const file of unknown) {
                await moveUnknownFile(sftp, file, config.errorDir, result);
            }
        });
        const elapsedMs = Date.now() - startedAt;
        console.log(`[FisSftp] Poll complete in ${elapsedMs}ms – scanned=${result.scanned}, processed=${result.movedToProcessed}, error=${result.movedToError}, skipped=${result.skipped}`);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ file: '*', message });
        console.error('[FisSftp] Poll failed:', message);
    }
    finally {
        pollInProgress = false;
    }
    return result;
}
//# sourceMappingURL=FisSftpPoller.js.map