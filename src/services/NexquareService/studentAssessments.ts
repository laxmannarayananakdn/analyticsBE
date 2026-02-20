/**
 * Student Assessments Methods
 * Handles fetching and saving student assessments/grade book data from Nexquare API
 * Fetches CSV or Excel file from API, parses it, and saves to database
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare.js';
import type { NexquareConfig } from '../../middleware/configLoader.js';
import { executeQuery, getConnection, sql } from '../../config/database.js';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { databaseService } from '../DatabaseService.js';
import type { BaseNexquareService } from './BaseNexquareService.js';

/**
 * Get student assessment/grade book data
 * Fetches CSV file from API, parses it, and saves to database
 * Can be added to a class that extends BaseNexquareService
 */
export async function getStudentAssessments(
  this: BaseNexquareService,
  config: NexquareConfig,
  schoolId?: string,
  academicYear?: string,
  fileName?: string,
  limit: number = 10000,
  offset: number = 0,
  onLog?: (msg: string) => void
): Promise<any[]> {
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    const defaultAcademicYear = academicYear || new Date().getFullYear().toString();
    const defaultFileName = fileName || 'assessment-data';
    
    // Get the school sourced_id from sourced_id
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      log(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Assessments will be saved with school_id = NULL.`);
    }

    log(`📋 Step 1: Fetching student assessments from Nexquare API (school: ${targetSchoolId}, academic year: ${defaultAcademicYear})...`);
    log(`   Using chunked fetching: ${limit} records per request`);

    const endpoint = NEXQUARE_ENDPOINTS.STUDENT_ASSESSMENTS;
    let allRecords: any[] = [];
    let totalInserted = 0;

    // Fetch data in chunks to avoid memory issues with large files
    log(`📥 Fetching assessment data in chunks...`);
    
    const chunkSize = limit; // Use the limit parameter (default 10000)
    let currentOffset = offset; // Start from the offset parameter (default 0)
    let hasMoreData = true;
    let chunkNumber = 1;
    let totalFetched = 0;
    
    while (hasMoreData) {
      log(`   📦 Fetching chunk ${chunkNumber} (offset: ${currentOffset}, limit: ${chunkSize})...`);
      
      // Build query parameters with offset and limit
      const queryParams = new URLSearchParams();
      queryParams.append('schoolIds', targetSchoolId);
      queryParams.append('academicYear', defaultAcademicYear);
      queryParams.append('fileName', defaultFileName);
      queryParams.append('limit', chunkSize.toString());
      queryParams.append('offset', currentOffset.toString());

      const url = `${endpoint}?${queryParams.toString()}`;
      
      // Fetch file response (CSV or Excel)
      let buffer: Buffer;
      let contentType: string;
      
      try {
        const fileResponse = await (this as any).makeFileRequest(url, config);
        buffer = fileResponse.buffer;
        contentType = fileResponse.contentType;
      } catch (error: any) {
        log(`❌ Failed to fetch chunk ${chunkNumber}: ${error.message}`);
        throw error;
      }
      
      if (!buffer || buffer.length === 0) {
        log(`   ✅ No more data returned (chunk ${chunkNumber} is empty)`);
        hasMoreData = false;
        break;
      }

      // Log file size for debugging
      const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      log(`   📦 Chunk ${chunkNumber} size: ${fileSizeMB} MB (${buffer.length.toLocaleString()} bytes)`);

      // Detect file type from content-type or file signature
      const isExcel = contentType.includes('spreadsheet') || 
                      contentType.includes('excel') ||
                      contentType.includes('application/vnd.openxmlformats') ||
                      buffer.toString('utf8', 0, 4) === 'PK\x03\x04';
      
      let chunkRecords: any[] = [];

      if (isExcel) {
      // Parse Excel file for this chunk
      console.log(`   📝 Parsing Excel chunk ${chunkNumber}...`);
      let workbook: XLSX.WorkBook | null = null;
      let parseAttempt = 1;
      const maxAttempts = 3;
      
      // Try different parsing strategies for large files
      while (!workbook && parseAttempt <= maxAttempts) {
        try {
          console.log(`   🔄 Parsing attempt ${parseAttempt}/${maxAttempts}...`);
          
          if (parseAttempt === 1) {
            // First attempt: Optimized options for large files
            workbook = XLSX.read(buffer, { 
              type: 'buffer',
              cellDates: false,
              cellNF: false,
              cellText: false
            });
          } else if (parseAttempt === 2) {
            // Second attempt: Minimal options (most memory efficient)
            workbook = XLSX.read(buffer, { 
              type: 'buffer',
              cellDates: false,
              cellNF: false,
              cellText: false,
              sheetStubs: false
            });
          } else {
            // Third attempt: Default options (might work if optimized options fail)
            console.log(`   ⚠️  Trying default parsing options (may use more memory)...`);
            workbook = XLSX.read(buffer, { 
              type: 'buffer'
            });
          }
          
          // Verify workbook was parsed correctly
          if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('Workbook parsing failed: No sheets found or workbook structure is invalid');
          }
          
          // For very large files, XLSX might use lazy loading
          // Try to access the sheet directly to trigger loading
          if (workbook.SheetNames && workbook.SheetNames.length > 0) {
            const sheetName = workbook.SheetNames[0];
            console.log(`   🔍 Attempting to access sheet "${sheetName}" to trigger loading...`);
            
            // Try to access the sheet - this might trigger lazy loading
            let worksheet = workbook.Sheets?.[sheetName];
            
            // If not found, try accessing it differently to force load
            if (!worksheet) {
              // Force access by trying to get all sheets
              const sheetKeys = Object.keys(workbook.Sheets || {});
              if (sheetKeys.length === 0) {
                // Sheets object is empty - this is the known issue with large files
                // Try to work around by accessing the Directory structure
                console.log(`   ⚠️  Sheets object is empty - XLSX may not load large files into memory`);
                console.log(`   💡 This is a known limitation. File may need to be processed differently.`);
                
                // For now, throw error to try next attempt or use alternative
                if (parseAttempt < maxAttempts) {
                  throw new Error('Sheets object empty - will try alternative approach');
            } else {
              // XLSX failed - will try exceljs as fallback
              throw new Error('Sheets object empty - will try exceljs fallback');
            }
              }
            } else {
              console.log(`   ✅ Sheet accessed successfully`);
            }
          }
          
          // Final check
          if (!workbook.Sheets || Object.keys(workbook.Sheets).length === 0) {
            if (parseAttempt < maxAttempts) {
              throw new Error('Sheets object empty - trying next approach');
            } else {
              // XLSX failed - will try exceljs as fallback
              throw new Error('Sheets object empty - will try exceljs fallback');
            }
          }
          
          console.log(`   ✅ Parsing attempt ${parseAttempt} succeeded`);
          break; // Success, exit the loop
          
        } catch (parseError: any) {
          // If it's the "Sheets object empty" error and we have more attempts, continue
          if (parseError.message.includes('Sheets object empty') && parseAttempt < maxAttempts) {
            console.warn(`   ⚠️  Parsing attempt ${parseAttempt} - Sheets empty, will try workaround on next attempt`);
            workbook = null;
            parseAttempt++;
            continue;
          }
          
          console.warn(`   ⚠️  Parsing attempt ${parseAttempt} failed: ${parseError.message}`);
          workbook = null;
          parseAttempt++;
          
          if (parseAttempt > maxAttempts) {
            // XLSX failed completely - try exceljs as fallback
            console.log(`\n   🔄 XLSX parsing failed. Trying exceljs as fallback...`);
            break; // Exit loop to try exceljs
          }
        }
      }
      
      // If XLSX failed, try exceljs as fallback with chunked processing
      if (!workbook || !workbook.Sheets || Object.keys(workbook.Sheets).length === 0) {
        console.log(`\n   🔄 Attempting to parse with exceljs (supports large files better)...`);
        try {
          const exceljsWorkbook = new ExcelJS.Workbook();
          // exceljs accepts Buffer - ensure we have a proper Node.js Buffer
          // Convert to Uint8Array first, then to Buffer to avoid type issues
          const uint8Array = new Uint8Array(buffer);
          const exceljsBuffer = Buffer.from(uint8Array);
          
          // Load workbook - exceljs will handle large files better than XLSX
          await exceljsWorkbook.xlsx.load(exceljsBuffer as any);
          
          console.log(`   ✅ exceljs loaded workbook successfully`);
          console.log(`   📄 Found ${exceljsWorkbook.worksheets.length} worksheet(s)`);
          
          if (exceljsWorkbook.worksheets.length === 0) {
            throw new Error('No worksheets found in Excel file');
          }
          
          // Use the first worksheet
          const worksheet = exceljsWorkbook.worksheets[0];
          console.log(`   📊 Using worksheet: "${worksheet.name}"`);
          console.log(`   📈 Worksheet dimensions: ${worksheet.rowCount} rows, ${worksheet.columnCount} columns`);
          
          // Convert to JSON format matching XLSX output
          const headers: string[] = [];
          const rows: any[] = [];
          
          // Helper function to safely convert cell value to string (truncate if too long)
          const safeToString = (value: any, maxLength: number = 10000): string | null => {
            if (value === null || value === undefined) {
              return null;
            }
            
            try {
              let str: string;
              if (typeof value === 'object' && 'text' in value) {
                // Rich text
                str = String(value.text || '');
              } else if (value instanceof Date) {
                // Format date as YYYY-MM-DD
                str = value.toISOString().split('T')[0];
              } else {
                str = String(value);
              }
              
              // Truncate if too long to avoid "Invalid string length" error
              if (str.length > maxLength) {
                console.warn(`   ⚠️  Truncating cell value (length: ${str.length})`);
                return str.substring(0, maxLength);
              }
              
              return str;
            } catch (error: any) {
              console.warn(`   ⚠️  Error converting cell value: ${error.message}`);
              return null;
            }
          };
          
          // Get headers from first row
          const headerRow = worksheet.getRow(1);
          headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const headerValue = safeToString(cell.value, 500) || '';
            headers[colNumber - 1] = headerValue.trim();
          });
          
          console.log(`   📋 Found ${headers.length} columns: ${headers.slice(0, 5).join(', ')}${headers.length > 5 ? '...' : ''}`);
          
          // Process rows in batches to avoid memory issues
          const batchSize = 1000;
          let rowCount = 0;
          let currentBatch: any[] = [];
          
          worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row
            
            try {
              const rowData: any = {};
              row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const headerName = headers[colNumber - 1];
                if (headerName) {
                  // Use safe conversion with truncation
                  rowData[headerName] = safeToString(cell.value, 10000);
                }
              });
              
              currentBatch.push(rowData);
              rowCount++;
              
              // Process batch when it reaches batch size
              if (currentBatch.length >= batchSize) {
                rows.push(...currentBatch);
                currentBatch = [];
                console.log(`   📊 Processed ${rowCount} rows...`);
              }
            } catch (rowError: any) {
              console.warn(`   ⚠️  Error processing row ${rowNumber}: ${rowError.message}`);
              // Continue with next row
            }
          });
          
          // Add remaining rows
          if (currentBatch.length > 0) {
            rows.push(...currentBatch);
          }
          
          console.log(`   ✅ exceljs parsed ${rows.length} record(s) from Excel chunk ${chunkNumber}`);
          chunkRecords = rows;
          
        } catch (exceljsError: any) {
          console.error(`   ❌ exceljs parsing also failed: ${exceljsError.message}`);
          console.error(`   Error stack: ${exceljsError.stack?.substring(0, 500)}`);
          
          // Provide helpful error message
          if (exceljsError.message.includes('Invalid string length')) {
            throw new Error(`Excel file is too large to parse. The file contains cell values that exceed JavaScript's string length limit. ` +
              `Solutions: 1) Request CSV format from API (add format=CSV parameter), ` +
              `2) Request data in smaller chunks (use offset/limit parameters), ` +
              `3) Contact API provider to split the data into smaller files. ` +
              `Original error: ${exceljsError.message}`);
          }
          
          throw new Error(`Both XLSX and exceljs failed to parse Excel file. XLSX error: Sheets object empty. exceljs error: ${exceljsError.message}`);
        }
      }
      
      // If XLSX succeeded (workbook and Sheets are populated), process with XLSX
      if (workbook && workbook.Sheets && Object.keys(workbook.Sheets).length > 0) {
        try {
        
        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          throw new Error('No sheets found in Excel file');
        }
        
        console.log(`   📄 Found ${workbook.SheetNames.length} sheet(s), using: "${sheetName}"`);
        console.log(`   🔍 Available sheet names: ${workbook.SheetNames.join(', ')}`);
        console.log(`   🔍 Available Sheets keys: ${Object.keys(workbook.Sheets).join(', ')}`);
        
        // Get worksheet - try exact match first, then try case-insensitive match
        let worksheet = workbook.Sheets[sheetName];
        
        if (!worksheet) {
          // Try case-insensitive match
          const sheetKey = Object.keys(workbook.Sheets).find(
            key => key.toLowerCase() === sheetName.toLowerCase()
          );
          if (sheetKey) {
            console.log(`   ⚠️  Sheet name case mismatch. Using: "${sheetKey}" instead of "${sheetName}"`);
            worksheet = workbook.Sheets[sheetKey];
          }
        }
        
        // If still not found, try using the first available sheet
        if (!worksheet && Object.keys(workbook.Sheets).length > 0) {
          const firstSheetKey = Object.keys(workbook.Sheets)[0];
          console.log(`   ⚠️  Sheet "${sheetName}" not found. Using first available sheet: "${firstSheetKey}"`);
          worksheet = workbook.Sheets[firstSheetKey];
        }
        
        if (!worksheet) {
          throw new Error(`Worksheet "${sheetName}" not found in workbook. Available sheets: ${Object.keys(workbook.Sheets).join(', ')}`);
        }
        
        // Check if worksheet has data
        const worksheetRef = worksheet['!ref'];
        if (!worksheetRef) {
          console.warn(`   ⚠️  Worksheet has no range defined (!ref is missing). This might indicate an empty or corrupted sheet.`);
          console.warn(`   🔍 Worksheet keys: ${Object.keys(worksheet).slice(0, 20).join(', ')}...`);
          // Try to parse anyway - sometimes sheets have data without !ref
        }
        
        const range = worksheetRef ? XLSX.utils.decode_range(worksheetRef) : { e: { r: 0, c: 0 } };
        const totalRows = range.e.r + 1;
        const totalCols = range.e.c + 1;
        
        if (worksheetRef) {
          console.log(`   📊 Worksheet range: ${worksheetRef} (${totalRows} rows, ${totalCols} columns)`);
        } else {
          console.log(`   📊 Worksheet range: Not defined (will attempt to parse anyway)`);
        }
        
        if (totalRows === 0 && !worksheetRef) {
          console.warn(`   ⚠️  Worksheet appears to be empty or has no defined range`);
          // Don't return empty - try parsing anyway as some files have data without !ref
        }
        
        // Convert to JSON with header row
        // Use blankrows: false to skip empty rows (more efficient)
        // If !ref is missing, sheet_to_json will still try to parse available cells
        try {
          chunkRecords = XLSX.utils.sheet_to_json(worksheet, {
            defval: null, // Use null for empty cells
            raw: false, // Convert values to strings
            dateNF: 'yyyy-mm-dd', // Date format
            blankrows: false // Skip empty rows for better performance
          });
          
          console.log(`   ✅ Parsed ${chunkRecords.length} record(s) from Excel chunk ${chunkNumber}`);
        } catch (jsonError: any) {
          // If sheet_to_json fails, try with header: 1 to get raw array format
          console.warn(`   ⚠️  sheet_to_json failed, trying alternative parsing method: ${jsonError.message}`);
          try {
            const rawRows = XLSX.utils.sheet_to_json(worksheet, {
              header: 1,
              defval: null,
              raw: false,
              blankrows: false
            }) as any[][];
            
            if (rawRows.length > 0) {
              // Convert array format to object format using first row as headers
              const headers = rawRows[0] as string[];
              chunkRecords = rawRows.slice(1).map(row => {
                const obj: any = {};
                headers.forEach((header, index) => {
                  obj[header] = row[index] ?? null;
                });
                return obj;
              });
              console.log(`   ✅ Parsed ${chunkRecords.length} record(s) from Excel chunk ${chunkNumber} (using alternative method)`);
            } else {
              console.warn(`   ⚠️  No data rows found in worksheet`);
              chunkRecords = [];
            }
          } catch (altError: any) {
            console.error(`   ❌ Alternative parsing method also failed: ${altError.message}`);
            throw new Error(`Failed to parse Excel worksheet: ${jsonError.message}. Alternative method also failed: ${altError.message}`);
          }
        }
      } catch (parseError: any) {
        console.error('   ❌ Failed to parse Excel:', parseError);
        console.error('   Error details:', {
          message: parseError.message,
          stack: parseError.stack?.substring(0, 500),
          name: parseError.name
        });
        
        // Check if it's a memory-related error
        if (parseError.message?.includes('memory') || 
            parseError.message?.includes('allocation') ||
            parseError.message?.includes('heap') ||
            parseError.code === 'ERR_OUT_OF_MEMORY') {
          throw new Error(`Excel parsing failed due to memory constraints. File may be too large (${fileSizeMB} MB). Consider processing in smaller chunks or increasing Node.js memory limit. Original error: ${parseError.message}`);
        }
        
        throw new Error(`Excel parsing failed: ${parseError.message}`);
        }
      }
    } else {
      // Parse CSV
      console.log(`   📝 Parsing CSV data...`);
      try {
        // Remove BOM if present
        const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
        
        chunkRecords = parse(csvText, {
          columns: true, // Use first row as column names
          skip_empty_lines: true,
          trim: true,
          bom: true,
          relax_column_count: true,
          skip_records_with_error: false
        });
        
        console.log(`   ✅ Parsed ${chunkRecords.length} record(s) from CSV chunk ${chunkNumber}`);
      } catch (parseError: any) {
        console.error(`   ❌ Failed to parse CSV chunk ${chunkNumber}:`, parseError);
        throw new Error(`CSV parsing failed: ${parseError.message}`);
      }
    }

    // Add chunk records to all records
    if (chunkRecords.length > 0) {
      allRecords.push(...chunkRecords);
      totalFetched += chunkRecords.length;
      log(`   ✅ Chunk ${chunkNumber} complete: ${chunkRecords.length} records (total so far: ${totalFetched})`);
      
      // Check if we've reached the end (got fewer records than requested)
      if (chunkRecords.length < chunkSize) {
        log(`   📊 Reached end of data (got ${chunkRecords.length} < ${chunkSize} records)`);
        hasMoreData = false;
      } else {
        // Move to next chunk
        currentOffset += chunkSize;
        chunkNumber++;
      }
    } else {
      // No records in this chunk - we're done
      log(`   📊 No records in chunk ${chunkNumber} - reached end of data`);
      hasMoreData = false;
    }
    
    // Small delay between requests to avoid rate limiting
    if (hasMoreData) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    } // End of while loop
    
    // After fetching all chunks, process all records
    if (allRecords.length === 0) {
      log(`✅ No records found in any chunk.`);
      return [];
    }

    log(`✅ Step 1 complete: Fetched ${allRecords.length} records across all chunks`);

    // Process records by grade_name to reduce memory usage
    // Group records by grade_name
    log(`📋 Step 2: Saving assessment records to database (NEX.student_assessments)...`);
    const recordsByGrade = new Map<string, any[]>();
    
    for (const record of allRecords) {
      const gradeName = String(record['Grade Name'] || record['grade_name'] || 'Unknown').trim();
      if (!recordsByGrade.has(gradeName)) {
        recordsByGrade.set(gradeName, []);
      }
      recordsByGrade.get(gradeName)!.push(record);
    }
    
    const gradeNames = Array.from(recordsByGrade.keys()).sort();
    log(`   📊 Found ${gradeNames.length} unique grade(s): ${gradeNames.join(', ')}`);
    
    // Process each grade separately to reduce memory pressure
    for (const gradeName of gradeNames) {
      const gradeRecords = recordsByGrade.get(gradeName)!;
      log(`   📚 Processing grade "${gradeName}" (${gradeRecords.length} records)...`);
      
      try {
        const gradeInserted = await (this as any).saveAssessmentBatch(gradeRecords, schoolSourcedId);
        totalInserted += gradeInserted;
        log(`   ✅ Saved ${gradeInserted} record(s) for grade "${gradeName}"`);
        
        // Clear the grade records from memory after processing
        recordsByGrade.delete(gradeName);
      } catch (gradeError: any) {
        log(`   ❌ Failed to save records for grade "${gradeName}": ${gradeError.message}`);
        // Continue with other grades even if one fails
      }
    }
    
    log(`✅ Step 2 complete: Saved ${totalInserted} record(s) to NEX.student_assessments`);

    // Sync data to RP.student_assessments after processing completes
    if (schoolSourcedId) {
      log(`📋 Step 3: Syncing to RP.student_assessments...`);
      try {
        const rpInserted = await (this as any).syncStudentAssessmentsToRP(schoolSourcedId);
        log(`✅ Step 3 complete: Synced ${rpInserted} record(s) to RP.student_assessments`);
      } catch (rpError: any) {
        log(`⚠️  Step 3 failed: ${rpError.message}`);
        // Don't throw - allow the main process to complete even if RP sync fails
      }
    } else {
      log(`⚠️  Skipping RP sync - school sourced_id not available`);
    }

    log(`✅ Student assessments sync complete`);
    log(`   Total records fetched: ${allRecords.length}`);
    log(`   Total records saved: ${totalInserted}`);

    return allRecords;
  } catch (error) {
    console.error('Failed to fetch student assessments:', error);
    throw error;
  }
}


