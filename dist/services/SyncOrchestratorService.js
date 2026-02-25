/**
 * Sync Orchestrator Service
 * Runs data sync for schools (ManageBac and Nexquare) with run tracking.
 * Invokes existing ManageBacService and NexquareService - no modifications to those services.
 */
import { executeQuery } from '../config/database.js';
import { getConfigsForScope } from './SyncScopeService.js';
import { ManageBacService, manageBacService } from './ManageBacService/index.js';
import { nexquareService } from './NexquareService/index.js';
// year-groups must run before students: students.year_group_id FK references MB.year_groups(id)
const MB_ENDPOINTS_ALL = ['school', 'academic-years', 'grades', 'subjects', 'teachers', 'year-groups', 'students', 'classes'];
const NEX_ENDPOINTS_ALL = ['schools', 'students', 'staff', 'classes', 'allocation-master', 'student-allocations', 'staff-allocations', 'daily-plans', 'daily-attendance', 'student-assessments'];
function throwIfAborted(signal) {
    if (signal?.aborted)
        throw new DOMException('Cancelled', 'AbortError');
}
/**
 * Run sync for the given scope.
 * MB and Nex tracks run in parallel; within each track, schools process serially.
 */
export async function runSync(params) {
    const triggeredBy = params.triggeredBy || 'scheduler';
    const nodeIdStr = Array.isArray(params.nodeIds) ? params.nodeIds.join(',') : (params.nodeIds?.[0] ?? '');
    const academicYearStr = params.academicYear || new Date().getFullYear().toString();
    let runId;
    if (params.existingRunId != null) {
        runId = params.existingRunId;
        await executeQuery(`UPDATE admin.sync_runs SET status = 'running', started_at = @startedAt WHERE id = @runId`, { startedAt: new Date(), runId });
    }
    else {
        const result = await executeQuery(`INSERT INTO admin.sync_runs (schedule_id, node_id, academic_year, status, started_at, total_schools, schools_succeeded, schools_failed, triggered_by)
       OUTPUT INSERTED.id
       VALUES (@scheduleId, @nodeId, @academicYear, 'running', @startedAt, 0, 0, 0, @triggeredBy)`, {
            scheduleId: params.scheduleId ?? null,
            nodeId: nodeIdStr,
            academicYear: academicYearStr,
            startedAt: new Date(),
            triggeredBy,
        });
        if (result.error || !result.data?.[0]?.id) {
            throw new Error(result.error || 'Failed to create sync run');
        }
        runId = Number(result.data[0].id);
    }
    const { mb, nex } = await getConfigsForScope({
        nodeIds: params.nodeIds,
        includeDescendants: params.includeDescendants,
        all: params.all,
        academicYear: params.academicYear,
        configIdsMb: params.configIdsMb,
        configIdsNex: params.configIdsNex,
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
    const itemsWithIds = [];
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
        if (schoolRunResult.error || !schoolRunResult.data?.[0]?.id)
            continue;
        itemsWithIds.push({ item, schoolRunId: Number(schoolRunResult.data[0].id) });
    }
    const updateRunCounts = async () => {
        await executeQuery(`UPDATE admin.sync_runs SET
        schools_succeeded = (SELECT COUNT(*) FROM admin.sync_run_schools WHERE sync_run_id = @runId AND status = 'completed'),
        schools_failed = (SELECT COUNT(*) FROM admin.sync_run_schools WHERE sync_run_id = @runId AND status = 'failed')
       WHERE id = @runId`, { runId });
    };
    // Split into MB and Nex tracks - both start at the same time
    // MB: schools process serially (one school at a time)
    // Nex: pipeline mode - school N can start endpoint E as soon as school N-1 finishes E and school N finishes E-1
    const mbItemsWithIds = itemsWithIds.filter((x) => x.item.source === 'mb');
    const nexItemsWithIds = itemsWithIds.filter((x) => x.item.source === 'nex');
    const runMbTrackSerially = async (trackItems) => {
        const trackResults = [];
        for (let i = 0; i < trackItems.length; i++) {
            throwIfAborted(params.abortSignal);
            const { item, schoolRunId } = trackItems[i];
            const schoolStartedAt = new Date();
            await executeQuery(`UPDATE admin.sync_run_schools SET status = 'running', started_at = @startedAt WHERE id = @id`, { startedAt: schoolStartedAt, id: schoolRunId });
            const setCurrentEndpoint = async (endpoint) => {
                const r = await executeQuery(`UPDATE admin.sync_run_schools SET current_endpoint = @endpoint WHERE id = @id`, { endpoint: endpoint ?? null, id: schoolRunId });
                if (r.error) {
                    // Ignore if current_endpoint column doesn't exist
                }
            };
            try {
                const mbService = new ManageBacService();
                await syncManageBacSchool(item.config, {
                    academicYear: params.academicYear,
                    endpoints: endpointsMb,
                    abortSignal: params.abortSignal,
                    mbService,
                    onEndpointChange: setCurrentEndpoint,
                });
                await executeQuery(`UPDATE admin.sync_run_schools SET status = 'completed', completed_at = @completedAt, current_endpoint = NULL WHERE id = @id`, { completedAt: new Date(), id: schoolRunId });
                await updateRunCounts();
                trackResults.push({ status: 'fulfilled', value: { success: true, schoolRunId, item } });
            }
            catch (err) {
                if (err?.name === 'AbortError' || params.abortSignal?.aborted) {
                    throw err;
                }
                const errMsg = err?.message || String(err);
                await executeQuery(`UPDATE admin.sync_run_schools SET status = 'failed', completed_at = @completedAt, error_message = @errMsg, current_endpoint = NULL WHERE id = @id`, {
                    completedAt: new Date(),
                    errMsg: errMsg.length > 4000 ? errMsg.substring(0, 4000) : errMsg,
                    id: schoolRunId,
                });
                await updateRunCounts();
                trackResults.push({ status: 'fulfilled', value: { success: false, schoolRunId, item, errMsg } });
            }
        }
        return trackResults;
    };
    const runNexPipeline = async (trackItems) => {
        const eps = endpointsNex.filter((e) => NEX_ENDPOINTS_ALL.includes(e));
        const { start, end } = getDateRangeFromAcademicYear(params.academicYear);
        const ay = params.academicYear || new Date().getFullYear().toString();
        const signal = params.abortSignal;
        const schoolFailed = new Map();
        const key = (i, j) => `${i},${j}`;
        // Pre-create deferred promises for each (school, endpoint). Each resolves when that task completes.
        // This ensures getCompleted(i,j) returns a promise that actually waits - not Promise.resolve().
        const deferred = new Map();
        for (let i = 0; i < trackItems.length; i++) {
            for (let j = 0; j < eps.length; j++) {
                let resolve;
                const promise = new Promise((r) => { resolve = r; });
                deferred.set(key(i, j), { resolve, promise });
            }
        }
        const getCompleted = (i, j) => {
            if (i < 0 || j < 0)
                return Promise.resolve();
            return deferred.get(key(i, j))?.promise ?? Promise.resolve();
        };
        const runEndpoint = async (schoolIndex, endpointIndex) => {
            throwIfAborted(signal);
            if (schoolFailed.has(schoolIndex))
                return;
            const { item, schoolRunId } = trackItems[schoolIndex];
            const config = item.config;
            const schoolId = item.schoolId;
            const endpointName = eps[endpointIndex];
            const startedAt = new Date();
            await executeQuery(`UPDATE admin.sync_run_schools SET status = 'running', started_at = COALESCE(started_at, @startedAt) WHERE id = @id`, { startedAt, id: schoolRunId });
            await executeQuery(`UPDATE admin.sync_run_schools SET current_endpoint = @endpoint WHERE id = @id`, { endpoint: endpointName, id: schoolRunId });
            try {
                await runNexquareSingleEndpoint(config, schoolId, endpointName, { start, end, ay });
                const completedAt = new Date();
                await appendEndpointCompleted(schoolRunId, endpointName, startedAt, completedAt, null);
            }
            catch (err) {
                if (err?.name === 'AbortError' || signal?.aborted) {
                    throw err;
                }
                const errMsg = err?.message || String(err);
                const completedAt = new Date();
                await appendEndpointCompleted(schoolRunId, endpointName, startedAt, completedAt, errMsg);
                schoolFailed.set(schoolIndex, errMsg);
                await executeQuery(`UPDATE admin.sync_run_schools SET status = 'failed', completed_at = @completedAt, error_message = @errMsg, current_endpoint = NULL WHERE id = @id`, { completedAt, errMsg: errMsg.length > 4000 ? errMsg.substring(0, 4000) : errMsg, id: schoolRunId });
                await updateRunCounts();
                return;
            }
            if (endpointIndex === eps.length - 1) {
                await executeQuery(`UPDATE admin.sync_run_schools SET status = 'completed', completed_at = @completedAt, current_endpoint = NULL WHERE id = @id`, { completedAt: new Date(), id: schoolRunId });
                await updateRunCounts();
            }
        };
        const runTask = async (schoolIndex, endpointIndex) => {
            await Promise.all([
                getCompleted(schoolIndex - 1, endpointIndex),
                getCompleted(schoolIndex, endpointIndex - 1),
            ]);
            const def = deferred.get(key(schoolIndex, endpointIndex));
            if (schoolFailed.has(schoolIndex)) {
                def?.resolve();
                return;
            }
            try {
                await runEndpoint(schoolIndex, endpointIndex);
            }
            finally {
                def?.resolve();
            }
        };
        const allTasks = [];
        for (let i = 0; i < trackItems.length; i++) {
            for (let j = 0; j < eps.length; j++) {
                allTasks.push(runTask(i, j));
            }
        }
        await Promise.all(allTasks);
        return trackItems.map(({ item, schoolRunId }, i) => {
            const errMsg = schoolFailed.get(i);
            return {
                status: 'fulfilled',
                value: errMsg
                    ? { success: false, schoolRunId, item, errMsg }
                    : { success: true, schoolRunId, item },
            };
        });
    };
    const appendEndpointCompleted = async (schoolRunId, endpoint, startedAt, completedAt, error) => {
        const result = await executeQuery(`SELECT endpoints_completed FROM admin.sync_run_schools WHERE id = @id`, { id: schoolRunId });
        const existing = result.data?.[0]?.endpoints_completed;
        let arr = [];
        if (existing) {
            try {
                arr = JSON.parse(existing);
            }
            catch {
                /* ignore */
            }
        }
        const entry = {
            endpoint,
            started_at: startedAt.toISOString(),
            completed_at: completedAt.toISOString(),
        };
        if (error)
            entry.error = error.length > 500 ? error.substring(0, 500) : error;
        arr.push(entry);
        await executeQuery(`UPDATE admin.sync_run_schools SET endpoints_completed = @json WHERE id = @id`, { json: JSON.stringify(arr), id: schoolRunId });
    };
    const results = [];
    let aborted = false;
    try {
        const [mbResults, nexResults] = await Promise.all([
            mbItemsWithIds.length > 0 ? runMbTrackSerially(mbItemsWithIds) : Promise.resolve([]),
            nexItemsWithIds.length > 0 ? runNexPipeline(nexItemsWithIds) : Promise.resolve([]),
        ]);
        results.push(...mbResults, ...nexResults);
    }
    catch (err) {
        if (err?.name === 'AbortError' || params.abortSignal?.aborted) {
            aborted = true;
        }
        else {
            throw err;
        }
    }
    // Check for abort
    if (aborted) {
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const succeeded = fulfilled.filter((r) => r.value.success).length;
        const failed = fulfilled.filter((r) => !r.value.success).length;
        await executeQuery(`UPDATE admin.sync_runs SET status = 'cancelled', completed_at = @completedAt, schools_succeeded = @succeeded, schools_failed = @failed, error_summary = @errorSummary WHERE id = @runId`, {
            completedAt: new Date(),
            succeeded,
            failed,
            errorSummary: 'Cancelled by user',
            runId,
        });
        await executeQuery(`UPDATE admin.sync_run_schools SET status = 'skipped', completed_at = @completedAt, error_message = @msg WHERE sync_run_id = @runId AND status = 'running'`, { completedAt: new Date(), msg: 'Cancelled', runId });
        return {
            runId,
            status: 'cancelled',
            totalSchools,
            schoolsSucceeded: succeeded,
            schoolsFailed: failed,
            errorSummary: 'Cancelled by user',
        };
    }
    let succeeded = 0;
    let failed = 0;
    const errors = [];
    for (const r of results) {
        if (r.status === 'fulfilled') {
            if (r.value.success)
                succeeded++;
            else {
                failed++;
                errors.push(`${r.value.item.schoolName} (${r.value.item.source}): ${r.value.errMsg}`);
            }
        }
        else {
            failed++;
            const reason = r.reason;
            errors.push(reason?.message || 'Unknown error');
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
 * Uses mbService when provided (for parallel runs); otherwise uses singleton.
 * Checks abortSignal before each endpoint for immediate cancel.
 */
async function syncManageBacSchool(config, options) {
    const eps = options?.endpoints ?? MB_ENDPOINTS_ALL;
    const apiKey = config.api_token;
    const baseUrl = config.base_url || undefined;
    const signal = options?.abortSignal;
    const svc = options?.mbService ?? manageBacService;
    const onEndpoint = options?.onEndpointChange;
    if (config.school_id != null) {
        svc.setCurrentSchoolId(config.school_id);
    }
    const run = async (name, fn) => {
        if (onEndpoint)
            await onEndpoint(name);
        await fn();
    };
    throwIfAborted(signal);
    if (eps.includes('school')) {
        await run('school', () => svc.getSchoolDetails(apiKey, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('academic-years')) {
        await run('academic-years', () => svc.getAcademicYears(apiKey, undefined, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('grades')) {
        await run('grades', async () => {
            const academicYearId = await resolveAcademicYearId(svc, apiKey, baseUrl, options?.academicYear);
            await svc.getGrades(apiKey, academicYearId, baseUrl);
        });
    }
    throwIfAborted(signal);
    if (eps.includes('subjects')) {
        await run('subjects', () => svc.getSubjects(apiKey, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('teachers')) {
        await run('teachers', () => svc.getTeachers(apiKey, {}, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('year-groups')) {
        await run('year-groups', () => svc.getYearGroups(apiKey, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('students')) {
        await run('students', () => svc.getStudents(apiKey, {}, baseUrl));
    }
    throwIfAborted(signal);
    if (eps.includes('classes')) {
        await run('classes', () => svc.getClasses(apiKey, baseUrl));
    }
}
/**
 * Resolve ManageBac academic_year_id from academic year string (e.g. "2024").
 */
async function resolveAcademicYearId(svc, apiKey, baseUrl, academicYear) {
    if (!academicYear)
        return undefined;
    try {
        const data = await svc.getAcademicYears(apiKey, undefined, baseUrl);
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
 * Run a single Nexquare endpoint for one school. Used by pipeline sync.
 */
async function runNexquareSingleEndpoint(config, schoolId, endpointName, ctx) {
    const { start, end, ay } = ctx;
    switch (endpointName) {
        case 'schools':
            await nexquareService.getSchools(config);
            break;
        case 'students':
            await nexquareService.getStudents(config, schoolId);
            break;
        case 'staff':
            await nexquareService.getStaff(config, schoolId);
            break;
        case 'classes':
            await nexquareService.getClasses(config, schoolId);
            break;
        case 'allocation-master':
            await nexquareService.getAllocationMaster(config, schoolId);
            break;
        case 'student-allocations':
            await nexquareService.getStudentAllocations(config, schoolId, ay);
            break;
        case 'staff-allocations':
            await nexquareService.getStaffAllocations(config, schoolId, ay);
            break;
        case 'daily-plans':
            await nexquareService.getDailyPlans(config, schoolId, start, end);
            break;
        case 'daily-attendance':
            await nexquareService.getDailyAttendance(config, schoolId, start, end);
            break;
        case 'student-assessments':
            await nexquareService.getStudentAssessments(config, schoolId, ay);
            break;
        default:
            throw new Error(`Unknown Nexquare endpoint: ${endpointName}`);
    }
}
/**
 * Sync one Nexquare school (used for MB track; Nex uses pipeline).
 * Pass schoolId explicitly - safe for parallel NEX schools (different configs).
 * Checks abortSignal before each endpoint for immediate cancel.
 */
async function syncNexquareSchool(config, schoolId, options) {
    const eps = options?.endpoints ?? NEX_ENDPOINTS_ALL;
    const { start, end } = getDateRangeFromAcademicYear(options?.academicYear);
    const ay = options?.academicYear || new Date().getFullYear().toString();
    const signal = options?.abortSignal;
    const onEndpoint = options?.onEndpointChange;
    const run = async (name, fn) => {
        if (onEndpoint)
            await onEndpoint(name);
        await fn();
    };
    throwIfAborted(signal);
    if (eps.includes('schools')) {
        await run('schools', () => nexquareService.getSchools(config));
    }
    throwIfAborted(signal);
    if (eps.includes('students')) {
        await run('students', () => nexquareService.getStudents(config, schoolId));
    }
    throwIfAborted(signal);
    if (eps.includes('staff')) {
        await run('staff', () => nexquareService.getStaff(config, schoolId));
    }
    throwIfAborted(signal);
    if (eps.includes('classes')) {
        await run('classes', () => nexquareService.getClasses(config, schoolId));
    }
    throwIfAborted(signal);
    if (eps.includes('allocation-master')) {
        await run('allocation-master', () => nexquareService.getAllocationMaster(config, schoolId));
    }
    throwIfAborted(signal);
    if (eps.includes('student-allocations')) {
        await run('student-allocations', () => nexquareService.getStudentAllocations(config, schoolId, ay));
    }
    throwIfAborted(signal);
    if (eps.includes('staff-allocations')) {
        await run('staff-allocations', () => nexquareService.getStaffAllocations(config, schoolId, ay));
    }
    throwIfAborted(signal);
    if (eps.includes('daily-plans')) {
        await run('daily-plans', () => nexquareService.getDailyPlans(config, schoolId, start, end));
    }
    throwIfAborted(signal);
    if (eps.includes('daily-attendance')) {
        await run('daily-attendance', () => nexquareService.getDailyAttendance(config, schoolId, start, end));
    }
    throwIfAborted(signal);
    if (eps.includes('student-assessments')) {
        await run('student-assessments', () => nexquareService.getStudentAssessments(config, schoolId, ay));
    }
}
//# sourceMappingURL=SyncOrchestratorService.js.map