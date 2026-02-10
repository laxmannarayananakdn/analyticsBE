/**
 * Student Assessments Methods
 * Handles fetching and saving student assessments/grade book data from Nexquare API
 * Fetches CSV or Excel file from API, parses it, and saves to database
 */
import { NEXQUARE_ENDPOINTS } from '../../config/nexquare';
import { executeQuery, getConnection, sql } from '../../config/database';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
/**
 * Get student assessment/grade book data
 * Fetches CSV file from API, parses it, and saves to database
 * Can be added to a class that extends BaseNexquareService
 */
export async function getStudentAssessments(config, schoolId, academicYear, fileName, limit = 10000, offset = 0) {
    try {
        const targetSchoolId = schoolId || this.getCurrentSchoolId();
        if (!targetSchoolId) {
            throw new Error('School ID is required');
        }
        const defaultAcademicYear = academicYear || new Date().getFullYear().toString();
        const defaultFileName = fileName || 'assessment-data';
        // Get the school sourced_id from sourced_id
        const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
        if (!schoolSourcedId) {
            console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Assessments will be saved with school_id = NULL.`);
        }
        console.log(`📊 Fetching student assessments for school ${targetSchoolId}, academic year ${defaultAcademicYear}...`);
        console.log(`   Fetching all data (not passing offset/limit - API will return all records)`);
        const endpoint = NEXQUARE_ENDPOINTS.STUDENT_ASSESSMENTS;
        let allRecords = [];
        let totalInserted = 0;
        // Fetch all data in one request (don't pass offset/limit - API defaults to all data)
        console.log(`\n📥 Fetching all assessment data...`);
        // Build query parameters - DO NOT include offset or limit
        const queryParams = new URLSearchParams();
        queryParams.append('schoolIds', targetSchoolId);
        queryParams.append('academicYear', defaultAcademicYear);
        queryParams.append('fileName', defaultFileName);
        // Note: Not passing offset/limit - API will default to offset=0 and limit=1,048,570
        const url = `${endpoint}?${queryParams.toString()}`;
        // Fetch file response (CSV or Excel)
        let buffer;
        let contentType;
        try {
            const fileResponse = await this.makeFileRequest(url, config);
            buffer = fileResponse.buffer;
            contentType = fileResponse.contentType;
        }
        catch (error) {
            console.error('❌ Failed to fetch assessment data:', error);
            throw error;
        }
        if (!buffer || buffer.length === 0) {
            console.log(`✅ No data returned from API.`);
            return [];
        }
        // Detect file type from content-type or file signature
        const isExcel = contentType.includes('spreadsheet') ||
            contentType.includes('excel') ||
            contentType.includes('application/vnd.openxmlformats') ||
            buffer.toString('utf8', 0, 4) === 'PK\x03\x04';
        let records = [];
        if (isExcel) {
            // Parse Excel file
            console.log(`   📝 Parsing Excel file...`);
            try {
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                // Get the first sheet
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) {
                    throw new Error('No sheets found in Excel file');
                }
                const worksheet = workbook.Sheets[sheetName];
                // Convert to JSON with header row
                records = XLSX.utils.sheet_to_json(worksheet, {
                    defval: null, // Use null for empty cells
                    raw: false, // Convert values to strings
                    dateNF: 'yyyy-mm-dd' // Date format
                });
                console.log(`   ✅ Parsed ${records.length} record(s) from Excel`);
            }
            catch (parseError) {
                console.error('   ❌ Failed to parse Excel:', parseError);
                throw new Error(`Excel parsing failed: ${parseError.message}`);
            }
        }
        else {
            // Parse CSV
            console.log(`   📝 Parsing CSV data...`);
            try {
                // Remove BOM if present
                const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
                records = parse(csvText, {
                    columns: true, // Use first row as column names
                    skip_empty_lines: true,
                    trim: true,
                    bom: true,
                    relax_column_count: true,
                    skip_records_with_error: false
                });
                console.log(`   ✅ Parsed ${records.length} record(s) from CSV`);
            }
            catch (parseError) {
                console.error('   ❌ Failed to parse CSV:', parseError);
                throw new Error(`CSV parsing failed: ${parseError.message}`);
            }
        }
        if (records.length === 0) {
            console.log(`✅ No records found in response.`);
            return [];
        }
        allRecords = records;
        console.log(`   📊 Total records parsed: ${allRecords.length}`);
        // Save all records to database in batches
        console.log(`   💾 Saving records to database in batches...`);
        const batchInserted = await this.saveAssessmentBatch(allRecords, schoolSourcedId);
        totalInserted = batchInserted;
        console.log(`   ✅ Saved ${totalInserted} record(s) to database`);
        console.log(`\n✅ Completed fetching all assessment data`);
        console.log(`   Total records fetched: ${allRecords.length}`);
        console.log(`   Total records saved: ${totalInserted}`);
        return allRecords;
    }
    catch (error) {
        console.error('Failed to fetch student assessments:', error);
        throw error;
    }
}
/**
 * Save a batch of assessment records to database using temporary table approach
 * This is faster than batched INSERT statements as SQL Server can optimize the final insert
 * Helper function used by getStudentAssessments
 */
export async function saveAssessmentBatch(records, schoolSourcedId) {
    if (records.length === 0) {
        return 0;
    }
    console.log(`   💾 Starting bulk insert for ${records.length} record(s) using temporary table approach...`);
    // Build a map of Excel School ID -> School sourced_id
    // The Excel file has "School ID" which could be sourced_id or another identifier
    // We need to map it to the sourced_id for the school_id column
    console.log(`   🔍 Building school ID lookup map...`);
    const uniqueSchoolIds = new Set();
    records.forEach(record => {
        const schoolId = record['School ID'];
        if (schoolId !== undefined && schoolId !== null && schoolId !== '') {
            uniqueSchoolIds.add(String(schoolId).trim());
        }
    });
    const schoolIdMap = new Map();
    for (const excelSchoolId of uniqueSchoolIds) {
        // Try multiple lookup strategies to find the sourced_id:
        // 1. Check if it's already the sourced_id
        // 2. Try to find by identifier (then get sourced_id)
        // 3. Try to find by database id (then get sourced_id)
        let sourcedId = null;
        // First, try as sourced_id directly
        const queryBySourcedId = `
      SELECT sourced_id FROM NEX.schools WHERE sourced_id = @sourced_id;
    `;
        const resultBySourcedId = await executeQuery(queryBySourcedId, { sourced_id: excelSchoolId });
        if (!resultBySourcedId.error && resultBySourcedId.data && resultBySourcedId.data.length > 0) {
            sourcedId = resultBySourcedId.data[0].sourced_id;
        }
        // If not found, try by identifier
        if (!sourcedId) {
            const queryByIdentifier = `
        SELECT sourced_id FROM NEX.schools WHERE identifier = @identifier;
      `;
            const resultByIdentifier = await executeQuery(queryByIdentifier, { identifier: excelSchoolId });
            if (!resultByIdentifier.error && resultByIdentifier.data && resultByIdentifier.data.length > 0) {
                sourcedId = resultByIdentifier.data[0].sourced_id;
            }
        }
        // If still not found, try by database id (if it's numeric)
        if (!sourcedId) {
            const numericId = parseInt(excelSchoolId);
            if (!isNaN(numericId)) {
                const queryById = `
          SELECT sourced_id FROM NEX.schools WHERE id = @id;
        `;
                const resultById = await executeQuery(queryById, { id: numericId });
                if (!resultById.error && resultById.data && resultById.data.length > 0) {
                    sourcedId = resultById.data[0].sourced_id;
                }
            }
        }
        // If still not found, use the provided schoolSourcedId as fallback, or null
        if (!sourcedId) {
            sourcedId = schoolSourcedId;
            if (!sourcedId) {
                console.warn(`   ⚠️  School ID "${excelSchoolId}" from Excel not found in database. Will use NULL.`);
            }
        }
        schoolIdMap.set(excelSchoolId, sourcedId);
    }
    console.log(`   ✅ Built lookup map for ${schoolIdMap.size} unique school(s)`);
    // Helper functions to extract and clean values from Excel records
    const getValue = (record, colName) => {
        const val = record[colName];
        if (val === undefined || val === null || val === '')
            return null;
        const str = String(val).trim();
        return str === '' ? null : str;
    };
    const getNumeric = (record, colName) => {
        const val = record[colName];
        if (val === undefined || val === null || val === '')
            return null;
        const num = parseFloat(String(val));
        return isNaN(num) ? null : num;
    };
    // Get component value - can be either numeric or text (grade)
    const getComponentValue = (record, colName) => {
        const val = record[colName];
        if (val === undefined || val === null || val === '')
            return null;
        // Return as string to support both numeric values and character grades
        const str = String(val).trim();
        return str === '' ? null : str;
    };
    // Prepare all records for bulk insert - map Excel columns to database columns
    console.log(`   📦 Preparing ${records.length} record(s) for bulk insert...`);
    const now = new Date();
    const rowsToInsert = records.map((record) => {
        const excelSchoolId = String(record['School ID'] || '').trim();
        const dbSchoolId = schoolIdMap.get(excelSchoolId) || schoolSourcedId || null;
        return {
            school_id: dbSchoolId,
            school_name: getValue(record, 'School Name'),
            region_name: getValue(record, 'Region Name'),
            student_name: getValue(record, 'Student Name'),
            register_number: getValue(record, 'Register Number'),
            student_status: getValue(record, 'Student Status'),
            grade_name: getValue(record, 'Grade Name'),
            section_name: getValue(record, 'Section Name'),
            class_name: getValue(record, 'Class Name'),
            academic_year: getValue(record, 'Academic Year'),
            subject_id: getValue(record, 'Subject ID'),
            subject_name: getValue(record, 'Subject Name'),
            term_id: getValue(record, 'Term ID'),
            term_name: getValue(record, 'Term Name'),
            component_name: getValue(record, 'Component Name'),
            component_value: getComponentValue(record, 'Component Value'), // Can be numeric or text grade
            max_value: getNumeric(record, 'Max Value'),
            data_type: getValue(record, 'Data Type'),
            calculation_method: getValue(record, 'Calculation Method'),
            mark_grade_name: getValue(record, 'Mark Grade Name'),
            mark_rubric_name: getValue(record, 'Mark Rubric Name'),
            created_at: now,
            updated_at: now,
        };
    });
    // Use direct batched INSERT statements (simpler and avoids temp table scope issues)
    const connection = await getConnection();
    const transaction = new sql.Transaction(connection);
    try {
        await transaction.begin();
        // Batch size: 90 records per batch to stay within SQL Server's 2100 parameter limit
        // (90 records * 23 columns = 2070 parameters, leaving margin for safety)
        const batchSize = 90;
        let totalInserted = 0;
        const totalBatches = Math.ceil(rowsToInsert.length / batchSize);
        console.log(`   📦 Inserting ${rowsToInsert.length} record(s) in ${totalBatches} batch(es)...`);
        const startTime = Date.now();
        for (let i = 0; i < rowsToInsert.length; i += batchSize) {
            const batch = rowsToInsert.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            // Build VALUES clause for batch insert
            const values = batch.map((record, index) => {
                const baseIndex = i + index;
                return `(
          @schoolId${baseIndex},
          @schoolName${baseIndex},
          @regionName${baseIndex},
          @studentName${baseIndex},
          @registerNumber${baseIndex},
          @studentStatus${baseIndex},
          @gradeName${baseIndex},
          @sectionName${baseIndex},
          @className${baseIndex},
          @academicYear${baseIndex},
          @subjectId${baseIndex},
          @subjectName${baseIndex},
          @termId${baseIndex},
          @termName${baseIndex},
          @componentName${baseIndex},
          @componentValue${baseIndex},
          @maxValue${baseIndex},
          @dataType${baseIndex},
          @calculationMethod${baseIndex},
          @markGradeName${baseIndex},
          @markRubricName${baseIndex},
          SYSDATETIMEOFFSET(),
          SYSDATETIMEOFFSET()
        )`;
            }).join(',');
            const batchQuery = `
        INSERT INTO NEX.student_assessments (
          school_id, school_name, region_name, student_name, register_number,
          student_status, grade_name, section_name, class_name, academic_year,
          subject_id, subject_name, term_id, term_name, component_name,
          component_value, max_value, data_type, calculation_method,
          mark_grade_name, mark_rubric_name, created_at, updated_at
        ) VALUES ${values};
      `;
            const request = transaction.request();
            // Add parameters for each record in the batch
            batch.forEach((record, index) => {
                const baseIndex = i + index;
                request.input(`schoolId${baseIndex}`, sql.NVarChar(100), record.school_id || null);
                request.input(`schoolName${baseIndex}`, sql.NVarChar(sql.MAX), record.school_name || null);
                request.input(`regionName${baseIndex}`, sql.NVarChar(sql.MAX), record.region_name || null);
                request.input(`studentName${baseIndex}`, sql.NVarChar(sql.MAX), record.student_name || null);
                request.input(`registerNumber${baseIndex}`, sql.NVarChar(100), record.register_number || null);
                request.input(`studentStatus${baseIndex}`, sql.NVarChar(100), record.student_status || null);
                request.input(`gradeName${baseIndex}`, sql.NVarChar(100), record.grade_name || null);
                request.input(`sectionName${baseIndex}`, sql.NVarChar(100), record.section_name || null);
                request.input(`className${baseIndex}`, sql.NVarChar(sql.MAX), record.class_name || null);
                request.input(`academicYear${baseIndex}`, sql.NVarChar(100), record.academic_year || null);
                request.input(`subjectId${baseIndex}`, sql.NVarChar(100), record.subject_id || null);
                request.input(`subjectName${baseIndex}`, sql.NVarChar(sql.MAX), record.subject_name || null);
                request.input(`termId${baseIndex}`, sql.NVarChar(100), record.term_id || null);
                request.input(`termName${baseIndex}`, sql.NVarChar(sql.MAX), record.term_name || null);
                request.input(`componentName${baseIndex}`, sql.NVarChar(sql.MAX), record.component_name || null);
                // Handle component_value - ensure it's a string and properly formatted
                let componentValue = null;
                if (record.component_value != null && record.component_value !== '') {
                    const strValue = String(record.component_value).trim();
                    componentValue = strValue.length > 0 ? strValue.substring(0, 500) : null;
                }
                request.input(`componentValue${baseIndex}`, sql.NVarChar(500), componentValue);
                request.input(`maxValue${baseIndex}`, sql.Decimal(10, 2), record.max_value || null);
                request.input(`dataType${baseIndex}`, sql.NVarChar(100), record.data_type || null);
                request.input(`calculationMethod${baseIndex}`, sql.NVarChar(sql.MAX), record.calculation_method || null);
                request.input(`markGradeName${baseIndex}`, sql.NVarChar(100), record.mark_grade_name || null);
                request.input(`markRubricName${baseIndex}`, sql.NVarChar(sql.MAX), record.mark_rubric_name || null);
            });
            try {
                await request.query(batchQuery);
                totalInserted += batch.length;
                if (batchNum % 10 === 0 || batchNum === totalBatches) {
                    console.log(`   Progress: ${batchNum}/${totalBatches} batches (${totalInserted}/${rowsToInsert.length} records)`);
                }
            }
            catch (batchError) {
                console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
                throw batchError;
            }
        }
        await transaction.commit();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`   ✅ Bulk insert completed in ${duration} seconds`);
        return totalInserted;
    }
    catch (error) {
        try {
            await transaction.rollback();
        }
        catch (rollbackError) {
            console.warn('   ⚠️  Transaction rollback error (may be already aborted)');
        }
        console.error('   ❌ Bulk insert failed:', error.message);
        console.error('   Error code:', error.code);
        console.error('   Error number:', error.number);
        if (error.originalError) {
            console.error('   Original error:', error.originalError.message);
        }
        // Log first record for debugging
        if (rowsToInsert.length > 0) {
            console.error('   First record:', JSON.stringify(rowsToInsert[0]).substring(0, 300));
        }
        throw new Error(`Bulk insert failed: ${error.message || error}`);
    }
}
//# sourceMappingURL=studentAssessments.js.map