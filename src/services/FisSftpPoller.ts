/**
 * Polls FIS SFTP unprocessed folder, loads finance files via EF upload pipeline,
 * then moves files to processed or error folders.
 *
 * Processing order per poll: all Dic* files first, then all TB* files.
 */

import { getFisSftpConfig, getFisSftpUploadedBy } from '../config/fisSftp.js';
import { processFinanceFile } from './FinanceEfUploadService.js';
import { withFisSftp, type FisSftpService, type SftpFileEntry } from './FisSftpService.js';
import {
  getFinanceFileCategory,
  resolveFinanceFileType,
} from '../utils/financeFileNameResolver.js';

export interface FisSftpPollResult {
  scanned: number;
  movedToProcessed: number;
  movedToError: number;
  skipped: number;
  errors: Array<{ file: string; message: string }>;
}

let pollInProgress = false;

interface ClassifiedFiles {
  dic: SftpFileEntry[];
  tb: SftpFileEntry[];
  unknown: SftpFileEntry[];
}

function classifyFiles(files: SftpFileEntry[]): ClassifiedFiles {
  const dic: SftpFileEntry[] = [];
  const tb: SftpFileEntry[] = [];
  const unknown: SftpFileEntry[] = [];

  for (const file of files) {
    const category = getFinanceFileCategory(file.name);
    if (category === 'DIC') dic.push(file);
    else if (category === 'TB') tb.push(file);
    else unknown.push(file);
  }

  dic.sort((a, b) => a.name.localeCompare(b.name));
  tb.sort((a, b) => a.name.localeCompare(b.name));

  return { dic, tb, unknown };
}

async function moveRemoteFile(
  sftp: FisSftpService,
  file: SftpFileEntry,
  destDir: string,
  label: 'processed' | 'error'
): Promise<{ moved: boolean; destFileName?: string; usedFallback?: boolean; message?: string }> {
  try {
    const move = await sftp.moveFileWithFallback(file.remotePath, destDir, file.name);
    if (move.usedFallback) {
      console.warn(
        `[FisSftp] Moved ${file.name} → ${label} as ${move.destFileName} (timestamp suffix; destination name already existed)`
      );
    }
    return { moved: true, destFileName: move.destFileName, usedFallback: move.usedFallback };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[FisSftp] Could not move ${file.name} to ${label}: ${message}`);
    return { moved: false, message };
  }
}

async function moveUnknownFile(
  sftp: FisSftpService,
  file: SftpFileEntry,
  errorDir: string,
  result: FisSftpPollResult
): Promise<void> {
  const message = 'Unrecognized file name (expected Dic_* or TB_* finance files)';
  const move = await moveRemoteFile(sftp, file, errorDir, 'error');
  if (move.moved) {
    result.movedToError += 1;
    result.errors.push({ file: file.name, message });
    console.warn(`[FisSftp] Moved unknown file to error: ${move.destFileName ?? file.name}`);
    return;
  }
  result.skipped += 1;
  result.errors.push({
    file: file.name,
    message: `${message}; could not move to error folder: ${move.message}`,
  });
}

async function processFinanceSftpFile(
  sftp: FisSftpService,
  file: SftpFileEntry,
  processedDir: string,
  errorDir: string,
  uploadedBy: string,
  result: FisSftpPollResult
): Promise<void> {
  const resolved = resolveFinanceFileType(file.name);
  if (!resolved) {
    const message = `Could not resolve finance file type from name: ${file.name}`;
    const move = await moveRemoteFile(sftp, file, errorDir, 'error');
    if (move.moved) {
      result.movedToError += 1;
      result.errors.push({ file: file.name, message });
      console.warn(`[FisSftp] ${message}`);
    } else {
      result.skipped += 1;
      result.errors.push({ file: file.name, message: `${message}; move failed: ${move.message}` });
    }
    return;
  }

  console.log(
    `[FisSftp] Processing ${file.name} as ${resolved.fileTypeCode} (${file.size} bytes)`
  );

  let uploadResult;
  try {
    const buffer = await sftp.downloadFile(file.remotePath);
    uploadResult = await processFinanceFile({
      fileName: file.name,
      fileBuffer: buffer,
      fileTypeCode: resolved.fileTypeCode,
      uploadedBy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push({ file: file.name, message });
    const move = await moveRemoteFile(sftp, file, errorDir, 'error');
    if (move.moved) {
      result.movedToError += 1;
      console.error(`[FisSftp] Failed ${file.name}: ${message} → error`);
    } else {
      result.skipped += 1;
      result.errors.push({
        file: file.name,
        message: `${message}; could not move to error folder: ${move.message}`,
      });
      console.error(`[FisSftp] Failed ${file.name} and could not move to error: ${move.message}`);
    }
    return;
  }

  if (uploadResult.success) {
    const move = await moveRemoteFile(sftp, file, processedDir, 'processed');
    if (move.moved) {
      result.movedToProcessed += 1;
      console.log(
        `[FisSftp] Loaded ${uploadResult.rowCount} rows from ${file.name} (upload ${uploadResult.uploadId}) → processed${move.usedFallback ? ` as ${move.destFileName}` : ''}`
      );
    } else {
      result.skipped += 1;
      result.errors.push({
        file: file.name,
        message: `Load succeeded (upload ${uploadResult.uploadId}) but could not move to processed: ${move.message}`,
      });
      console.warn(
        `[FisSftp] Loaded ${uploadResult.rowCount} rows from ${file.name} (upload ${uploadResult.uploadId}) but file remains in unprocessed: ${move.message}`
      );
    }
    return;
  }

  const message = uploadResult.errorMessage || 'Finance upload failed';
  result.errors.push({ file: file.name, message });
  const move = await moveRemoteFile(sftp, file, errorDir, 'error');
  if (move.moved) {
    result.movedToError += 1;
    console.error(
      `[FisSftp] Failed ${file.name} (upload ${uploadResult.uploadId ?? 'n/a'}): ${message} → error`
    );
  } else {
    result.skipped += 1;
    result.errors.push({
      file: file.name,
      message: `${message}; could not move to error folder: ${move.message}`,
    });
    console.error(
      `[FisSftp] Failed ${file.name} (upload ${uploadResult.uploadId ?? 'n/a'}): ${message}; could not move to error`
    );
  }
}

/**
 * List unprocessed files, load Dic then TB via EF pipeline, move to processed/error.
 */
export async function pollFisSftpUnprocessedFiles(): Promise<FisSftpPollResult> {
  const result: FisSftpPollResult = {
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
      console.log(
        `[FisSftp] Found ${files.length} file(s): ${dic.length} Dic, ${tb.length} TB, ${unknown.length} unknown`
      );

      for (const file of dic) {
        await processFinanceSftpFile(
          sftp,
          file,
          config.processedDir,
          config.errorDir,
          uploadedBy,
          result
        );
      }

      for (const file of tb) {
        await processFinanceSftpFile(
          sftp,
          file,
          config.processedDir,
          config.errorDir,
          uploadedBy,
          result
        );
      }

      for (const file of unknown) {
        await moveUnknownFile(sftp, file, config.errorDir, result);
      }
    });

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[FisSftp] Poll complete in ${elapsedMs}ms – scanned=${result.scanned}, processed=${result.movedToProcessed}, error=${result.movedToError}, skipped=${result.skipped}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.errors.push({ file: '*', message });
    console.error('[FisSftp] Poll failed:', message);
  } finally {
    pollInProgress = false;
  }

  return result;
}
