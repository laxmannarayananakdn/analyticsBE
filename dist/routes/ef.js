/**
 * EF (External Files) Upload API Routes
 */
import { Router } from 'express';
import * as path from 'path';
import { efService } from '../services/EFService.js';
import { fileParserFactory } from '../services/parsers/index.js';
import { validateFileSize, validateFileExtension, validateMimeType, validateRowCount } from '../utils/fileValidation.js';
import { ErrorCode } from '../types/errors.js';
// Import multer - using default import with esModuleInterop
// @ts-ignore - multer is CommonJS but esModuleInterop handles it
import multer from 'multer';
const router = Router();
// Configure multer for file uploads
// Store files in memory for processing
const storage = multer.memoryStorage();
// Get max file size from env or use default (10MB)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: (req, file, cb) => {
        // Accept CSV, XLSX, and XLS files (XLS for CEM file types)
        const allowedExtensions = ['.csv', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file type. Allowed types: ${allowedExtensions.join(', ')}`));
        }
    }
});
/**
 * GET /api/ef/file-types
 * Returns list of active file types for dropdown
 */
router.get('/file-types', async (req, res) => {
    try {
        console.log('📋 Fetching active file types...');
        const fileTypes = await efService.getActiveFileTypes();
        res.json({ fileTypes });
    }
    catch (error) {
        console.error('❌ Error fetching file types:', error);
        res.status(500).json({
            error: 'Failed to fetch file types',
            message: error.message
        });
    }
});
/**
 * GET /api/ef/mb-schools
 * Returns MB (ManageBac) schools for MSNAV Financial Aid upload dropdown.
 * MSNAV is for MB schools only; UCI matches MB.students.uniq_student_id.
 */
router.get('/mb-schools', async (req, res) => {
    try {
        const schools = await efService.getMBSchools();
        res.json({ schools });
    }
    catch (error) {
        console.error('❌ Error fetching MB schools:', error);
        res.status(500).json({
            error: 'Failed to fetch MB schools',
            message: error.message
        });
    }
});
/**
 * POST /api/ef/upload
 * Upload and process a file
 */
router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({
                code: ErrorCode.INVALID_FILE_TYPE,
                message: err.message || 'File upload error',
                errors: [{
                        code: ErrorCode.INVALID_FILE_TYPE,
                        message: err.message || 'File upload failed',
                        step: 'VALIDATION'
                    }]
            });
        }
        next();
    });
}, async (req, res) => {
    let uploadId = null;
    const validationErrors = [];
    try {
        // Validate required fields
        if (!req.file) {
            return res.status(400).json({
                code: ErrorCode.INVALID_FILE_TYPE,
                message: 'No file provided',
                errors: [{
                        code: ErrorCode.INVALID_FILE_TYPE,
                        message: 'Please provide a file to upload',
                        step: 'VALIDATION'
                    }]
            });
        }
        const fileTypeCode = req.body.fileTypeCode;
        if (!fileTypeCode) {
            return res.status(400).json({
                code: ErrorCode.INVALID_FILE_TYPE,
                message: 'File type code is required',
                errors: [{
                        code: ErrorCode.INVALID_FILE_TYPE,
                        message: 'Please provide fileTypeCode. Use GET /api/ef/file-types to see available types.',
                        step: 'VALIDATION'
                    }]
            });
        }
        const uploadedBy = req.body.uploadedBy || 'Admin';
        const schoolId = req.body.schoolId ?? req.body.school_id ?? null;
        const skipInvalidRows = req.body.skipInvalidRows === 'true' || req.body.skipInvalidRows === true;
        const fileName = req.file.originalname;
        const fileBuffer = req.file.buffer;
        const fileSize = req.file.size;
        const fileExtension = path.extname(fileName).toLowerCase();
        const mimeType = req.file.mimetype;
        console.log(`📤 Uploading file: ${fileName} (${fileSize} bytes), type: ${fileTypeCode}`);
        // Step 1: Validate file type code exists
        const fileTypes = await efService.getActiveFileTypes();
        const fileType = fileTypes.find(ft => ft.type_code.toUpperCase() === fileTypeCode.toUpperCase());
        if (!fileType) {
            return res.status(400).json({
                code: ErrorCode.INVALID_FILE_TYPE,
                message: `File type code "${fileTypeCode}" not found or inactive`,
                errors: [{
                        code: ErrorCode.INVALID_FILE_TYPE,
                        message: `File type code "${fileTypeCode}" not found or inactive`,
                        step: 'VALIDATION'
                    }]
            });
        }
        // Step 2: Validate file size
        const sizeError = validateFileSize(fileSize);
        if (sizeError) {
            validationErrors.push(sizeError);
        }
        // Step 3: Validate file extension matches expected
        const expectedExtension = `.${fileType.file_extension.toLowerCase()}`;
        const extensionError = validateFileExtension(fileName, expectedExtension);
        if (extensionError) {
            validationErrors.push(extensionError);
        }
        // Step 4: Validate MIME type (if available)
        const mimeError = validateMimeType(mimeType, expectedExtension);
        if (mimeError) {
            validationErrors.push(mimeError);
        }
        // If we have validation errors, return them
        if (validationErrors.length > 0) {
            return res.status(400).json({
                code: ErrorCode.INVALID_FILE_TYPE,
                message: 'File validation failed',
                errors: validationErrors
            });
        }
        // Step 3: Create upload record with status 'PROCESSING'
        // schoolId required for MSNAV_FINANCIAL_AID (stored on upload; used when promoting to RP / refresh)
        const isMsnav = fileTypeCode.toUpperCase() === 'MSNAV_FINANCIAL_AID';
        if (isMsnav && !schoolId) {
            return res.status(400).json({
                code: ErrorCode.INVALID_FILE_TYPE,
                message: 'schoolId is required for MSNAV Financial Aid uploads',
                errors: [{
                        code: ErrorCode.INVALID_FILE_TYPE,
                        message: 'Please provide schoolId when uploading MSNAV Financial Aid files',
                        step: 'VALIDATION'
                    }]
            });
        }
        uploadId = await efService.createUpload(fileTypeCode, fileName, fileSize, uploadedBy, schoolId || undefined);
        console.log(`✅ Created upload record: ${uploadId}`);
        // Step 5: Parse the file using appropriate parser
        console.log(`📝 Parsing file...`);
        const parseResult = await fileParserFactory.parseFile(fileTypeCode, fileBuffer, skipInvalidRows);
        if (!parseResult.valid) {
            // Validate row count if we have data
            if (parseResult.data && parseResult.data.length > 0) {
                const rowCountError = validateRowCount(parseResult.data.length);
                if (rowCountError) {
                    parseResult.errors.push(rowCountError);
                }
            }
            // Update upload status with errors
            if (uploadId !== null) {
                const errorMessage = parseResult.errors
                    .map(e => e.message)
                    .join('; ');
                await efService.updateUploadStatus(uploadId, 'FAILED', parseResult.data?.length || 0, errorMessage);
            }
            return res.status(400).json({
                code: ErrorCode.PARSE_ERROR,
                message: 'File parsing or validation failed',
                errors: parseResult.errors,
                skippedRows: parseResult.skippedRows,
                totalRows: parseResult.totalRows,
                uploadId: uploadId
            });
        }
        const records = parseResult.data;
        if (!records || records.length === 0) {
            const error = {
                code: ErrorCode.INSUFFICIENT_ROWS,
                message: 'No valid records found in file',
                step: 'VALIDATE_DATA'
            };
            if (uploadId !== null) {
                await efService.updateUploadStatus(uploadId, 'FAILED', 0, error.message);
            }
            return res.status(400).json({
                code: ErrorCode.INSUFFICIENT_ROWS,
                message: error.message,
                errors: [error],
                uploadId: uploadId
            });
        }
        // Validate minimum row count
        const rowCountError = validateRowCount(records.length);
        if (rowCountError) {
            if (uploadId !== null) {
                await efService.updateUploadStatus(uploadId, 'FAILED', records.length, rowCountError.message);
            }
            return res.status(400).json({
                code: rowCountError.code,
                message: rowCountError.message,
                errors: [rowCountError],
                uploadId: uploadId
            });
        }
        console.log(`✅ Parsed ${records.length} records${parseResult.skippedRows ? ` (skipped ${parseResult.skippedRows} invalid rows)` : ''}`);
        const insertRegistry = {
            'IB_EXTERNAL_EXAMS': async (id, name, by, recs) => await efService.insertIBExternalExams(id, name, by, recs),
            'MSNAV_FINANCIAL_AID': async (id, name, by, recs) => await efService.insertMSNAVFinancialAid(id, name, by, recs),
            'CEM_INITIAL': async (id, name, by, recs) => await efService.insertCEMPredictionReport(id, name, by, recs),
            'CEM_FINAL': async (id, name, by, recs) => await efService.insertCEMSubjectLevelAnalysis(id, name, by, recs),
            'HR_EMPLOYEE_DATA': async (id, name, by, recs) => await efService.insertHREmployeeData(id, name, by, recs),
            'HR_BUDGET_VS_ACTUAL': async (id, name, by, recs) => await efService.insertHRBudgetVsActual(id, name, by, recs),
            'FIN_DIC_ACCOUNT': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'ACCOUNT', recs),
            'FIN_DIC_ACTIVITY': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'ACTIVITY', recs),
            'FIN_DIC_DEPARTMENT': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'DEPARTMENT', recs),
            'FIN_DIC_FIXED_ASSETS': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'FIXED_ASSETS', recs),
            'FIN_DIC_OPERATING_UNIT': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'OPERATING_UNIT', recs),
            'FIN_DIC_PARTY': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'PARTY', recs),
            'FIN_DIC_PROJECT': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'PROJECT', recs),
            'FIN_DIC_REFERENCE': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'REFERENCE', recs),
            'FIN_DIC_REGION': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'REGION', recs),
            'FIN_DIC_RESOURCE': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'RESOURCE', recs),
            'FIN_DIC_SOURCE_OF_FUND': async (id, name, by, recs) => await efService.insertFINDictionary(id, name, by, 'SOURCE_OF_FUND', recs),
            'FIN_TB_ACTUAL': async (id, name, by, recs) => await efService.insertFINTrialBalance(id, name, by, 'ACTUAL', recs),
            'FIN_TB_BUDGET': async (id, name, by, recs) => await efService.insertFINTrialBalance(id, name, by, 'BUDGET', recs)
        };
        const fileTypeUpper = fileTypeCode.toUpperCase();
        // HR types: overwrite previous data before insert
        const hrFileTypes = ['HR_EMPLOYEE_DATA', 'HR_BUDGET_VS_ACTUAL'];
        const financeDictionaryFileTypes = [
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
            'FIN_DIC_SOURCE_OF_FUND'
        ];
        if (hrFileTypes.includes(fileTypeUpper)) {
            if (fileTypeUpper === 'HR_EMPLOYEE_DATA') {
                await efService.deleteAllHREmployeeData();
            }
            else {
                await efService.deleteAllHRBudgetVsActual();
            }
        }
        else if (financeDictionaryFileTypes.includes(fileTypeUpper)) {
            const dictionaryType = fileTypeUpper.replace('FIN_DIC_', '');
            await efService.deleteAllFINDictionaryByType(dictionaryType);
        }
        else if (fileTypeUpper === 'FIN_TB_ACTUAL' || fileTypeUpper === 'FIN_TB_BUDGET') {
            const tbType = fileTypeUpper === 'FIN_TB_ACTUAL' ? 'ACTUAL' : 'BUDGET';
            await efService.deleteAllFINTrialBalanceByType(tbType);
        }
        const insertFunction = insertRegistry[fileTypeUpper];
        if (!insertFunction) {
            throw new Error(`Unsupported file type: ${fileTypeCode}. Supported types: ${Object.keys(insertRegistry).join(', ')}`);
        }
        const rowCount = await insertFunction(uploadId, fileName, uploadedBy, records);
        console.log(`✅ Inserted ${rowCount} records into database`);
        // Step 6: Update upload status to 'COMPLETED' with row count
        await efService.updateUploadStatus(uploadId, 'COMPLETED', rowCount);
        console.log(`✅ Upload ${uploadId} completed successfully`);
        // MSNAV (and other EF uploads): data stays in EF until user promotes to RP in Upload Details.
        // Step 7: Return success response
        res.json({
            uploadId,
            status: 'COMPLETED',
            rowCount,
            message: `Successfully uploaded and processed ${rowCount} records${parseResult.skippedRows ? ` (${parseResult.skippedRows} rows skipped)` : ''}`,
            skippedRows: parseResult.skippedRows || 0,
            totalRows: parseResult.totalRows || rowCount
        });
    }
    catch (error) {
        console.error('❌ Upload error:', error);
        // Step 7 (error case): Update status to 'FAILED' with error message
        if (uploadId !== null) {
            try {
                await efService.updateUploadStatus(uploadId, 'FAILED', undefined, error.message || 'Unknown error occurred');
                console.log(`❌ Updated upload ${uploadId} status to FAILED`);
            }
            catch (updateError) {
                console.error('❌ Failed to update upload status:', updateError);
            }
        }
        // Return appropriate error response
        const statusCode = error.message?.includes('Invalid') ||
            error.message?.includes('mismatch') ||
            error.message?.includes('required') ? 400 : 500;
        const uploadError = {
            code: statusCode === 400 ? ErrorCode.UNKNOWN_ERROR : ErrorCode.DB_ERROR,
            message: error.message || 'An error occurred while processing the file',
            step: 'UNKNOWN'
        };
        res.status(statusCode).json({
            code: uploadError.code,
            message: uploadError.message,
            errors: [uploadError],
            uploadId: uploadId || null
        });
    }
});
/**
 * GET /api/ef/uploads
 * Get recent uploads with optional filtering
 * Query params: fileTypeCode (optional), limit (optional, default 50)
 */
router.get('/uploads', async (req, res) => {
    try {
        const fileTypeCode = req.query.fileTypeCode;
        const limitParam = req.query.limit;
        const limit = limitParam ? parseInt(limitParam, 10) : 50;
        if (limitParam && isNaN(limit)) {
            return res.status(400).json({
                error: 'Invalid limit parameter',
                message: 'Limit must be a valid number'
            });
        }
        if (limit < 1 || limit > 1000) {
            return res.status(400).json({
                error: 'Invalid limit parameter',
                message: 'Limit must be between 1 and 1000'
            });
        }
        console.log(`📋 Fetching uploads (fileTypeCode: ${fileTypeCode || 'all'}, limit: ${limit})`);
        const uploads = await efService.getRecentUploads(fileTypeCode, limit);
        res.json({ uploads });
    }
    catch (error) {
        console.error('❌ Error fetching uploads:', error);
        res.status(500).json({
            error: 'Failed to fetch uploads',
            message: error.message
        });
    }
});
/**
 * GET /api/ef/uploads/:id
 * Get details of a specific upload
 */
router.get('/uploads/:id', async (req, res) => {
    try {
        const uploadId = parseInt(req.params.id, 10);
        if (isNaN(uploadId)) {
            return res.status(400).json({
                error: 'Invalid upload ID',
                message: 'Upload ID must be a valid number'
            });
        }
        console.log(`📋 Fetching upload: ${uploadId}`);
        const upload = await efService.getUploadById(uploadId);
        if (!upload) {
            return res.status(404).json({
                error: 'Upload not found',
                message: `Upload with ID ${uploadId} does not exist`
            });
        }
        res.json({ upload });
    }
    catch (error) {
        console.error('❌ Error fetching upload:', error);
        res.status(500).json({
            error: 'Failed to fetch upload',
            message: error.message
        });
    }
});
/**
 * GET /api/ef/uploads/:id/data
 * Get paginated data for an upload
 * Query params: page (optional, default 1), limit (optional, default 100), search (optional)
 */
router.get('/uploads/:id/data', async (req, res) => {
    try {
        const uploadId = parseInt(req.params.id, 10);
        if (isNaN(uploadId)) {
            return res.status(400).json({
                error: 'Invalid upload ID',
                message: 'Upload ID must be a valid number'
            });
        }
        const page = req.query.page ? parseInt(req.query.page, 10) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
        const search = typeof req.query.search === 'string' ? req.query.search : undefined;
        if (page < 1) {
            return res.status(400).json({
                error: 'Invalid page parameter',
                message: 'Page must be greater than 0'
            });
        }
        if (limit < 1 || limit > 1000) {
            return res.status(400).json({
                error: 'Invalid limit parameter',
                message: 'Limit must be between 1 and 1000'
            });
        }
        console.log(`📋 Fetching upload data: ${uploadId} (page: ${page}, limit: ${limit}, search: ${search || 'none'})`);
        const result = await efService.getUploadData(uploadId, page, limit, search);
        res.json(result);
    }
    catch (error) {
        console.error('❌ Error fetching upload data:', error);
        if (error.message?.includes('not found')) {
            return res.status(404).json({
                error: 'Upload not found',
                message: error.message
            });
        }
        res.status(500).json({
            error: 'Failed to fetch upload data',
            message: error.message
        });
    }
});
/**
 * POST /api/ef/uploads/:id/retry
 * Retry a failed upload (re-process the file)
 */
router.post('/uploads/:id/retry', async (req, res) => {
    try {
        const uploadId = parseInt(req.params.id, 10);
        if (isNaN(uploadId)) {
            return res.status(400).json({
                code: ErrorCode.INVALID_FILE_TYPE,
                message: 'Invalid upload ID',
                errors: [{
                        code: ErrorCode.INVALID_FILE_TYPE,
                        message: 'Upload ID must be a valid number',
                        step: 'VALIDATION'
                    }]
            });
        }
        console.log(`🔄 Retrying upload: ${uploadId}`);
        // Get upload details
        const upload = await efService.getUploadById(uploadId);
        if (!upload) {
            return res.status(404).json({
                code: ErrorCode.UNKNOWN_ERROR,
                message: 'Upload not found',
                errors: [{
                        code: ErrorCode.UNKNOWN_ERROR,
                        message: `Upload with ID ${uploadId} does not exist`,
                        step: 'VALIDATION'
                    }]
            });
        }
        // Check if upload is in a retryable state
        if (upload.status !== 'FAILED') {
            return res.status(400).json({
                code: ErrorCode.UNKNOWN_ERROR,
                message: 'Upload is not in a failed state',
                errors: [{
                        code: ErrorCode.UNKNOWN_ERROR,
                        message: `Upload status is ${upload.status}. Only failed uploads can be retried.`,
                        step: 'VALIDATION'
                    }]
            });
        }
        // Note: For a full retry implementation, you would need to:
        // 1. Store the original file (not currently implemented)
        // 2. Re-process the file
        // For now, we'll just update the status back to PENDING
        // In a production system, you'd want to store files temporarily or re-upload
        await efService.updateUploadStatus(uploadId, 'PENDING');
        res.json({
            success: true,
            message: `Upload ${uploadId} has been queued for retry. Please re-upload the file.`,
            uploadId
        });
    }
    catch (error) {
        console.error('❌ Error retrying upload:', error);
        res.status(500).json({
            code: ErrorCode.DB_ERROR,
            message: 'Failed to retry upload',
            errors: [{
                    code: ErrorCode.DB_ERROR,
                    message: error.message,
                    step: 'UNKNOWN'
                }]
        });
    }
});
/**
 * POST /api/ef/uploads/:id/promote-to-rp
 * Promote completed EF upload to RP schema (copy EF data to RP mart table, full replace).
 */
router.post('/uploads/:id/promote-to-rp', async (req, res) => {
    try {
        const uploadId = parseInt(req.params.id, 10);
        if (isNaN(uploadId)) {
            return res.status(400).json({
                error: 'Invalid upload ID',
                message: 'Upload ID must be a valid number'
            });
        }
        const modeRaw = typeof req.body?.mode === 'string' ? req.body.mode.toLowerCase() : 'replace';
        const mode = modeRaw === 'append' ? 'append' : 'replace';
        console.log(`📤 Promoting upload ${uploadId} to RP schema (mode=${mode})`);
        const result = await efService.promoteUploadToRP(uploadId, mode);
        const verb = result.mode === 'append' ? 'Appended' : 'Replaced RP table and loaded';
        console.log(`✅ ${verb} ${result.rowCount} records (${result.fileType})`);
        res.json({
            success: true,
            message: result.mode === 'append'
                ? `Successfully appended ${result.rowCount} records to RP schema`
                : `Successfully replaced RP data with ${result.rowCount} records from this upload`,
            rowCount: result.rowCount,
            fileType: result.fileType,
            mode: result.mode
        });
    }
    catch (error) {
        console.error('❌ Error promoting to RP:', error);
        if (error.message?.includes('not found')) {
            return res.status(404).json({
                error: 'Upload not found',
                message: error.message
            });
        }
        if (error.message?.includes('Only completed')) {
            return res.status(400).json({
                error: 'Invalid state',
                message: error.message
            });
        }
        if (error.message?.includes('cannot be promoted to RP')) {
            return res.status(400).json({
                error: 'Invalid file type',
                message: error.message
            });
        }
        res.status(500).json({
            error: 'Failed to promote to RP',
            message: error.message
        });
    }
});
/**
 * DELETE /api/ef/uploads/:id
 * Delete upload record and all associated data
 */
router.delete('/uploads/:id', async (req, res) => {
    try {
        const uploadId = parseInt(req.params.id, 10);
        if (isNaN(uploadId)) {
            return res.status(400).json({
                error: 'Invalid upload ID',
                message: 'Upload ID must be a valid number'
            });
        }
        console.log(`🗑️  Deleting upload: ${uploadId}`);
        // Check if upload exists
        const upload = await efService.getUploadById(uploadId);
        if (!upload) {
            return res.status(404).json({
                error: 'Upload not found',
                message: `Upload with ID ${uploadId} does not exist`
            });
        }
        // Delete upload and associated data
        await efService.deleteUpload(uploadId);
        console.log(`✅ Successfully deleted upload: ${uploadId}`);
        res.json({
            success: true,
            message: `Upload ${uploadId} and all associated data have been deleted`
        });
    }
    catch (error) {
        console.error('❌ Error deleting upload:', error);
        res.status(500).json({
            error: 'Failed to delete upload',
            message: error.message
        });
    }
});
export default router;
//# sourceMappingURL=ef.js.map