/**
 * Save a batch of assessment records to database using temporary table approach
 * This is faster than batched INSERT statements as SQL Server can optimize the final insert
 * Helper function used by getStudentAssessments
 */
export async function saveAssessmentBatch(
  this: BaseNexquareService,
  records: any[],
  schoolSourcedId: string | null
): Promise<number> {
  if (records.length === 0) {
    return 0;
  }

  console.log(`   💾 Starting bulk insert for ${records.length} record(s) using temporary table approach...`);

  // Build a map of Excel School ID -> School sourced_id
  // The Excel file has "School ID" which could be sourced_id or another identifier
  // We need to map it to the sourced_id for the school_id column
  console.log(`   🔍 Building school ID lookup map...`);
  const uniqueSchoolIds = new Set<string>();
  records.forEach(record => {
    const schoolId = record['School ID'];
    if (schoolId !== undefined && schoolId !== null && schoolId !== '') {
      uniqueSchoolIds.add(String(schoolId).trim());
    }
  });

  const schoolIdMap = new Map<string, string | null>();
  for (const excelSchoolId of uniqueSchoolIds) {
    // Try multiple lookup strategies to find the sourced_id:
    // 1. Check if it's already the sourced_id
    // 2. Try to find by identifier (then get sourced_id)
    // 3. Try to find by database id (then get sourced_id)
    let sourcedId: string | null = null;
    
    // First, try as sourced_id directly
    const queryBySourcedId = `
      SELECT sourced_id FROM NEX.schools WHERE sourced_id = @sourced_id;
    `;
    const resultBySourcedId = await executeQuery<{ sourced_id: string }>(queryBySourcedId, { sourced_id: excelSchoolId });
    if (!resultBySourcedId.error && resultBySourcedId.data && resultBySourcedId.data.length > 0) {
      sourcedId = resultBySourcedId.data[0].sourced_id;
    }
    
    // If not found, try by identifier
    if (!sourcedId) {
      const queryByIdentifier = `
        SELECT sourced_id FROM NEX.schools WHERE identifier = @identifier;
      `;
      const resultByIdentifier = await executeQuery<{ sourced_id: string }>(queryByIdentifier, { identifier: excelSchoolId });
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
        const resultById = await executeQuery<{ sourced_id: string }>(queryById, { id: numericId });
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
  const getValue = (record: any, colName: string): string | null => {
    const val = record[colName];
    if (val === undefined || val === null || val === '') return null;
    const str = String(val).trim();
    return str === '' ? null : str;
  };

  const getNumeric = (record: any, colName: string): number | null => {
    const val = record[colName];
    if (val === undefined || val === null || val === '') return null;
    const num = parseFloat(String(val));
    return isNaN(num) ? null : num;
  };

  // Get component value - can be either numeric or text (grade)
  const getComponentValue = (record: any, colName: string): string | null => {
    const val = record[colName];
    if (val === undefined || val === null || val === '') return null;
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
        let componentValue: string | null = null;
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
      } catch (batchError: any) {
        console.error(`❌ Error in batch ${batchNum}/${totalBatches}:`, batchError.message);
        throw batchError;
      }
    }

    await transaction.commit();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`   ✅ Bulk insert completed in ${duration} seconds`);
    
    return totalInserted;
  } catch (error: any) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
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

