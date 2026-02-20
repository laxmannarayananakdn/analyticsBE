/**
 * Sync Orchestrator Service
 * Runs data sync for schools (ManageBac and Nexquare) with run tracking.
 * Invokes existing ManageBacService and NexquareService - no modifications to those services.
 */
import { executeQuery } from '../config/database.js';
import { getConfigsForScope } from './SyncScopeService.js';
import { manageBacService } from './ManageBacService.js';
import { nexquareService } from './NexquareService/index.js';
const MB_ENDPOINTS_ALL = ['school', 'academic-years', 'grades', 'subjects', 'teachers', 'students', 'classes', 'year-groups'];
const NEX_ENDPOINTS_ALL = ['schools', 'students', 'staff', 'classes', 'allocation-master', 'student-allocations', 'staff-allocations', 'daily-plans', 'daily-attendance', 'student-assessments'];
/**
 * Run sync for the given scope.
 * Processes schools sequentially to avoid ManageBacService singleton conflicts.
 */
export async function runSync(params) {
    const triggeredBy = params.triggeredBy || 'scheduler';
    const result = await executeQuery(`INSERT INTO admin.sync_runs (schedule_id, node_id, academic_year, status, started_at, total_schools, schools_succeeded, schools_failed, triggered_by)
     OUTPUT INSERTED.id
     VALUES (@scheduleId, @nodeId, @academicYear, 'running', @startedAt, 0, 0, 0, @triggeredBy)`, {
        scheduleId: params.scheduleId ?? null,
        nodeId: Array.isArray(params.nodeIds) ? params.nodeIds.join(',') : (params.nodeIds?.[0] ?? ''),
        academicYear: params.academicYear || new Date().getFullYear().toString(),
        startedAt: new Date(),
        triggeredBy,
    });
    if (result.error || !result.data?.[0]?.id) {
        throw new Error(result.error || 'Failed to create sync run');
    }
    const runId = Number(result.data[0].id);
    const { mb, nex } = await getConfigsForScope({
        nodeIds: params.nodeIds,
        includeDescendants: params.includeDescendants,
        all: params.all,
        academicYear: params.academicYear,
    });
    const schoolItems = [];
    for (const c of mb) {
        const sid = c.school_id != null ? String(c.school_id) : '';
        if (sid) {
            schoolItems.push({ config: c, source: 'mb', schoolId: sid, schoolName: c.school_name });
        }
    }
    for (const c of nex) {
        const sid = c.school_id?.trim() ?? '';
        if (sid) {
            schoolItems.push({ config: c, source: 'nex', schoolId: sid, schoolName: c.school_name });
        }
    }
    const totalSchools = schoolItems.length;
    await executeQuery(`UPDATE admin.sync_runs SET total_schools = @total WHERE id = @runId`, { total: totalSchools, runId });
    const endpointsMb = params.endpointsMb?.length ? params.endpointsMb : MB_ENDPOINTS_ALL;
    const endpointsNex = params.endpointsNex?.length ? params.endpointsNex : NEX_ENDPOINTS_ALL;
    let succeeded = 0;
    let failed = 0;
    const errors = [];
    for (const item of schoolItems) {
        const schoolRunResult = await executeQuery(`INSERT INTO admin.sync_run_schools (sync_run_id, school_id, school_source, config_id, school_name, status)
       OUTPUT INSERTED.id
       VALUES (@runId, @schoolId, @source, @configId, @schoolName, 'pending')`, {
            runId,
            schoolId: item.schoolId,
            source: item.source,
            configId: item.config.id,
            schoolName: item.schoolName,
        });
        if (schoolRunResult.error || !schoolRunResult.data?.[0]?.id) {
            failed++;
            errors.push(`${item.schoolName} (${item.source}): failed to create run record`);
            continue;
        }
        const schoolRunId = Number(schoolRunResult.data[0].id);
        const startedAt = new Date();
        await executeQuery(`UPDATE admin.sync_run_schools SET status = 'running', started_at = @startedAt WHERE id = @id`, { startedAt, id: schoolRunId });
        try {
            if (item.source === 'mb') {
                await syncManageBacSchool(item.config, {
                    academicYear: params.academicYear,
                    endpoints: endpointsMb,
                });
            }
            else {
                await syncNexquareSchool(item.config, item.schoolId, {
                    academicYear: params.academicYear,
                    endpoints: endpointsNex,
                });
            }
            await executeQuery(`UPDATE admin.sync_run_schools SET status = 'completed', completed_at = @completedAt WHERE id = @id`, { completedAt: new Date(), id: schoolRunId });
            succeeded++;
        }
        catch (err) {
            const errMsg = err?.message || String(err);
            failed++;
            errors.push(`${item.schoolName} (${item.source}): ${errMsg}`);
            await executeQuery(`UPDATE admin.sync_run_schools SET status = 'failed', completed_at = @completedAt, error_message = @errMsg WHERE id = @id`, {
                completedAt: new Date(),
                errMsg: errMsg.length > 4000 ? errMsg.substring(0, 4000) : errMsg,
                id: schoolRunId,
            });
        }
    }
    const status = failed > 0 && succeeded === 0 ? 'failed' : 'completed';
    const errorSummary = errors.length > 0 ? errors.slice(0, 5).join('; ') : null;
    await executeQuery(`UPDATE admin.sync_runs SET status = @status, completed_at = @completedAt, schools_succeeded = @succeeded, schools_failed = @failed, error_summary = @errorSummary WHERE id = @runId`, {
        status,
        completedAt: new Date(),
        succeeded,
        failed,
        errorSummary,
        runId,
    });
    return {
        runId,
        status,
        totalSchools,
        schoolsSucceeded: succeeded,
        schoolsFailed: failed,
        errorSummary: errorSummary ?? undefined,
    };
}
/**
 * Sync one ManageBac school.
 * ManageBacService is a singleton - must run sequentially per school.
 */
