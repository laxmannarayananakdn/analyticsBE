/**
 * Daily Attendance Methods
 * Handles fetching and saving daily attendance records from Nexquare API
 * Fetches in monthly chunks to avoid timeout
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare';
import type { NexquareConfig } from '../../middleware/configLoader';
import { databaseService } from '../DatabaseService';
import type { BaseNexquareService } from './BaseNexquareService';

/**
 * Get daily attendance records
 * Fetches in monthly chunks to avoid timeout
 * Can be added to a class that extends BaseNexquareService
 */
export async function getDailyAttendance(
  this: BaseNexquareService & { bulkGetStudentIds: (ids: string[]) => Promise<Map<string, { id: number; sourced_id: string }>> },
  config: NexquareConfig,
  schoolId?: string,
  startDate?: string,
  endDate?: string,
  categoryRequired: boolean = false,
  rangeType: number = 0,
  studentSourcedId?: string
): Promise<any[]> {
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    // Default to current academic year if no dates provided
    const today = new Date();
    const defaultStartDate = startDate || (this as any).formatDateForAPI(new Date(today.getFullYear(), 0, 1)); // Jan 1 of current year
    const defaultEndDate = endDate || (this as any).formatDateForAPI(today);

    console.log(`📊 Fetching daily attendance for school ${targetSchoolId} from ${defaultStartDate} to ${defaultEndDate}...`);
    
    const allAttendance: any[] = [];
    
    // Get the school sourced_id from sourced_id
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Attendance will be saved with school_id = NULL.`);
    }

    // Helper function to fetch attendance for a date range
    const fetchAttendanceForRange = async (
      start: string,
      end: string,
      offset: number = 0
    ): Promise<{ records: any[]; hasMore: boolean }> => {
      const endpoint = NEXQUARE_ENDPOINTS.DAILY_ATTENDANCE;
      const queryParams = new URLSearchParams();
      queryParams.append('limit', '1000');
      queryParams.append('offset', offset.toString());
      queryParams.append('startDate', start);
      queryParams.append('endDate', end);
      queryParams.append('schoolId', targetSchoolId);
      queryParams.append('categoryRequired', categoryRequired.toString());
      queryParams.append('rangeType', rangeType.toString());
      
      if (studentSourcedId) {
        queryParams.append('sourcedID', studentSourcedId);
      }

      const url = `${endpoint}?${queryParams.toString()}`;
      const response = await (this as any).makeRequest<any>(url, config);

      // Debug: Log response structure for first call (first chunk, first offset)
      if (offset === 0) {
        console.log('🔍 Daily attendance response keys:', Object.keys(response).join(', '));
        if (response.attendance && Array.isArray(response.attendance) && response.attendance.length > 0) {
          console.log('🔍 First attendance record keys:', Object.keys(response.attendance[0]).join(', '));
          console.log('🔍 First attendance sample:', JSON.stringify(response.attendance[0]).substring(0, 300));
        } else if (Array.isArray(response) && response.length > 0) {
          console.log('🔍 First attendance record keys:', Object.keys(response[0]).join(', '));
          console.log('🔍 First attendance sample:', JSON.stringify(response[0]).substring(0, 300));
        }
      }

      // Handle different response structures
      let records: any[] = [];
      
      // Nexquare API structure: response.data.attendanceList = array of students
      // Each student has: { studentId, attendanceList: [array of attendance records] }
      if (response.data && response.data.attendanceList && Array.isArray(response.data.attendanceList)) {
        // Flatten: one record per attendance entry per student
        for (const student of response.data.attendanceList) {
          const studentId = student.studentId || student.student_id;
          
          // Each student has an attendanceList array
          if (student.attendanceList && Array.isArray(student.attendanceList)) {
            for (const attendanceRecord of student.attendanceList) {
              records.push({
                ...attendanceRecord,
                studentId: studentId, // Add studentId to each record
                // Map attendanceDate to date for consistency
                date: attendanceRecord.attendanceDate || attendanceRecord.date || attendanceRecord.attendance_date,
                attendanceDate: attendanceRecord.attendanceDate || attendanceRecord.date || attendanceRecord.attendance_date
              });
            }
          }
        }
      } else if (Array.isArray(response)) {
        records = response;
      } else if (response.attendance && Array.isArray(response.attendance)) {
        records = response.attendance;
      } else if (response.data && Array.isArray(response.data)) {
        records = response.data;
      } else if (response.dailyAttendance && Array.isArray(response.dailyAttendance)) {
        records = response.dailyAttendance;
      } else if (response.students && Array.isArray(response.students)) {
        // Response might have students array with nested attendance
        // Flatten: one record per student per date
        for (const student of response.students) {
          if (student.attendance && typeof student.attendance === 'object') {
            // Attendance is an object with dates as keys
            for (const [date, attendanceData] of Object.entries(student.attendance)) {
              const dataObj = typeof attendanceData === 'object' && attendanceData !== null 
                ? attendanceData as Record<string, any>
                : {};
              records.push({
                ...dataObj,
                studentSourcedId: student.sourcedId || student.id,
                date: date
              });
            }
          } else {
            // Single attendance record for student
            records.push({
              ...student,
              studentSourcedId: student.sourcedId || student.id
            });
          }
        }
      } else if (typeof response === 'object' && response !== null) {
        records = [response];
      }

      return {
        records,
        hasMore: records.length >= 1000 // If we got full limit, might have more
      };
    };

    // Split date range into monthly chunks to avoid timeout
    const start = new Date(defaultStartDate);
    const end = new Date(defaultEndDate);
    const chunks: Array<{ start: string; end: string }> = [];

    let currentStart = new Date(start);
    while (currentStart <= end) {
      const chunkEnd = new Date(currentStart);
      chunkEnd.setMonth(chunkEnd.getMonth() + 1);
      chunkEnd.setDate(0); // Last day of current month
      
      if (chunkEnd > end) {
        chunkEnd.setTime(end.getTime());
      }

      chunks.push({
        start: (this as any).formatDateForAPI(currentStart),
        end: (this as any).formatDateForAPI(chunkEnd)
      });

      currentStart = new Date(chunkEnd);
      currentStart.setDate(currentStart.getDate() + 1); // Start of next month
    }

    console.log(`   Processing ${chunks.length} monthly chunk(s)...`);

    // Fetch attendance for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`   Fetching chunk ${i + 1}/${chunks.length}: ${chunk.start} to ${chunk.end}...`);
      
      let chunkOffset = 0;
      let chunkHasMore = true;

      while (chunkHasMore) {
        const { records, hasMore } = await fetchAttendanceForRange(
          chunk.start,
          chunk.end,
          chunkOffset
        );

        if (records.length === 0) {
          chunkHasMore = false;
          break;
        }

        allAttendance.push(...records);
        console.log(`     Fetched ${records.length} record(s) (total: ${allAttendance.length})`);

        if (!hasMore || records.length < 1000) {
          chunkHasMore = false;
        } else {
          chunkOffset += 1000;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Found ${allAttendance.length} total daily attendance record(s)`);

    // Save attendance to database using bulk insert
    console.log('💾 Preparing daily attendance records for bulk insert...');
    
    // Debug: Log first record structure
    if (allAttendance.length > 0) {
      console.log('🔍 First attendance record structure:', JSON.stringify(allAttendance[0]).substring(0, 500));
      console.log('🔍 First attendance record keys:', Object.keys(allAttendance[0]).join(', '));
    }

    // Step 1: Collect all student identifiers for bulk lookup
    const studentIdentifiers = new Set<string>();
    for (const record of allAttendance) {
      const studentIdNum = record.studentId || record.student_id;
      const studentSourcedId = record.sourcedId || record.studentSourcedId || record.sourcedID || (studentIdNum ? String(studentIdNum) : null);
      if (studentSourcedId) {
        studentIdentifiers.add(studentSourcedId);
        // Also try with ST- prefix if numeric
        if (/^\d+$/.test(studentSourcedId)) {
          studentIdentifiers.add(`ST-${studentSourcedId}`);
        }
      }
    }

    console.log(`   🔍 Bulk fetching student IDs for ${studentIdentifiers.size} unique student(s)...`);
    const studentIdMap = await this.bulkGetStudentIds(Array.from(studentIdentifiers));
    console.log(`   ✅ Found ${studentIdMap.size} student ID(s) in database`);

    // Step 2: Prepare all records for bulk insert
    const recordsToInsert: Array<{
      school_id?: string | null;
      student_id?: number | null;
      student_sourced_id?: string | null;
      attendance_date: Date | string;
      status?: string | null;
      category_code?: string | null;
      category_name?: string | null;
      category_required?: boolean | null;
      range_type?: number | null;
      notes?: string | null;
      metadata?: string | null;
    }> = [];

    let skippedCount = 0;

    for (const record of allAttendance) {
      try {
        // Extract student identifier - API uses numeric studentId
        const studentIdNum = record.studentId || record.student_id;
        let studentSourcedId = record.sourcedId || record.studentSourcedId || record.sourcedID || (studentIdNum ? String(studentIdNum) : null);

        // If no student identifier, skip this record
        if (!studentIdNum && !studentSourcedId) {
          skippedCount++;
          continue;
        }

        // Parse attendance date - API returns "Jan 2, 2024 12:00:00 AM" format
        let attendanceDate: string = defaultStartDate;
        if (record.attendanceDate) {
          try {
            const dateObj = new Date(record.attendanceDate);
            if (!isNaN(dateObj.getTime())) {
              attendanceDate = (this as any).formatDateForAPI(dateObj);
            }
          } catch (e) {
            attendanceDate = record.date || record.attendance_date || defaultStartDate;
          }
        } else {
          attendanceDate = record.date || record.attendance_date || defaultStartDate;
        }

        // Get student_id from bulk lookup map
        let dbStudentId: number | null = null;
        if (studentSourcedId) {
          // Try direct lookup
          const studentInfo = studentIdMap.get(studentSourcedId);
          if (studentInfo) {
            dbStudentId = studentInfo.id;
            studentSourcedId = studentInfo.sourced_id; // Use canonical sourced_id
          } else if (/^\d+$/.test(studentSourcedId)) {
            // Try with ST- prefix
            const studentInfoWithPrefix = studentIdMap.get(`ST-${studentSourcedId}`);
            if (studentInfoWithPrefix) {
              dbStudentId = studentInfoWithPrefix.id;
              studentSourcedId = studentInfoWithPrefix.sourced_id;
            }
          }
        }

        // Map status: API uses "P" (Present), "A" (Absent), etc.
        let status: string | null = null;
        if (record.status) {
          if (typeof record.status === 'string') {
            status = record.status;
          } else if (typeof record.status === 'object' && record.status !== null) {
            status = record.status.status || record.status.code || record.status.value || 
                     record.status.name || JSON.stringify(record.status);
          }
        } else {
          status = record.attendanceStatus || null;
        }
        
        // Clean up status - remove quotes if present
        if (status && typeof status === 'string') {
          status = status.replace(/^["']|["']$/g, '').trim();
        }

        // Build metadata JSON with all record fields
        const metadataJson = JSON.stringify({
          classId: record.classId || record.class_id,
          lateStatus: record.lateStatus || record.late_status,
          staffId: record.staffId || record.staff_id,
          staffFullName: record.staffFullName || record.staff_full_name,
          createdOn: record.createdOn || record.created_on,
          createdBy: record.createdBy || record.created_by,
          smsStatus: record.smsStatus || record.sms_status,
          copyStatus: record.copyStatus || record.copy_status,
          leavingEarly: record.leavingEarly || record.leaving_early,
          attendanceDay: record.attendanceDay || record.attendance_day,
          day: record.day,
          studentStatus: record.studentStatus || record.student_status,
          createdBySourceId: record.createdBySourceId || record.created_by_source_id,
          modifiedBySourceID: record.modifiedBySourceID || record.modified_by_source_id,
          attendanceDateTimestamp: record.attendanceDateTimestamp || record.attendance_date_timestamp,
          ...(record.metadata || {})
        });

        // Extract category information
        let categoryCode: string | null = null;
        let categoryName: string | null = null;
        
        if (record.categoryCode || record.category_code) {
          categoryCode = record.categoryCode || record.category_code;
        } else if (record.status && typeof record.status === 'object' && record.status !== null) {
          categoryCode = record.status.categoryCode || record.status.category_code || 
                        record.status.code || null;
          categoryName = record.status.categoryName || record.status.category_name || 
                        record.status.name || null;
        }
        
        if (record.categoryName || record.category_name) {
          categoryName = record.categoryName || record.category_name;
        }

        recordsToInsert.push({
          school_id: schoolSourcedId,
          student_id: dbStudentId,
          student_sourced_id: studentSourcedId,
          attendance_date: attendanceDate,
          status: status,
          category_code: categoryCode,
          category_name: categoryName,
          category_required: record.categoryRequired !== undefined ? record.categoryRequired : categoryRequired,
          range_type: record.rangeType || record.range_type || rangeType,
          notes: record.notes || null,
          metadata: metadataJson,
        });
      } catch (error: any) {
        console.error(`❌ Error preparing attendance record:`, error.message);
        skippedCount++;
      }
    }

    // Step 3: Bulk insert all records using optimized bulk insert method
    console.log(`   💾 Bulk inserting ${recordsToInsert.length} record(s) to database...`);
    const { inserted, error: bulkError } = await databaseService.bulkInsertDailyAttendance(recordsToInsert);

    if (bulkError) {
      console.error(`❌ Bulk insert failed: ${bulkError}`);
      throw new Error(`Bulk insert failed: ${bulkError}`);
    }

    console.log(`✅ Saved ${inserted} daily attendance record(s) to database`);
    if (skippedCount > 0) {
      console.warn(`⚠️  Skipped ${skippedCount} record(s) due to missing identifiers or errors`);
    }

    return allAttendance;
  } catch (error) {
    console.error('Failed to fetch daily attendance:', error);
    throw error;
  }
}