/**
 * Sync student assessments from NEX.student_assessments to RP.student_assessments
 * This function runs after the main processing completes
 * Filters by school_id, grades '10' and '12', and only inserts records that don't already exist
 * 
 * Note: school_id in NEX.student_assessments is NVARCHAR(100) and stores the sourced_id
 */
export async function syncStudentAssessmentsToRP(
  this: BaseNexquareService,
  schoolSourcedId: string
): Promise<number> {
  try {
    if (!schoolSourcedId) {
      console.warn(`   ⚠️  School sourced_id is required for RP sync`);
      return 0;
    }

    console.log(`   🔍 Syncing assessments for school (sourced_id: ${schoolSourcedId})`);

    // Build the INSERT query to copy from NEX to RP
    // The query filters by school_id (sourced_id), grades '10' and '12', and only inserts records that don't exist
    // school_id in NEX.student_assessments is NVARCHAR(100) and stores the sourced_id
    // Use @@ROWCOUNT to get the number of rows inserted
    // Note: This query can take up to 10 minutes for large datasets (770+ rows)
    // The reported_subject is populated from RP.subject_mapping table via LEFT JOIN (can be NULL)
    const syncQuery = `
      INSERT INTO RP.student_assessments (
        nex_assessment_id,
        school_id,
        school_name,
        region_name,
        student_name,
        register_number,
        student_status,
        grade_name,
        section_name,
        class_name,
        academic_year,
        subject_id,
        subject_name,
        term_id,
        term_name,
        component_name,
        component_value,
        max_value,
        data_type,
        calculation_method,
        mark_grade_name,
        mark_rubric_name,
        reported_subject,
        created_at,
        updated_at
      )
      SELECT 
        sa.id,
        sa.school_id,
        sa.school_name,
        sa.region_name,
        sa.student_name,
        sa.register_number,
        sa.student_status,
        sa.grade_name,
        sa.section_name,
        sa.class_name,
        sa.academic_year,
        sa.subject_id,
        sa.subject_name,
        sa.term_id,
        sa.term_name,
        sa.component_name,
        sa.component_value,
        sa.max_value,
        sa.data_type,
        sa.calculation_method,
        sa.mark_grade_name,
        sa.mark_rubric_name,
        sm.reported_subject,
        sa.created_at,
        sa.updated_at
      FROM NEX.student_assessments sa
      INNER JOIN RP.assessment_component_config acc 
        ON sa.school_id = acc.school_id 
        AND sa.component_name = acc.component_name
        AND acc.is_active = 1
      LEFT JOIN RP.subject_mapping sm
        ON sa.school_id = sm.school_id
        AND sa.academic_year = sm.academic_year
        AND sa.grade_name = sm.grade
        AND sa.subject_name = sm.subject
      WHERE NOT EXISTS (
        SELECT 1 
        FROM RP.student_assessments rsa
        WHERE rsa.nex_assessment_id = sa.id
      )
      AND sa.grade_name IN ('10', '12')
      AND sa.school_id = @school_id;
      
      SELECT @@ROWCOUNT AS rows_affected;
    `;

    // Use a direct connection request with explicit 10-minute timeout for this long-running operation
    const connection = await getConnection();
    const request = connection.request();
    (request as { timeout?: number }).timeout = 600000; // 10 minutes
    
    // Add parameters
    request.input('school_id', sql.NVarChar(100), schoolSourcedId);
    
    console.log(`   ⏱️  Executing sync query (timeout: 10 minutes)...`);
    const startTime = Date.now();
    
    const queryResult = await request.query(syncQuery);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`   ✅ Query completed in ${duration} seconds`);
    
    // Get the number of rows inserted from @@ROWCOUNT
    const rowsAffected = queryResult.recordset?.[0]?.rows_affected || 0;
    
    console.log(`   ✅ Synced ${rowsAffected} record(s) to RP.student_assessments`);
    
    // Update reported_subject for existing records (including newly synced ones)
    try {
      console.log(`   🔄 Updating reported_subject for existing records...`);
      const updateCount = await updateReportedSubjectForSchool.call(this, schoolSourcedId);
      console.log(`   ✅ Updated ${updateCount} record(s) with reported_subject`);
    } catch (updateError: any) {
      console.warn(`   ⚠️  Failed to update reported_subject: ${updateError.message}`);
      // Don't throw - allow sync to succeed even if reported_subject update fails
    }
    
    return rowsAffected;
  } catch (error: any) {
    console.error(`   ❌ Error syncing to RP.student_assessments:`, error);
    throw error;
  }
}