async function syncManageBacSchool(config, options) {
    const eps = options?.endpoints ?? MB_ENDPOINTS_ALL;
    const apiKey = config.api_token;
    const baseUrl = config.base_url || undefined;
    if (config.school_id != null) {
        manageBacService.setCurrentSchoolId(config.school_id);
    }
    if (eps.includes('school')) {
        await manageBacService.getSchoolDetails(apiKey, baseUrl);
    }
    if (eps.includes('academic-years')) {
        await manageBacService.getAcademicYears(apiKey, undefined, baseUrl);
    }
    if (eps.includes('grades')) {
        const academicYearId = await resolveAcademicYearId(apiKey, baseUrl, options?.academicYear);
        await manageBacService.getGrades(apiKey, academicYearId, baseUrl);
    }
    if (eps.includes('subjects')) {
        await manageBacService.getSubjects(apiKey, baseUrl);
    }
    if (eps.includes('teachers')) {
        await manageBacService.getTeachers(apiKey, {}, baseUrl);
    }
    if (eps.includes('students')) {
        await manageBacService.getStudents(apiKey, {}, baseUrl);
    }
    if (eps.includes('classes')) {
        await manageBacService.getClasses(apiKey, baseUrl);
    }
    if (eps.includes('year-groups')) {
        await manageBacService.getYearGroups(apiKey, baseUrl);
    }
}
/**
 * Resolve ManageBac academic_year_id from academic year string (e.g. "2024").
 */
async function resolveAcademicYearId(apiKey, baseUrl, academicYear) {
    if (!academicYear)
        return undefined;
    try {
        const data = await manageBacService.getAcademicYears(apiKey, undefined, baseUrl);
        const programs = data?.academic_years ?? data;
        if (typeof programs !== 'object')
            return undefined;
        for (const prog of Object.values(programs)) {
            const years = prog?.academic_years ?? [];
            for (const y of years) {
                const name = y?.name ?? '';
                if (name.includes(academicYear)) {
                    const id = y?.id ?? y?.uid;
                    return id != null ? String(id) : undefined;
                }
            }
        }
    }
    catch {
        // ignore
    }
    return undefined;
}
/**
 * Derive date range from academic year string.
 * "2024" -> Jan 1 2024 to Dec 31 2024.
 */
function getDateRangeFromAcademicYear(academicYear) {
    const year = academicYear ? parseInt(academicYear, 10) : new Date().getFullYear();
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return { start, end };
}
/**
 * Sync one Nexquare school.
 * Pass schoolId explicitly - safe for parallel NEX schools (different configs).
 */
async function syncNexquareSchool(config, schoolId, options) {
    const eps = options?.endpoints ?? NEX_ENDPOINTS_ALL;
    const { start, end } = getDateRangeFromAcademicYear(options?.academicYear);
    const ay = options?.academicYear || new Date().getFullYear().toString();
    if (eps.includes('schools')) {
        await nexquareService.getSchools(config);
    }
    if (eps.includes('students')) {
        await nexquareService.getStudents(config, schoolId);
    }
    if (eps.includes('staff')) {
        await nexquareService.getStaff(config, schoolId);
    }
    if (eps.includes('classes')) {
        await nexquareService.getClasses(config, schoolId);
    }
    if (eps.includes('allocation-master')) {
        await nexquareService.getAllocationMaster(config, schoolId);
    }
    if (eps.includes('student-allocations')) {
        await nexquareService.getStudentAllocations(config, schoolId);
    }
    if (eps.includes('staff-allocations')) {
        await nexquareService.getStaffAllocations(config, schoolId);
    }
    if (eps.includes('daily-plans')) {
        await nexquareService.getDailyPlans(config, schoolId, start, end);
    }
    if (eps.includes('daily-attendance')) {
        await nexquareService.getDailyAttendance(config, schoolId, start, end);
    }
    if (eps.includes('student-assessments')) {
        await nexquareService.getStudentAssessments(config, schoolId, ay);
    }
}
//# sourceMappingURL=SyncOrchestratorService.js.map