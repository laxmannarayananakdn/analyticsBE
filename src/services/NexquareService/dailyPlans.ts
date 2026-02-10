/**
 * Daily Plans Methods
 * Handles fetching and saving daily plans (timetable data) from Nexquare API
 */

import { NEXQUARE_ENDPOINTS } from '../../config/nexquare';
import type { NexquareConfig } from '../../middleware/configLoader';
import { databaseService } from '../DatabaseService';
import type { BaseNexquareService } from './BaseNexquareService';

/**
 * Get daily plans (timetable data)
 * Note: API limits date range to 1 week, so we fetch week by week
 * Can be added to a class that extends BaseNexquareService
 */
export async function getDailyPlans(
  this: BaseNexquareService,
  config: NexquareConfig,
  schoolId?: string,
  fromDate?: string,
  toDate?: string,
  subject?: string,
  classId?: string,
  cohort?: string,
  teacher?: string,
  location?: string
): Promise<any[]> {
  try {
    const targetSchoolId = schoolId || this.getCurrentSchoolId();
    if (!targetSchoolId) {
      throw new Error('School ID is required');
    }

    // Default to current week if no dates provided
    // API allows max 7 days range (inclusive), so we use 6 days from today
    const today = new Date();
    const defaultFromDate = fromDate || (this as any).formatDateForAPI(today);
    // Calculate 6 days from today to ensure we stay within 7-day limit (inclusive)
    const sixDaysLater = new Date(today);
    sixDaysLater.setDate(sixDaysLater.getDate() + 6);
    const defaultToDate = toDate || (this as any).formatDateForAPI(sixDaysLater);

    console.log(`📅 Fetching daily plans for school ${targetSchoolId} from ${defaultFromDate} to ${defaultToDate}...`);
    
    const allPlans: any[] = [];
    
    // Get the school sourced_id from sourced_id
    const schoolSourcedId = await (this as any).getSchoolSourcedId(targetSchoolId);
    if (!schoolSourcedId) {
      console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Plans will be saved with school_id = NULL.`);
    }

    // Helper function to fetch plans for a date range
    const fetchPlansForRange = async (startDate: string, endDate: string): Promise<any[]> => {
      const endpoint = NEXQUARE_ENDPOINTS.DAILY_PLAN;
      const queryParams = new URLSearchParams();
      queryParams.append('fromDate', startDate);
      queryParams.append('toDate', endDate);
      queryParams.append('schooolId', targetSchoolId); // Note: API uses "schooolId" (3 o's)
      
      if (subject) queryParams.append('subject', subject);
      if (classId) queryParams.append('class', classId);
      if (cohort) queryParams.append('cohort', cohort);
      if (teacher) queryParams.append('teacher', teacher);
      if (location) queryParams.append('location', location);

      const url = `${endpoint}?${queryParams.toString()}`;
      const response = await this.makeRequest<Record<string, unknown>>(url, config);

      // Handle different response structures
      let plans: any[] = [];
      if (Array.isArray(response)) {
        plans = response;
      } else if (response.plans && Array.isArray(response.plans)) {
        plans = response.plans;
      } else if (response.data && Array.isArray(response.data)) {
        plans = response.data;
      } else if (response.dailyPlan && Array.isArray(response.dailyPlan)) {
        plans = response.dailyPlan;
      } else if (typeof response === 'object' && response !== null) {
        plans = [response];
      }

      return plans;
    };

    // Fetch plans for the specified date range (or current week)
    const plans = await fetchPlansForRange(defaultFromDate, defaultToDate);
    allPlans.push(...plans);
    console.log(`   Fetched ${plans.length} daily plan(s) for date range`);

    console.log(`✅ Found ${allPlans.length} total daily plan(s)`);

    // Save daily plans to database using bulk insert
    console.log('💾 Preparing daily plans for bulk insert...');

    const recordsToInsert: Array<{
      school_id?: string | null;
      plan_date: Date | string;
      timetable_lesson_sourced_id?: string | null;
      lesson_id?: string | null;
      lesson_name?: string | null;
      subject_sourced_id?: string | null;
      subject_name?: string | null;
      class_sourced_id?: string | null;
      class_name?: string | null;
      cohort_sourced_id?: string | null;
      cohort_name?: string | null;
      teacher_sourced_id?: string | null;
      teacher_name?: string | null;
      location_sourced_id?: string | null;
      location_name?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      period_number?: number | null;
      status?: string | null;
      metadata?: string | null;
    }> = [];

    let skippedCount = 0;

    for (const plan of allPlans) {
      try {
        const metadataJson = plan.metadata ? JSON.stringify(plan.metadata) : null;
        const planDate = plan.date || plan.planDate || plan.plan_date || defaultFromDate;

        recordsToInsert.push({
          school_id: schoolSourcedId,
          plan_date: planDate,
          timetable_lesson_sourced_id: plan.timetableLessonSourcedId || plan.timetable_lesson_sourced_id || plan.ttLesson || null,
          lesson_id: plan.lessonId || plan.lesson_id || null,
          lesson_name: plan.lessonName || plan.lesson_name || null,
          subject_sourced_id: plan.subjectSourcedId || plan.subject_sourced_id || plan.subject || null,
          subject_name: plan.subjectName || plan.subject_name || null,
          class_sourced_id: plan.classSourcedId || plan.class_sourced_id || plan.class || null,
          class_name: plan.className || plan.class_name || null,
          cohort_sourced_id: plan.cohortSourcedId || plan.cohort_sourced_id || plan.cohort || null,
          cohort_name: plan.cohortName || plan.cohort_name || null,
          teacher_sourced_id: plan.teacherSourcedId || plan.teacher_sourced_id || plan.teacher || null,
          teacher_name: plan.teacherName || plan.teacher_name || null,
          location_sourced_id: plan.locationSourcedId || plan.location_sourced_id || plan.location || null,
          location_name: plan.locationName || plan.location_name || null,
          start_time: plan.startTime || plan.start_time || null,
          end_time: plan.endTime || plan.end_time || null,
          period_number: plan.periodNumber || plan.period_number || null,
          status: plan.status || null,
          metadata: metadataJson,
        });
      } catch (error: any) {
        console.error(`❌ Error preparing daily plan:`, error.message);
        skippedCount++;
      }
    }

    console.log(`   💾 Bulk inserting ${recordsToInsert.length} daily plan(s) to database...`);
    const { inserted, error: bulkError } = await databaseService.bulkInsertDailyPlans(recordsToInsert);

    if (bulkError) {
      console.error(`❌ Bulk insert failed: ${bulkError}`);
      throw new Error(`Bulk insert failed: ${bulkError}`);
    }

    console.log(`✅ Saved ${inserted} daily plan(s) to database`);
    if (skippedCount > 0) {
      console.warn(`⚠️  Skipped ${skippedCount} daily plan(s) due to errors`);
    }

    return allPlans;
  } catch (error) {
    console.error('Failed to fetch daily plans:', error);
    throw error;
  }
}
