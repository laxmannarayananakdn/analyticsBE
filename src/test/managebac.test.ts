/**
 * ManageBac Integration Test Script
 * Run with: npx tsx src/test/managebac.test.ts
 */

import { manageBacService } from '../services/ManageBacService/index.js';
import { executeQuery } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.MANAGEBAC_API_KEY || '';

if (!API_KEY) {
  console.error('❌ MANAGEBAC_API_KEY not found in .env file');
  process.exit(1);
}

async function testManageBacIntegration() {
  console.log('🧪 Starting ManageBac Integration Tests\n');
  console.log('=' .repeat(60));

  // Skip flag for already-completed tests (set to false to re-run them)
  const SKIP_COMPLETED_TESTS = true;

  try {
    // Test 1: Authentication
    console.log('\n📋 Test 1: Authentication');
    console.log('-'.repeat(60));
    const isAuthenticated = await manageBacService.authenticate(API_KEY);
    if (isAuthenticated) {
      console.log('✅ Authentication successful');
    } else {
      console.log('❌ Authentication failed');
      return;
    }

    // Ensure we have a school context when skipping earlier tests
    await ensureSchoolContext(SKIP_COMPLETED_TESTS);

    // Test 2: Get School Details
    // NOTE: Skipping - data already in database. Set SKIP_COMPLETED_TESTS = false to re-run
    if (!SKIP_COMPLETED_TESTS) {
      console.log('\n📋 Test 2: Get School Details');
      console.log('-'.repeat(60));
      const school = await manageBacService.getSchoolDetails(API_KEY);
      console.log('✅ School fetched:', {
        id: school.id,
        name: school.name,
        subdomain: school.subdomain
      });
    } else {
      console.log('\n⏭️  Test 2: Get School Details - SKIPPED (already in database)');
    }

    // Test 3: Get Academic Years (for all programs)
    // NOTE: Skipping - data already in database. Set SKIP_COMPLETED_TESTS = false to re-run
    if (!SKIP_COMPLETED_TESTS) {
      console.log('\n📋 Test 3: Get Academic Years (All Programs)');
      console.log('-'.repeat(60));
      try {
        // Call without programCode to process ALL programs
        const academicYears = await manageBacService.getAcademicYears(API_KEY);
        console.log('✅ Academic years fetched and saved for all programs');
        if (academicYears?.academic_years) {
          const programs = Object.keys(academicYears.academic_years);
          console.log(`   Processed ${programs.length} program(s):`, programs);
        }
      } catch (error: any) {
        console.log('⚠️  Academic years test failed:', error.message);
      }
    } else {
      console.log('\n⏭️  Test 3: Get Academic Years - SKIPPED (already in database)');
    }

    // Test 4: Get Grades
    // NOTE: Skipping - data already in database. Set SKIP_COMPLETED_TESTS = false to re-run
    if (!SKIP_COMPLETED_TESTS) {
      console.log('\n📋 Test 4: Get Grades');
      console.log('-'.repeat(60));
      try {
        const grades = await manageBacService.getGrades(API_KEY);
        console.log('✅ Grades fetched');
        if (grades?.school?.programs) {
          const programs = grades.school.programs;
          console.log(`   Found ${programs.length} program(s) with grades`);
        }
      } catch (error: any) {
        console.log('⚠️  Grades test failed:', error.message);
      }
    } else {
      console.log('\n⏭️  Test 4: Get Grades - SKIPPED (already in database)');
    }

    // Test 5: Get Subjects
    // NOTE: Skipping - data already in database. Set SKIP_COMPLETED_TESTS = false to re-run
    if (!SKIP_COMPLETED_TESTS) {
      console.log('\n📋 Test 5: Get Subjects');
      console.log('-'.repeat(60));
      try {
        const subjects = await manageBacService.getSubjects(API_KEY);
        console.log(`✅ Subjects fetched: ${subjects.length} subjects`);
        if (subjects.length > 0) {
          console.log(`   Sample: ${subjects[0].name}`);
        }
      } catch (error: any) {
        console.log('⚠️  Subjects test failed:', error.message);
      }
    } else {
      console.log('\n⏭️  Test 5: Get Subjects - SKIPPED (already in database)');
    }

    // Test 6: Get Year Groups
    // NOTE: Skipping - data already in database. Set SKIP_COMPLETED_TESTS = false to re-run
    if (!SKIP_COMPLETED_TESTS) {
      console.log('\n📋 Test 6: Get Year Groups');
      console.log('-'.repeat(60));
      try {
        const yearGroups = await manageBacService.getYearGroups(API_KEY);
        console.log(`✅ Year groups fetched: ${yearGroups.length} year groups`);
        if (yearGroups.length > 0) {
          console.log(`   Sample: ${yearGroups[0].name} (${yearGroups[0].program})`);
        }
      } catch (error: any) {
        console.log('⚠️  Year groups test failed:', error.message);
      }
    } else {
      console.log('\n⏭️  Test 6: Get Year Groups - SKIPPED (already in database)');
    }

    // Test 7: Get Teachers
    console.log('\n📋 Test 7: Get Teachers');
    console.log('-'.repeat(60));
    try {
      const teachers = await manageBacService.getTeachers(API_KEY, { active_only: true });
      console.log(`✅ Teachers fetched: ${teachers.length} teachers`);
      if (teachers.length > 0) {
        console.log(`   Sample: ${teachers[0].first_name} ${teachers[0].last_name}`);
      }
    } catch (error: any) {
      console.log('⚠️  Teachers test failed:', error.message);
    }

        // Test 8: Get Students
        // NOTE: Skipping - data already in database. Set SKIP_COMPLETED_TESTS = false to re-run
        if (!SKIP_COMPLETED_TESTS) {
          console.log('\n📋 Test 8: Get Students');
          console.log('-'.repeat(60));
          try {
            const students = await manageBacService.getStudents(API_KEY, { active_only: true });
            console.log(`✅ Students fetched: ${students.length} students`);
            if (students.length > 0) {
              console.log(`   Sample: ${students[0].first_name} ${students[0].last_name}`);
              console.log('   ✅ Students should be saved to database');
            }
          } catch (error: any) {
            console.log('⚠️  Students test failed:', error.message);
          }
        } else {
          console.log('\n⏭️  Test 8: Get Students - SKIPPED (already in database)');
        }

        // Test 9: Get Classes
        // NOTE: Skipping - classes are already loaded via memberships. Set SKIP_COMPLETED_TESTS = false to re-run
        if (!SKIP_COMPLETED_TESTS) {
          console.log('\n📋 Test 9: Get Classes');
          console.log('-'.repeat(60));
          try {
            const classes = await manageBacService.getClasses(API_KEY);
            console.log(`✅ Classes fetched: ${classes.length} classes`);
            if (classes.length > 0) {
              console.log(`   Sample: ${classes[0].name}`);
            }
          } catch (error: any) {
            console.log('⚠️  Classes test failed:', error.message);
          }
        } else {
          console.log('\n⏭️  Test 9: Get Classes - SKIPPED (already loaded via memberships)');
        }

        // Test 10: Sync Class Memberships for Year Group 11176256
        // NOTE: Skipping - data already in database. Set SKIP_COMPLETED_TESTS = false to re-run
        if (!SKIP_COMPLETED_TESTS) {
          console.log('\n📋 Test 10: Sync Class Memberships for Year Group 11176256');
          console.log('-'.repeat(60));
          try {
            await manageBacService.syncClassMembershipsForYearGroup(API_KEY, 11176256);
            console.log('✅ Class memberships sync completed');
          } catch (error: any) {
            console.log('⚠️  Class memberships sync failed:', error.message);
          }
        } else {
          console.log('\n⏭️  Test 10: Sync Class Memberships for Year Group 11176256 - SKIPPED (already in database)');
        }

        // Test 11: Sync Term Grades for Year Group 11176256
        console.log('\n📋 Test 11: Sync Term Grades for Year Group 11176256');
        console.log('-'.repeat(60));
        try {
          await manageBacService.syncTermGradesForYearGroup(API_KEY, 11176256);
          console.log('✅ Term grades sync completed');
        } catch (error: any) {
          console.log('⚠️  Term grades sync failed:', error.message);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests completed!');
    console.log('\n💡 Next steps:');
    console.log('   1. Check Azure SQL Database to verify data was saved');
    console.log('   2. Test API endpoints via HTTP requests');
    console.log('   3. Test analytics endpoints');

  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function ensureSchoolContext(skipCompletedTests: boolean): Promise<void> {
  if (!skipCompletedTests) {
    return;
  }

  if (manageBacService.getCurrentSchoolId()) {
    return;
  }

  console.log('\n📌 Attempting to reuse existing school context from database...');
  const existingSchool = await executeQuery<{ id: number }>(
    'SELECT TOP 1 id FROM MB.schools ORDER BY updated_at DESC'
  );

  if (existingSchool.data?.[0]?.id) {
    const schoolId = existingSchool.data[0].id;
    manageBacService.setCurrentSchoolId(Number(schoolId));
    console.log(`✅ Reusing school ID ${schoolId} from database`);
    return;
  }

  console.log('⚠️ No school found locally; fetching from ManageBac once to initialize context.');
  const school = await manageBacService.getSchoolDetails(API_KEY);
  console.log('✅ School context initialized:', {
    id: school.id,
    name: school.name
  });
}

// Run tests
testManageBacIntegration()
  .then(() => {
    console.log('\n✅ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test script error:', error);
    process.exit(1);
  });

