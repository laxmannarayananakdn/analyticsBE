# NexquareService - Refactored Structure

## Overview

The original `NexquareService.ts` file (3002 lines) has been refactored into a modular structure for better maintainability.

## Structure

```
NexquareService/
├── BaseNexquareService.ts      # Base class with shared utilities (token management, HTTP requests)
├── index.ts                    # Main class that composes all methods into NexquareService
├── helpers.ts                  # Helper methods (bulkGetStudentIds, bulkGetGroupIds)
├── auth.ts                     # Authentication methods
├── schools.ts                  # School methods (getSchools, verifySchoolAccess)
├── students.ts                 # Student methods
├── staff.ts                    # Staff methods
├── classes.ts                  # Class methods
├── allocationMaster.ts         # Allocation master methods
├── studentAllocations.ts       # Student allocation methods
├── staffAllocations.ts         # Staff allocation methods
├── dailyPlans.ts               # Daily plans methods
├── dailyAttendance.ts          # Daily attendance methods
└── studentAssessments.ts       # Student assessments methods (includes saveAssessmentBatch helper)
```

## Testing the New Structure

### Step 1: Update Routes to Use New Structure

Update `backend/src/routes/nexquare.ts`:

```typescript
// Change from:
import { nexquareService } from '../services/NexquareService';

// To:
import { nexquareService } from '../services/NexquareService/index';
```

**OR** temporarily rename the original file:

```bash
cd backend/src/services
mv NexquareService.ts NexquareService.ts.old
```

Then the import `from '../services/NexquareService'` will automatically resolve to the folder's `index.ts`.

### Step 2: Test the Service

The service maintains the same interface, so all existing routes should work without modification. Test using your existing API endpoints:

- `POST /api/nexquare/authenticate`
- `GET /api/nexquare/schools`
- `GET /api/nexquare/students`
- `GET /api/nexquare/staff`
- etc.

### Step 3: Verify Functionality

All methods are bound to the class instance and maintain the same interface:
- `authenticate(config)`
- `getSchools(config, filter?)`
- `verifySchoolAccess(config, schoolId)`
- `getStudents(config, schoolId?, filter?, fetchMode?)`
- `getStaff(config, schoolId?, filter?)`
- `getClasses(config, schoolId?)`
- `getAllocationMaster(config, schoolId?)`
- `getStudentAllocations(config, schoolId?)`
- `getStaffAllocations(config, schoolId?)`
- `getDailyPlans(config, schoolId?, fromDate?, toDate?, ...)`
- `getDailyAttendance(config, schoolId?, startDate?, endDate?, ...)`
- `getStudentAssessments(config, schoolId?, academicYear?, fileName?, limit?, offset?)`

## Notes

- The original `NexquareService.ts` file remains unchanged (located at `backend/src/services/NexquareService.ts`)
- All methods are properly bound to the class instance using `.bind(this)`
- Helper methods (`bulkGetStudentIds`, `bulkGetGroupIds`) are included in the composed class
- The singleton instance (`nexquareService`) is exported for backward compatibility
- All files compile successfully (only pre-existing errors in other files)

## Reverting

If you need to revert to the original structure:
1. Delete or rename the `NexquareService/` folder
2. Restore the original `NexquareService.ts` file (if renamed)
3. Update the import back to `from '../services/NexquareService'`
