/**
 * Shared finance EF upload processing (UI upload + FIS SFTP poller).
 */

import { efService } from './EFService.js';
import { fileParserFactory } from './parsers/index.js';
import {
  FinanceDictionaryRecord,
  FinanceTrialBalanceRecord,
} from '../types/ef.js';
import { ErrorCode, UploadError } from '../types/errors.js';
import {
  validateFileExtension,
  validateFileSize,
  validateRowCount,
} from '../utils/fileValidation.js';
import { isFinanceFileTypeCode, parseTrialBalanceFileName } from '../utils/financeFileNameResolver.js';
import {
  assertHomogeneousTbStatus,
  assertTbUploadAllowed,
  isFisPhase4Enabled,
  maybeLockEntityPeriod,
  upsertTbPeriodCoverage,
} from './FISRunTrackingService.js';
export interface ProcessFinanceFileParams {
  fileName: string;
  fileBuffer: Buffer;
  fileTypeCode: string;
  uploadedBy: string;
  skipInvalidRows?: boolean;
}

export interface ProcessFinanceFileResult {
  success: boolean;
  uploadId?: number;
  rowCount?: number;
  skippedRows?: number;
  totalRows?: number;
  errorMessage?: string;
  errors?: UploadError[];
}

const FINANCE_DICTIONARY_FILE_TYPES = [
  'FIN_DIC_ACCOUNT',
  'FIN_DIC_ACTIVITY',
  'FIN_DIC_DEPARTMENT',
  'FIN_DIC_FIXED_ASSETS',
  'FIN_DIC_OPERATING_UNIT',
  'FIN_DIC_PARTY',
  'FIN_DIC_PROJECT',
  'FIN_DIC_REFERENCE',
  'FIN_DIC_REGION',
  'FIN_DIC_RESOURCE',
  'FIN_DIC_SOURCE_OF_FUND',
];

type InsertFunction = (
  uploadId: number,
  fileName: string,
  uploadedBy: string,
  records: FinanceDictionaryRecord[] | FinanceTrialBalanceRecord[]
) => Promise<number>;

const insertRegistry: Record<string, InsertFunction> = {
  FIN_DIC_ACCOUNT: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'ACCOUNT', recs as FinanceDictionaryRecord[]),
  FIN_DIC_ACTIVITY: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'ACTIVITY', recs as FinanceDictionaryRecord[]),
  FIN_DIC_DEPARTMENT: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'DEPARTMENT', recs as FinanceDictionaryRecord[]),
  FIN_DIC_FIXED_ASSETS: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'FIXED_ASSETS', recs as FinanceDictionaryRecord[]),
  FIN_DIC_OPERATING_UNIT: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'OPERATING_UNIT', recs as FinanceDictionaryRecord[]),
  FIN_DIC_PARTY: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'PARTY', recs as FinanceDictionaryRecord[]),
  FIN_DIC_PROJECT: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'PROJECT', recs as FinanceDictionaryRecord[]),
  FIN_DIC_REFERENCE: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'REFERENCE', recs as FinanceDictionaryRecord[]),
  FIN_DIC_REGION: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'REGION', recs as FinanceDictionaryRecord[]),
  FIN_DIC_RESOURCE: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'RESOURCE', recs as FinanceDictionaryRecord[]),
  FIN_DIC_SOURCE_OF_FUND: (id, name, by, recs) =>
    efService.insertFINDictionary(id, name, by, 'SOURCE_OF_FUND', recs as FinanceDictionaryRecord[]),
  FIN_TB_ACTUAL: (id, name, by, recs) =>
    efService.insertFINTrialBalance(id, name, by, 'ACTUAL', recs as FinanceTrialBalanceRecord[]),
  FIN_TB_BUDGET: (id, name, by, recs) =>
    efService.insertFINTrialBalance(id, name, by, 'BUDGET', recs as FinanceTrialBalanceRecord[]),
};

async function deleteExistingFinanceData(fileTypeUpper: string, fileName: string): Promise<void> {
  if (FINANCE_DICTIONARY_FILE_TYPES.includes(fileTypeUpper)) {
    const dictionaryType = fileTypeUpper.replace('FIN_DIC_', '');
    await efService.deleteAllFINDictionaryByType(dictionaryType);
    return;
  }
  if (fileTypeUpper === 'FIN_TB_ACTUAL') {
    await efService.deleteFINTrialBalanceByFileName(fileName, 'ACTUAL');
    return;
  }
  if (fileTypeUpper === 'FIN_TB_BUDGET') {
    await efService.deleteFINTrialBalanceByFileName(fileName, 'BUDGET');
  }
}

/**
 * Parse and load a finance file into FIN.* tables with EF.Uploads audit row.
 */
