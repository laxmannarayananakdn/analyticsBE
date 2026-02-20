/**
 * Staff Methods
 * Handles fetching and saving staff/teachers from Nexquare API
 */
import { NEXQUARE_ENDPOINTS } from '../../config/nexquare.js';
import { databaseService } from '../DatabaseService.js';
/**
 * Get staff/teachers with pagination and save to database
 * Can be added to a class that extends BaseNexquareService
 */
export async function getStaff(config, schoolId, filter, onLog) {
    const log = (msg) => {
        console.log(msg);
        onLog?.(msg);
    };
    try {
        const targetSchoolId = schoolId || this.getCurrentSchoolId();
        if (!targetSchoolId) {
            throw new Error('School ID is required');
        }
        log(`📋 Step 1: Fetching staff from Nexquare API for school ${targetSchoolId}...`);
        const allStaff = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;
        while (hasMore) {
            // Use /teachers endpoint instead of /users/ for staff
            const endpoint = `${NEXQUARE_ENDPOINTS.STAFF}/${targetSchoolId}/teachers`;
            const queryParams = new URLSearchParams();
            queryParams.append('offset', offset.toString());
            queryParams.append('limit', limit.toString());
            // Add filter if provided (teachers endpoint may not support filter, but we'll try)
            if (filter) {
                queryParams.append('filter', filter);
            }
            const url = `${endpoint}?${queryParams.toString()}`;
            const response = await this.makeRequest(url, config);
            // Handle both 'users' and 'teachers' response keys (OneRoster may use either)
            const users = (response.users ?? response.teachers ?? []);
            if (users.length === 0) {
                hasMore = false;
                break;
            }
            allStaff.push(...users);
            log(`   📄 Page at offset ${offset}: fetched ${users.length} staff (total: ${allStaff.length})`);
            // If we got fewer than the limit, we've reached the end
            if (users.length < limit) {
                hasMore = false;
            }
            else {
                offset += limit;
            }
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        log(`✅ Step 1 complete: Fetched ${allStaff.length} staff from API`);
        // Save staff to database using bulk insert
        log(`📋 Step 2: Saving ${allStaff.length} staff to database (NEX.staff)...`);
        const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
        if (!schoolSourcedId) {
            log(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Staff will be saved with school_id = NULL.`);
        }
        const recordsToInsert = [];
        let skippedCount = 0;
        for (const staff of allStaff) {
            try {
                const metadataJson = staff.metadata ? JSON.stringify(staff.metadata) : null;
                const dateLastModified = staff.dateLastModified ? new Date(staff.dateLastModified) : null;
                const fullName = staff.givenName || staff.familyName
                    ? `${staff.givenName || ''} ${staff.familyName || ''}`.trim()
                    : null;
                recordsToInsert.push({
                    school_id: schoolSourcedId,
                    sourced_id: staff.sourcedId,
                    identifier: staff.identifier || null,
                    full_name: fullName,
                    first_name: staff.givenName || null,
                    last_name: staff.familyName || null,
                    email: staff.email || null,
                    username: staff.username || null,
                    user_type: staff.userType || 'teacher',
                    role: staff.role || null,
                    status: staff.status || null,
                    date_last_modified: dateLastModified,
                    metadata: metadataJson,
                });
            }
            catch (error) {
                log(`❌ Error preparing staff ${staff.sourcedId}: ${error.message}`);
                skippedCount++;
            }
        }
        log(`   💾 Bulk inserting ${recordsToInsert.length} staff...`);
        const { inserted, error: bulkError } = await databaseService.bulkInsertStaff(recordsToInsert);
        if (bulkError) {
            log(`❌ Step 2 failed: ${bulkError}`);
            throw new Error(`Bulk insert failed: ${bulkError}`);
        }
        log(`✅ Step 2 complete: Saved ${inserted} staff to database`);
        if (skippedCount > 0) {
            log(`⚠️  Skipped ${skippedCount} staff due to errors`);
        }
        log(`✅ Staff sync complete`);
        return allStaff;
    }
    catch (error) {
        console.error('Failed to fetch staff:', error);
        throw error;
    }
}
//# sourceMappingURL=staff.js.map