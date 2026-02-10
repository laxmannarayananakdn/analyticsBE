# Nexquare Database Tables

This document lists all the database tables in the `NEX` schema that are populated by the Nexquare API services.

## Tables Populated by NexquareService

### 1. **NEX.schools**
- **Method**: `upsertNexquareSchool`
- **API Endpoint**: `/nexquare/ims/oneroster/v1p1/schools` (GET schools)
- **Service File**: `schools.ts` → `getSchools()`
- **Fields**: sourced_id, name, identifier, status, type, date_last_modified, metadata

### 2. **NEX.students**
- **Method**: `bulkInsertStudents`
- **API Endpoint**: `/ims/oneroster/v1p1/schools/{schoolId}/students/` (GET students)
- **Service File**: `students.ts` → `getStudents()`
- **Fields**: school_id, sourced_id, identifier, full_name, first_name, last_name, email, username, user_type, status, date_last_modified, academic_year, metadata, current_grade, current_class, current_class_id, grades, phone, mobile_number, sms, gender, student_dob, religion, admission_date, join_date, parent_name, guardian_one_full_name, guardian_two_full_name, guardian_one_mobile, guardian_two_mobile, primary_contact, student_reg_id, family_code, student_national_id, student_status, class_grade, class_section, homeroom_teacher_sourced_id

### 3. **NEX.staff**
- **Method**: `bulkInsertStaff`
- **API Endpoint**: `/ims/oneroster/v1p1/schools/{schoolId}/teachers` (GET staff)
- **Service File**: `staff.ts` → `getStaff()`
- **Fields**: school_id, sourced_id, identifier, full_name, first_name, last_name, email, username, user_type, role, status, date_last_modified, metadata

### 4. **NEX.classes**
- **Method**: `bulkInsertClasses`
- **API Endpoint**: `/ims/oneroster/v1p1/schools/{schoolId}/classes/` (GET classes)
- **Service File**: `classes.ts` → `getClasses()`
- **Fields**: school_id, sourced_id, title, class_name, grade_name, course_code, status, date_last_modified, metadata

### 5. **NEX.allocation_master**
- **Method**: `upsertNexquareAllocationMaster`
- **API Endpoint**: `/ims/oneroster/v1p1/allocationMaster/{schoolId}` (GET allocation master)
- **Service File**: `allocationMaster.ts` → `getAllocationMaster()`
- **Fields**: school_id, sourced_id, allocation_type, entity_type, entity_sourced_id, entity_name, status, date_last_modified, metadata

### 6. **NEX.subjects**
- **Method**: `upsertNexquareSubject`
- **API Endpoint**: Extracted from `/ims/oneroster/v1p1/schools/{schoolId}/studentsAllocation` (GET student allocations)
- **Service File**: `studentAllocations.ts` → `getStudentAllocations()`
- **Fields**: sourced_id, subject_id, subject_name, school_id

### 7. **NEX.cohorts**
- **Method**: `upsertNexquareCohort`
- **API Endpoint**: Extracted from `/ims/oneroster/v1p1/schools/{schoolId}/studentsAllocation` (GET student allocations)
- **Service File**: `studentAllocations.ts` → `getStudentAllocations()`
- **Fields**: sourced_id, cohort_id, cohort_name, school_id

### 8. **NEX.groups**
- **Method**: `upsertNexquareGroup`
- **API Endpoint**: Extracted from `/ims/oneroster/v1p1/schools/{schoolId}/studentsAllocation` (GET student allocations)
- **Service File**: `studentAllocations.ts` → `getStudentAllocations()`
- **Fields**: sourced_id, group_name, unique_key, school_id

### 9. **NEX.homerooms**
- **Method**: `upsertNexquareHomeroom`
- **API Endpoint**: Extracted from `/ims/oneroster/v1p1/schools/{schoolId}/studentsAllocation` (GET student allocations)
- **Service File**: `studentAllocations.ts` → `getStudentAllocations()`
- **Fields**: sourced_id, class_name, grade_name, school_id

### 10. **NEX.student_allocations**
- **Method**: `bulkInsertStudentAllocations`
- **API Endpoint**: `/ims/oneroster/v1p1/schools/{schoolId}/studentsAllocation` (GET student allocations)
- **Service File**: `studentAllocations.ts` → `getStudentAllocations()`
- **Fields**: student_id, student_sourced_id, school_id, academic_year, subject_sourced_id, subject_id, subject_name, allocation_type, cohort_sourced_id, cohort_id, cohort_name, lesson_sourced_id, lesson_id, lesson_name, class_id, homeroom_sourced_id, homeroom_class_name, homeroom_grade_name, group_sourced_id, group_id, group_name

### 11. **NEX.staff_allocations**
- **Method**: `bulkInsertStaffAllocations`
- **API Endpoint**: `/ims/oneroster/v1p1/schools/{schoolId}/staffAllocation` (GET staff allocations)
- **Service File**: `staffAllocations.ts` → `getStaffAllocations()`
- **Fields**: staff_id, staff_sourced_id, school_id, academic_year, subject_sourced_id, subject_id, subject_name, allocation_type, cohort_sourced_id, cohort_id, cohort_name, lesson_sourced_id, lesson_id, lesson_name, class_id

### 12. **NEX.daily_plans**
- **Method**: `bulkInsertDailyPlans`
- **API Endpoint**: `/ims/oneroster/v1p1/dailyPlan` (GET daily plans)
- **Service File**: `dailyPlans.ts` → `getDailyPlans()`
- **Fields**: school_id, plan_date, timetable_lesson_sourced_id, lesson_id, lesson_name, subject_sourced_id, subject_name, class_sourced_id, class_name, cohort_sourced_id, cohort_name, teacher_sourced_id, teacher_name, location_sourced_id, location_name, start_time, end_time, period_number, status, metadata

### 13. **NEX.daily_attendance**
- **Method**: `bulkInsertDailyAttendance`
- **API Endpoint**: `/ims/oneroster/v1p1/getDailyAttendance` (GET daily attendance)
- **Service File**: `dailyAttendance.ts` → `getDailyAttendance()`
- **Fields**: school_id, student_id, student_sourced_id, attendance_date, status, category_code, category_name, category_required, range_type, notes, metadata

### 14. **NEX.student_assessments**
- **Method**: Direct INSERT (via `saveAssessmentBatch` helper)
- **API Endpoint**: `/ims/oneroster/v1p1/assessment/students` (GET student assessments - returns CSV/Excel file)
- **Service File**: `studentAssessments.ts` → `getStudentAssessments()`
- **Fields**: school_id, school_name, region_name, student_name, register_number, student_status, grade_name, section_name, class_name, academic_year, subject_id, subject_name, term_id, term_name, component_name, component_value, max_value, data_type, calculation_method, mark_grade_name, mark_rubric_name, created_at, updated_at

## Summary

Total: **14 tables** in the `NEX` schema are populated by the Nexquare API services.

### By Category:

- **Core Entities**: schools, students, staff, classes
- **Reference Data**: subjects, cohorts, groups, homerooms, allocation_master
- **Relationships**: student_allocations, staff_allocations
- **Temporal Data**: daily_plans, daily_attendance, student_assessments