export async function processFinanceFile(
  params: ProcessFinanceFileParams
): Promise<ProcessFinanceFileResult> {
  const {
    fileName,
    fileBuffer,
    fileTypeCode,
    uploadedBy,
    skipInvalidRows = false,
  } = params;

  const fileTypeUpper = fileTypeCode.toUpperCase();
  let uploadId: number | null = null;

  if (!isFinanceFileTypeCode(fileTypeUpper)) {
    return {
      success: false,
      errorMessage: `Not a finance file type: ${fileTypeCode}`,
      errors: [{
        code: ErrorCode.INVALID_FILE_TYPE,
        message: `Not a finance file type: ${fileTypeCode}`,
        step: 'VALIDATION',
      }],
    };
  }

  try {
    const fileTypes = await efService.getActiveFileTypes();
    const fileType = fileTypes.find((ft) => ft.type_code.toUpperCase() === fileTypeUpper);
    if (!fileType) {
      return {
        success: false,
        errorMessage: `File type code "${fileTypeCode}" not found or inactive`,
        errors: [{
          code: ErrorCode.INVALID_FILE_TYPE,
          message: `File type code "${fileTypeCode}" not found or inactive`,
          step: 'VALIDATION',
        }],
      };
    }

    const fileSize = fileBuffer.length;
    const sizeError = validateFileSize(fileSize);
    if (sizeError) {
      return { success: false, errorMessage: sizeError.message, errors: [sizeError] };
    }

    const expectedExtension = `.${fileType.file_extension.toLowerCase()}`;
    const extensionError = validateFileExtension(fileName, expectedExtension);
    if (extensionError) {
      return { success: false, errorMessage: extensionError.message, errors: [extensionError] };
    }

    uploadId = await efService.createUpload(fileTypeCode, fileName, fileSize, uploadedBy);

    const parseResult = await fileParserFactory.parseFile(fileTypeCode, fileBuffer, skipInvalidRows);

    if (!parseResult.valid) {
      if (parseResult.data && parseResult.data.length > 0) {
        const rowCountError = validateRowCount(parseResult.data.length);
        if (rowCountError) {
          parseResult.errors.push(rowCountError);
        }
      }

      const errorMessage = parseResult.errors.map((e) => e.message).join('; ');
      await efService.updateUploadStatus(
        uploadId,
        'FAILED',
        parseResult.data?.length || 0,
        errorMessage
      );

      return {
        success: false,
        uploadId,
        errorMessage,
        errors: parseResult.errors,
      };
    }

    const records = parseResult.data;
    if (!records || records.length === 0) {
      const error: UploadError = {
        code: ErrorCode.INSUFFICIENT_ROWS,
        message: 'No valid records found in file',
        step: 'VALIDATE_DATA',
      };
      await efService.updateUploadStatus(uploadId, 'FAILED', 0, error.message);
      return { success: false, uploadId, errorMessage: error.message, errors: [error] };
    }

    const rowCountError = validateRowCount(records.length);
    if (rowCountError) {
      await efService.updateUploadStatus(uploadId, 'FAILED', records.length, rowCountError.message);
      return {
        success: false,
        uploadId,
        errorMessage: rowCountError.message,
        errors: [rowCountError],
      };
    }

    let tbFileStatus: ReturnType<typeof assertHomogeneousTbStatus> | undefined;
    if (fileTypeUpper === 'FIN_TB_ACTUAL' || fileTypeUpper === 'FIN_TB_BUDGET') {
      const parsed = parseTrialBalanceFileName(fileName);
      if (!parsed?.entityCode || !parsed.periodYyyymm) {
        const message =
          `Cannot parse entity/period from trial balance filename "${fileName}". ` +
          'Expected TB_YYYYMM_ENTITY_Actual|Budget.xlsx';
        await efService.updateUploadStatus(uploadId, 'FAILED', records.length, message);
        return { success: false, uploadId, errorMessage: message };
      }
      if (isFisPhase4Enabled()) {
        await assertTbUploadAllowed(parsed.entityCode, parsed.periodYyyymm);
        tbFileStatus = assertHomogeneousTbStatus(records as FinanceTrialBalanceRecord[]);
      }
    }

    await deleteExistingFinanceData(fileTypeUpper, fileName);

    const insertFunction = insertRegistry[fileTypeUpper];
    if (!insertFunction) {
      throw new Error(`Unsupported finance file type: ${fileTypeCode}`);
    }

    const rowCount = await insertFunction(
      uploadId,
      fileName,
      uploadedBy,
      records as FinanceDictionaryRecord[] | FinanceTrialBalanceRecord[]
    );
    await efService.updateUploadStatus(uploadId, 'COMPLETED', rowCount);

    if (fileTypeUpper === 'FIN_TB_ACTUAL' || fileTypeUpper === 'FIN_TB_BUDGET') {
      console.log(
        `[FinanceEfUpload] TB loaded to FIN.TrialBalance only (${rowCount} rows, upload ${uploadId}). ` +
          'No FIS report instance or admin.fis_report_columns changes.'
      );

      if (isFisPhase4Enabled()) {
        const parsed = parseTrialBalanceFileName(fileName);
        if (parsed?.entityCode && parsed.periodYyyymm && tbFileStatus) {
          const tbType = fileTypeUpper === 'FIN_TB_BUDGET' ? 'BUDGET' : 'ACTUAL';
          await upsertTbPeriodCoverage({
            entityCode: parsed.entityCode,
            period: parsed.periodYyyymm,
            tbType,
            uploadId,
            fileName,
            fileStatus: tbFileStatus,
            rowCount,
          });
          await maybeLockEntityPeriod(parsed.entityCode, parsed.periodYyyymm, uploadedBy);
        }
      }
    }

    return {
      success: true,
      uploadId,
      rowCount,
      skippedRows: parseResult.skippedRows || 0,
      totalRows: parseResult.totalRows || rowCount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (uploadId !== null) {
      try {
        await efService.updateUploadStatus(uploadId, 'FAILED', undefined, message);
      } catch (updateError) {
        console.error('[FinanceEfUpload] Failed to update upload status:', updateError);
      }
    }
    return {
      success: false,
      uploadId: uploadId ?? undefined,
      errorMessage: message,
      errors: [{
        code: ErrorCode.UNKNOWN_ERROR,
        message,
        step: 'UNKNOWN',
      }],
    };
  }
}