/**
 * Update reported_subject in RP.student_assessments for a specific school
 * This function updates existing records with the correct reported_subject from RP.subject_mapping
 * 
 * @param schoolSourcedId - School sourced_id to filter updates
 * @returns Number of records updated
 */
export async function updateReportedSubjectForSchool(
  this: BaseNexquareService,
  schoolSourcedId: string
): Promise<number> {
  try {
    if (!schoolSourcedId) {
      console.warn(`   ⚠️  School sourced_id is required for reported_subject update`);
      return 0;
    }

    // Update query that joins with subject_mapping to set reported_subject
    const updateQuery = `
      UPDATE rsa
      SET rsa.reported_subject = sm.reported_subject,
          rsa.updated_at = SYSDATETIMEOFFSET()
      FROM RP.student_assessments rsa
      INNER JOIN RP.subject_mapping sm
          ON rsa.school_id = sm.school_id
          AND rsa.academic_year = sm.academic_year
          AND rsa.grade_name = sm.grade
          AND rsa.subject_name = sm.subject
      WHERE rsa.school_id = @school_id
          AND (
              rsa.reported_subject IS NULL  -- Update if not set
              OR rsa.reported_subject != sm.reported_subject  -- Or if mapping has changed
          );
      
      SELECT @@ROWCOUNT AS rows_affected;
    `;

    const connection = await getConnection();
    const request = connection.request();
    (request as { timeout?: number }).timeout = 600000; // 10 minutes
    
    request.input('school_id', sql.NVarChar(100), schoolSourcedId);
    
    const queryResult = await request.query(updateQuery);
    const rowsAffected = queryResult.recordset?.[0]?.rows_affected || 0;
    
    return rowsAffected;
  } catch (error: any) {
    console.error(`   ❌ Error updating reported_subject:`, error);
    throw error;
  }
}
