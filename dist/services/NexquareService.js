/**
 * Nexquare API Service
 * Handles all interactions with Nexquare API and saves data to Azure SQL Database
 */
import { getNexquareHeaders, getTokenRequestHeaders, NEXQUARE_ENDPOINTS, NEXQUARE_CONFIG, } from '../config/nexquare';
import { retryOperation, handleApiError } from '../utils/apiUtils';
import { databaseService } from './DatabaseService';
import { executeQuery, getConnection, sql } from '../config/database';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
export class NexquareService {
    // Token cache per config (keyed by config ID)
    tokenCache = new Map();
    currentSchoolId = null;
    /**
     * Get or refresh OAuth access token
     */
    async getAccessToken(config, forceRefresh = false) {
        const now = Math.floor(Date.now() / 1000);
        const cached = this.tokenCache.get(config.id);
        // Check if we have a valid cached token for this config
        if (!forceRefresh && cached && cached.expiresAt && now < cached.expiresAt) {
            return cached.token;
        }
        try {
            console.log(`🔐 Fetching Nexquare OAuth token for config ${config.id}...`);
            // Build token URL from config's domain_url
            const domainUrl = config.domain_url.startsWith('http')
                ? config.domain_url
                : `https://${config.domain_url}`;
            const tokenUrl = `${domainUrl}${NEXQUARE_ENDPOINTS.TOKEN}`;
            const formData = new URLSearchParams();
            formData.append('grant_type', 'client_credentials');
            formData.append('client_id', config.client_id);
            formData.append('client_secret', config.client_secret);
            const response = await retryOperation(async () => {
                const res = await fetch(tokenUrl, {
                    method: 'POST',
                    headers: getTokenRequestHeaders(),
                    body: formData.toString(),
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${res.statusText}. Response: ${errorText.substring(0, 200)}`);
                }
                return await res.json();
            }, NEXQUARE_CONFIG.RETRY_ATTEMPTS);
            const tokenData = response;
            if (!tokenData.access_token) {
                throw new Error('Invalid token response: missing access_token');
            }
            // Cache token with expiration per config
            const expiresIn = tokenData.expires_in || 86400; // Default to 24 hours
            // Set expiration time with buffer (refresh 5 minutes before expiry)
            const expiresAt = now + expiresIn - NEXQUARE_CONFIG.TOKEN_EXPIRY_BUFFER;
            this.tokenCache.set(config.id, {
                token: tokenData.access_token,
                expiresAt
            });
            console.log('✅ OAuth token obtained successfully');
            console.log(`   Token expires in: ${expiresIn} seconds`);
            return tokenData.access_token;
        }
        catch (error) {
            console.error('❌ Failed to get OAuth token:', error);
            throw handleApiError(error);
        }
    }
    /**
     * Generic method for making HTTP requests to the Nexquare API
     */
    async makeRequest(endpoint, config, options = {}, retryOnAuthError = true) {
        try {
            const token = await this.getAccessToken(config);
            // Build URL from config's domain_url
            const domainUrl = config.domain_url.startsWith('http')
                ? config.domain_url
                : `https://${config.domain_url}`;
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const url = `${domainUrl}${cleanEndpoint}`;
            const method = (options.method || 'GET').toUpperCase();
            const headers = {
                ...getNexquareHeaders(token),
                ...options.headers,
            };
            const requestOptions = {
                ...options,
                headers,
                method,
            };
            const response = await retryOperation(async () => {
                const res = await fetch(url, requestOptions);
                // Handle 401 Unauthorized - token might be expired
                if (res.status === 401 && retryOnAuthError) {
                    console.log('🔄 Token expired, refreshing...');
                    const newToken = await this.getAccessToken(config, true);
                    // Retry with new token
                    const retryHeaders = {
                        ...getNexquareHeaders(newToken),
                        ...options.headers,
                    };
                    const retryRes = await fetch(url, {
                        ...requestOptions,
                        headers: retryHeaders,
                    });
                    if (!retryRes.ok) {
                        const errorText = await retryRes.text();
                        throw new Error(`HTTP ${retryRes.status}: ${retryRes.statusText}. Response: ${errorText.substring(0, 200)}`);
                    }
                    return await retryRes.json();
                }
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${res.statusText}. Response: ${errorText.substring(0, 200)}`);
                }
                return await res.json();
            }, NEXQUARE_CONFIG.RETRY_ATTEMPTS);
            return response;
        }
        catch (error) {
            console.error('💥 Nexquare API request failed:', error);
            throw handleApiError(error);
        }
    }
    /**
     * Make HTTP request that returns file response (CSV or Excel)
     * Returns both the buffer and content type
     */
    async makeFileRequest(endpoint, config, options = {}, retryOnAuthError = true) {
        try {
            const token = await this.getAccessToken(config);
            // Build URL from config's domain_url
            const domainUrl = config.domain_url.startsWith('http')
                ? config.domain_url
                : `https://${config.domain_url}`;
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
            const url = `${domainUrl}${cleanEndpoint}`;
            const method = (options.method || 'GET').toUpperCase();
            const headers = {
                ...getNexquareHeaders(token),
                ...options.headers,
            };
            const requestOptions = {
                ...options,
                headers,
                method,
            };
            const response = await retryOperation(async () => {
                const res = await fetch(url, requestOptions);
                // Handle 401 Unauthorized - token might be expired
                if (res.status === 401 && retryOnAuthError) {
                    console.log('🔄 Token expired, refreshing...');
                    const newToken = await this.getAccessToken(config, true);
                    // Retry with new token
                    const retryHeaders = {
                        ...getNexquareHeaders(newToken),
                        ...options.headers,
                    };
                    const retryRes = await fetch(url, {
                        ...requestOptions,
                        headers: retryHeaders,
                    });
                    if (!retryRes.ok) {
                        const errorText = await retryRes.text();
                        throw new Error(`HTTP ${retryRes.status}: ${retryRes.statusText}. Response: ${errorText.substring(0, 200)}`);
                    }
                    const contentType = retryRes.headers.get('content-type') || 'application/octet-stream';
                    const arrayBuffer = await retryRes.arrayBuffer();
                    return {
                        buffer: Buffer.from(arrayBuffer),
                        contentType
                    };
                }
                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`HTTP ${res.status}: ${res.statusText}. Response: ${errorText.substring(0, 200)}`);
                }
                const contentType = res.headers.get('content-type') || 'application/octet-stream';
                const arrayBuffer = await res.arrayBuffer();
                return {
                    buffer: Buffer.from(arrayBuffer),
                    contentType
                };
            }, NEXQUARE_CONFIG.RETRY_ATTEMPTS);
            return response;
        }
        catch (error) {
            console.error('💥 Nexquare API file request failed:', error);
            throw handleApiError(error);
        }
    }
    /**
     * Authenticate and verify connection
     */
    async authenticate(config) {
        try {
            console.log('🔐 Authenticating with Nexquare API...');
            await this.getAccessToken(config);
            console.log('✅ Authentication successful');
            return true;
        }
        catch (error) {
            console.error('❌ Authentication failed:', error);
            return false;
        }
    }
    /**
     * Get schools/entities and verify school access
     */
    async getSchools(config, filter) {
        try {
            console.log('📚 Fetching schools/entities from Nexquare...');
            const endpoint = NEXQUARE_ENDPOINTS.SCHOOLS;
            const queryParams = new URLSearchParams();
            queryParams.append('offset', '0');
            queryParams.append('limit', '100');
            if (filter) {
                queryParams.append('filter', filter);
            }
            const url = `${endpoint}?${queryParams.toString()}`;
            const response = await this.makeRequest(url, config);
            if (!response.orgs || !Array.isArray(response.orgs)) {
                throw new Error('Invalid response format: missing orgs array');
            }
            const schools = response.orgs;
            console.log(`✅ Found ${schools.length} school(s)/entit(ies)`);
            // Note: School ID verification removed - should be handled at route level if needed
            // Save schools to database
            console.log('💾 Saving schools to database...');
            let savedCount = 0;
            let errorCount = 0;
            for (const school of schools) {
                try {
                    const metadataJson = school.metadata ? JSON.stringify(school.metadata) : null;
                    const dateLastModified = school.dateLastModified
                        ? new Date(school.dateLastModified)
                        : null;
                    const { error } = await databaseService.upsertNexquareSchool({
                        sourced_id: school.sourcedId,
                        name: school.name,
                        identifier: school.identifier || null,
                        status: school.status,
                        type: school.type,
                        date_last_modified: dateLastModified,
                        metadata: metadataJson,
                    });
                    if (error) {
                        console.error(`❌ Failed to save school ${school.sourcedId}:`, error);
                        errorCount++;
                    }
                    else {
                        savedCount++;
                    }
                }
                catch (error) {
                    console.error(`❌ Error processing school ${school.sourcedId}:`, error.message);
                    errorCount++;
                }
            }
            console.log(`✅ Saved ${savedCount} school(s) to database`);
            if (errorCount > 0) {
                console.warn(`⚠️  Failed to save ${errorCount} school(s)`);
            }
            return schools;
        }
        catch (error) {
            console.error('Failed to fetch schools:', error);
            throw error;
        }
    }
    /**
     * Verify school access by checking if school_id exists
     */
    async verifySchoolAccess(config, schoolId) {
        try {
            if (!schoolId) {
                console.warn('⚠️  No school_id provided for verification');
                return false;
            }
            console.log(`🔍 Verifying access to school_id: ${schoolId}`);
            const schools = await this.getSchools(config, `status='active'`);
            const schoolExists = schools.some(s => s.sourcedId === schoolId);
            if (schoolExists) {
                this.currentSchoolId = schoolId;
                console.log(`✅ School access verified: ${schoolId}`);
                return true;
            }
            else {
                console.error(`❌ School ${schoolId} not found or not accessible`);
                return false;
            }
        }
        catch (error) {
            console.error('Failed to verify school access:', error);
            return false;
        }
    }
    /**
     * Get current school ID
     */
    getCurrentSchoolId() {
        return this.currentSchoolId || null;
    }
    /**
     * Get school sourced_id from sourced_id
     * Returns the sourced_id (not database id) for use in school_id columns
     */
    async getSchoolSourcedId(schoolSourcedId) {
        try {
            const query = `
        SELECT sourced_id FROM NEX.schools WHERE sourced_id = @sourced_id;
      `;
            const result = await executeQuery(query, {
                sourced_id: schoolSourcedId,
            });
            if (result.error || !result.data || result.data.length === 0) {
                console.warn(`⚠️  School with sourced_id "${schoolSourcedId}" not found in database`);
                return null;
            }
            return result.data[0].sourced_id;
        }
        catch (error) {
            console.error(`Error getting school sourced_id for ${schoolSourcedId}:`, error);
            return null;
        }
    }
    /**
     * Clear cached token (useful for testing or forced refresh)
     */
    clearToken(configId) {
        if (configId) {
            this.tokenCache.delete(configId);
            console.log(`🗑️  Token cache cleared for config ${configId}`);
        }
        else {
            this.tokenCache.clear();
            console.log('🗑️  All token caches cleared');
        }
    }
    /**
     * Get students with pagination
     */
    async getStudents(config, schoolId, filter, fetchMode = 1) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            console.log(`👥 Fetching students for school ${targetSchoolId}...`);
            const allStudents = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;
            while (hasMore) {
                const endpoint = `${NEXQUARE_ENDPOINTS.STUDENTS}/${targetSchoolId}/students/`;
                const queryParams = new URLSearchParams();
                queryParams.append('offset', offset.toString());
                queryParams.append('limit', limit.toString());
                queryParams.append('fetchMode', fetchMode.toString());
                if (filter) {
                    queryParams.append('filter', filter);
                }
                const url = `${endpoint}?${queryParams.toString()}`;
                const response = await this.makeRequest(url, config);
                const users = response.users || [];
                if (users.length === 0) {
                    hasMore = false;
                    break;
                }
                allStudents.push(...users);
                console.log(`   Fetched ${users.length} students (total: ${allStudents.length})`);
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
            console.log(`✅ Found ${allStudents.length} total student(s)`);
            // Save students to database using bulk insert
            console.log('💾 Preparing students for bulk insert...');
            // Get the school sourced_id from sourced_id
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Students will be saved with school_id = NULL.`);
                console.warn(`   Make sure to run "Get Schools" first to populate the schools table.`);
            }
            // Helper function to parse date strings
            const parseDate = (dateStr) => {
                if (!dateStr)
                    return null;
                try {
                    return new Date(dateStr);
                }
                catch {
                    return null;
                }
            };
            // Prepare all records for bulk insert
            const recordsToInsert = [];
            let skippedCount = 0;
            for (const student of allStudents) {
                try {
                    const metadataJson = JSON.stringify(student);
                    const dateLastModified = student.dateLastModified ? new Date(student.dateLastModified) : null;
                    const studentData = student;
                    const fullName = studentData.fullName ||
                        (student.givenName || student.familyName
                            ? `${student.givenName || ''} ${student.familyName || ''}`.trim()
                            : null);
                    const classDetails = studentData.classDetails || {};
                    const gradesJson = studentData.grades && Array.isArray(studentData.grades)
                        ? JSON.stringify(studentData.grades)
                        : null;
                    recordsToInsert.push({
                        school_id: schoolSourcedId,
                        sourced_id: student.sourcedId,
                        identifier: student.identifier || null,
                        full_name: fullName,
                        first_name: student.givenName || null,
                        last_name: student.familyName || null,
                        email: student.email || null,
                        username: student.username || null,
                        user_type: student.userType || 'student',
                        status: student.status || null,
                        date_last_modified: dateLastModified,
                        academic_year: studentData.academicYear ? String(studentData.academicYear) : null,
                        metadata: metadataJson,
                        current_grade: studentData.currentGrade || null,
                        current_class: studentData.currentClass || studentData.currentClassName || null,
                        current_class_id: studentData.currentClassId || null,
                        grades: gradesJson,
                        phone: student.phone || null,
                        mobile_number: studentData.mobileNumber || null,
                        sms: student.sms || null,
                        gender: studentData.gender || null,
                        student_dob: parseDate(studentData.studentDob),
                        religion: studentData.religion || null,
                        admission_date: parseDate(studentData.admissionDate),
                        join_date: parseDate(studentData.joinDate),
                        parent_name: studentData.parentName || null,
                        guardian_one_full_name: studentData.guardianOneFullName || null,
                        guardian_two_full_name: studentData.guardianTwoFullName || null,
                        guardian_one_mobile: studentData.guardianOneMobile || null,
                        guardian_two_mobile: studentData.guardianTwoMobile || null,
                        primary_contact: studentData.primaryContact || null,
                        student_reg_id: studentData.studentRegID || null,
                        family_code: studentData.familyCode || null,
                        student_national_id: studentData.studentnationalId || null,
                        student_status: studentData.studentStatus || null,
                        class_grade: classDetails.grade || null,
                        class_section: classDetails.section || null,
                        homeroom_teacher_sourced_id: classDetails.homeroomTeacherSourcedId || null,
                    });
                }
                catch (error) {
                    console.error(`❌ Error preparing student ${student.sourcedId}:`, error.message);
                    skippedCount++;
                }
            }
            // Bulk insert all records
            console.log(`   💾 Bulk inserting ${recordsToInsert.length} student(s) to database...`);
            const { inserted, error: bulkError } = await databaseService.bulkInsertStudents(recordsToInsert);
            if (bulkError) {
                console.error(`❌ Bulk insert failed: ${bulkError}`);
                throw new Error(`Bulk insert failed: ${bulkError}`);
            }
            console.log(`✅ Saved ${inserted} student(s) to database`);
            if (skippedCount > 0) {
                console.warn(`⚠️  Skipped ${skippedCount} student(s) due to errors`);
            }
            return allStudents;
        }
        catch (error) {
            console.error('Failed to fetch students:', error);
            throw error;
        }
    }
    /**
     * Get staff/teachers with pagination
     */
    async getStaff(config, schoolId, filter) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            console.log(`👨‍🏫 Fetching staff for school ${targetSchoolId}...`);
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
                const users = response.users || response.teachers || [];
                if (users.length === 0) {
                    hasMore = false;
                    break;
                }
                allStaff.push(...users);
                console.log(`   Fetched ${users.length} staff members (total: ${allStaff.length})`);
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
            console.log(`✅ Found ${allStaff.length} total staff member(s)`);
            // Save staff to database using bulk insert
            console.log('💾 Preparing staff for bulk insert...');
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Staff will be saved with school_id = NULL.`);
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
                    console.error(`❌ Error preparing staff ${staff.sourcedId}:`, error.message);
                    skippedCount++;
                }
            }
            console.log(`   💾 Bulk inserting ${recordsToInsert.length} staff member(s) to database...`);
            const { inserted, error: bulkError } = await databaseService.bulkInsertStaff(recordsToInsert);
            if (bulkError) {
                console.error(`❌ Bulk insert failed: ${bulkError}`);
                throw new Error(`Bulk insert failed: ${bulkError}`);
            }
            console.log(`✅ Saved ${inserted} staff member(s) to database`);
            if (skippedCount > 0) {
                console.warn(`⚠️  Skipped ${skippedCount} staff member(s) due to errors`);
            }
            return allStaff;
        }
        catch (error) {
            console.error('Failed to fetch staff:', error);
            throw error;
        }
    }
    /**
     * Get classes with pagination
     */
    async getClasses(config, schoolId) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            console.log(`📚 Fetching classes for school ${targetSchoolId}...`);
            const allClasses = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;
            while (hasMore) {
                const endpoint = `${NEXQUARE_ENDPOINTS.CLASSES}/${targetSchoolId}/classes/`;
                const queryParams = new URLSearchParams();
                queryParams.append('offset', offset.toString());
                queryParams.append('limit', limit.toString());
                const url = `${endpoint}?${queryParams.toString()}`;
                const response = await this.makeRequest(url, config);
                const classes = response.classes || [];
                if (classes.length === 0) {
                    hasMore = false;
                    break;
                }
                allClasses.push(...classes);
                console.log(`   Fetched ${classes.length} classes (total: ${allClasses.length})`);
                // If we got fewer than the limit, we've reached the end
                if (classes.length < limit) {
                    hasMore = false;
                }
                else {
                    offset += limit;
                }
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            console.log(`✅ Found ${allClasses.length} total class(es)`);
            // Save classes to database using bulk insert
            console.log('💾 Preparing classes for bulk insert...');
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Classes will be saved with school_id = NULL.`);
            }
            const recordsToInsert = [];
            let skippedCount = 0;
            for (const classData of allClasses) {
                try {
                    const metadataJson = classData.metadata ? JSON.stringify(classData.metadata) : null;
                    const dateLastModified = classData.dateLastModified ? new Date(classData.dateLastModified) : null;
                    recordsToInsert.push({
                        school_id: schoolSourcedId,
                        sourced_id: classData.sourcedId,
                        title: classData.title || null,
                        class_name: classData.title || null,
                        grade_name: classData.grades?.[0] || null,
                        course_code: classData.classCode || null,
                        status: classData.status || null,
                        date_last_modified: dateLastModified,
                        metadata: metadataJson,
                    });
                }
                catch (error) {
                    console.error(`❌ Error preparing class ${classData.sourcedId}:`, error.message);
                    skippedCount++;
                }
            }
            console.log(`   💾 Bulk inserting ${recordsToInsert.length} class(es) to database...`);
            const { inserted, error: bulkError } = await databaseService.bulkInsertClasses(recordsToInsert);
            if (bulkError) {
                console.error(`❌ Bulk insert failed: ${bulkError}`);
                throw new Error(`Bulk insert failed: ${bulkError}`);
            }
            console.log(`✅ Saved ${inserted} class(es) to database`);
            if (skippedCount > 0) {
                console.warn(`⚠️  Skipped ${skippedCount} class(es) due to errors`);
            }
            return allClasses;
        }
        catch (error) {
            console.error('Failed to fetch classes:', error);
            throw error;
        }
    }
    /**
     * Get allocation master data
     */
    async getAllocationMaster(config, schoolId) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            console.log(`📋 Fetching allocation master for school ${targetSchoolId}...`);
            const allAllocations = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;
            while (hasMore) {
                const endpoint = `${NEXQUARE_ENDPOINTS.ALLOCATION_MASTER}/${targetSchoolId}`;
                const queryParams = new URLSearchParams();
                queryParams.append('offset', offset.toString());
                queryParams.append('limit', limit.toString());
                const url = `${endpoint}?${queryParams.toString()}`;
                const response = await this.makeRequest(url, config);
                // Handle different response structures
                const allocations = response.data || response.allocations || response || [];
                const allocationArray = Array.isArray(allocations) ? allocations : [];
                if (allocationArray.length === 0) {
                    hasMore = false;
                    break;
                }
                allAllocations.push(...allocationArray);
                console.log(`   Fetched ${allocationArray.length} allocation(s) (total: ${allAllocations.length})`);
                // If we got fewer than the limit, we've reached the end
                if (allocationArray.length < limit) {
                    hasMore = false;
                }
                else {
                    offset += limit;
                }
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            console.log(`✅ Found ${allAllocations.length} total allocation master record(s)`);
            // Save to database
            console.log('💾 Saving allocation master to database...');
            let savedCount = 0;
            let errorCount = 0;
            // Get the school sourced_id from sourced_id
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Allocations will be saved with school_id = NULL.`);
            }
            for (const allocation of allAllocations) {
                try {
                    const metadataJson = allocation.metadata ? JSON.stringify(allocation.metadata) : null;
                    const dateLastModified = allocation.dateLastModified
                        ? new Date(allocation.dateLastModified)
                        : null;
                    const { error } = await databaseService.upsertNexquareAllocationMaster({
                        school_id: schoolSourcedId,
                        sourced_id: allocation.sourcedId || allocation.sourced_id || null,
                        allocation_type: allocation.allocationType || allocation.allocation_type || null,
                        entity_type: allocation.entityType || allocation.entity_type || null,
                        entity_sourced_id: allocation.entitySourcedId || allocation.entity_sourced_id || null,
                        entity_name: allocation.entityName || allocation.entity_name || null,
                        status: allocation.status || null,
                        date_last_modified: dateLastModified,
                        metadata: metadataJson,
                    });
                    if (error) {
                        console.error(`❌ Failed to save allocation ${allocation.sourcedId || 'unknown'}:`, error);
                        errorCount++;
                    }
                    else {
                        savedCount++;
                    }
                }
                catch (error) {
                    console.error(`❌ Error processing allocation:`, error.message);
                    errorCount++;
                }
            }
            console.log(`✅ Saved ${savedCount} allocation master record(s) to database`);
            if (errorCount > 0) {
                console.warn(`⚠️  Failed to save ${errorCount} allocation master record(s)`);
            }
            return allAllocations;
        }
        catch (error) {
            console.error('Failed to fetch allocation master:', error);
            throw error;
        }
    }
    /**
     * Get student allocations and extract subjects, cohorts, groups, homerooms
     */
    async getStudentAllocations(config, schoolId) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            console.log(`🔗 Fetching student allocations for school ${targetSchoolId}...`);
            const allAllocations = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;
            // Get the school sourced_id from sourced_id
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Allocations will be saved with school_id = NULL.`);
            }
            // Track unique entities for extraction
            const subjectsMap = new Map();
            const cohortsMap = new Map();
            const groupsMap = new Map();
            const homeroomsMap = new Map();
            while (hasMore) {
                // Use studentsAllocation endpoint (camelCase, not students/allocations)
                const endpoint = `${NEXQUARE_ENDPOINTS.STUDENT_ALLOCATIONS}/${targetSchoolId}/studentsAllocation`;
                const queryParams = new URLSearchParams();
                queryParams.append('offset', offset.toString());
                queryParams.append('limit', limit.toString());
                const url = `${endpoint}?${queryParams.toString()}`;
                const response = await this.makeRequest(url, config);
                // Handle different response structures
                let allocations = [];
                if (Array.isArray(response)) {
                    allocations = response;
                }
                else if (response.users && Array.isArray(response.users)) {
                    allocations = response.users;
                }
                else if (response.user) {
                    allocations = [response];
                }
                else if (response.data) {
                    allocations = Array.isArray(response.data) ? response.data : [response.data];
                }
                else if (typeof response === 'object' && response !== null) {
                    // If it's a single object, wrap it in an array
                    allocations = [response];
                }
                // Debug: Log response structure for first page
                if (offset === 0 && allocations.length > 0) {
                    const firstAlloc = allocations[0];
                    console.log('🔍 First allocation keys:', Object.keys(firstAlloc).join(', '));
                    // Log structure of arrays if they exist
                    if (firstAlloc.subject && Array.isArray(firstAlloc.subject) && firstAlloc.subject.length > 0) {
                        console.log('🔍 First subject keys:', Object.keys(firstAlloc.subject[0]).join(', '));
                        console.log('🔍 First subject sample:', JSON.stringify(firstAlloc.subject[0]).substring(0, 200));
                    }
                    if (firstAlloc.homeRoom && Array.isArray(firstAlloc.homeRoom) && firstAlloc.homeRoom.length > 0) {
                        console.log('🔍 First homeRoom keys:', Object.keys(firstAlloc.homeRoom[0]).join(', '));
                        console.log('🔍 First homeRoom sample:', JSON.stringify(firstAlloc.homeRoom[0]).substring(0, 200));
                    }
                    if (firstAlloc.cohort && Array.isArray(firstAlloc.cohort) && firstAlloc.cohort.length > 0) {
                        console.log('🔍 First cohort keys:', Object.keys(firstAlloc.cohort[0]).join(', '));
                    }
                    if (firstAlloc.group && Array.isArray(firstAlloc.group) && firstAlloc.group.length > 0) {
                        console.log('🔍 First group keys:', Object.keys(firstAlloc.group[0]).join(', '));
                        console.log('🔍 First group sample:', JSON.stringify(firstAlloc.group[0]).substring(0, 200));
                    }
                    // Check if cohorts/groups exist at all
                    console.log('🔍 Has cohort array?', !!firstAlloc.cohort, 'Length:', firstAlloc.cohort?.length || 0);
                    console.log('🔍 Has group array?', !!firstAlloc.group, 'Length:', firstAlloc.group?.length || 0);
                    console.log('🔍 Has lesson array?', !!firstAlloc.lesson, 'Length:', firstAlloc.lesson?.length || 0);
                    // Check all top-level keys to see what's available
                    console.log('🔍 All top-level keys:', Object.keys(firstAlloc).join(', '));
                }
                if (allocations.length === 0) {
                    hasMore = false;
                    break;
                }
                allAllocations.push(...allocations);
                console.log(`   Fetched ${allocations.length} student allocation(s) (total: ${allAllocations.length})`);
                // Extract entities from allocations
                for (const allocation of allocations) {
                    // Based on debug output: subject and homeRoom are at top level, not in user
                    // The user property appears to be an array, so we check top level first
                    const data = allocation;
                    // Extract subjects - check top level first, then nested in user
                    // Note: subject.sourcedId is the allocation ID, subject.subjectSourcedId is the actual subject ID
                    const subjects = data.subject || data.subjects || (data.user?.subject) || (data.user?.subjects) || [];
                    if (Array.isArray(subjects) && subjects.length > 0) {
                        for (const subject of subjects) {
                            // Use subjectSourcedId as the unique identifier for the subject itself
                            const sourcedId = subject.subjectSourcedId || subject.subject_sourced_id;
                            if (sourcedId) {
                                if (!subjectsMap.has(sourcedId)) {
                                    subjectsMap.set(sourcedId, {
                                        sourced_id: sourcedId,
                                        subject_id: subject.subjectId || subject.subject_id || null,
                                        subject_name: subject.subjectName || subject.subject_name || 'Unknown',
                                        school_id: schoolSourcedId,
                                    });
                                }
                            }
                        }
                    }
                    // Extract cohorts - check top level first, then nested in user
                    const cohorts = data.cohort || data.cohorts || (data.user?.cohort) || (data.user?.cohorts) || [];
                    if (Array.isArray(cohorts) && cohorts.length > 0) {
                        for (const cohort of cohorts) {
                            const sourcedId = cohort.sourcedId || cohort.sourced_id;
                            if (sourcedId) {
                                if (!cohortsMap.has(sourcedId)) {
                                    cohortsMap.set(sourcedId, {
                                        sourced_id: sourcedId,
                                        cohort_id: cohort.cohortId || cohort.cohort_id || null,
                                        cohort_name: cohort.cohortName || cohort.cohort_name || 'Unknown',
                                        school_id: schoolSourcedId,
                                    });
                                }
                            }
                        }
                    }
                    // Extract groups - check top level first, then nested in user
                    const groups = data.group || data.groups || (data.user?.group) || (data.user?.groups) || [];
                    if (Array.isArray(groups) && groups.length > 0) {
                        for (const group of groups) {
                            const sourcedId = group.sourcedId || group.sourced_id;
                            if (sourcedId) {
                                if (!groupsMap.has(sourcedId)) {
                                    groupsMap.set(sourcedId, {
                                        sourced_id: sourcedId,
                                        group_name: group.groupName || group.group_name || 'Unknown',
                                        unique_key: group.uniqueKey || group.unique_key || null,
                                        school_id: schoolSourcedId,
                                    });
                                }
                            }
                        }
                    }
                    // Extract homerooms - check top level first (we saw homeRoom in top level keys)
                    const homerooms = data.homeRoom || data.homeRooms || data.homeroom || data.homerooms ||
                        (data.user?.homeRoom) || (data.user?.homeRooms) || [];
                    if (Array.isArray(homerooms) && homerooms.length > 0) {
                        for (const homeroom of homerooms) {
                            const sourcedId = homeroom.sourcedId || homeroom.sourced_id;
                            if (sourcedId) {
                                if (!homeroomsMap.has(sourcedId)) {
                                    homeroomsMap.set(sourcedId, {
                                        sourced_id: sourcedId,
                                        class_name: homeroom.className || homeroom.class_name || null,
                                        grade_name: homeroom.gradeName || homeroom.grade_name || null,
                                        school_id: schoolSourcedId,
                                    });
                                }
                            }
                        }
                    }
                }
                // If we got fewer than the limit, we've reached the end
                if (allocations.length < limit) {
                    hasMore = false;
                }
                else {
                    offset += limit;
                }
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            console.log(`✅ Found ${allAllocations.length} total student allocation(s)`);
            console.log(`📊 Extracted ${subjectsMap.size} unique subject(s)`);
            console.log(`📊 Extracted ${cohortsMap.size} unique cohort(s)`);
            console.log(`📊 Extracted ${groupsMap.size} unique group(s)`);
            console.log(`📊 Extracted ${homeroomsMap.size} unique homeroom(s)`);
            // Save extracted entities to database
            console.log('💾 Saving extracted entities to database...');
            // Save subjects
            let savedSubjects = 0;
            for (const subject of subjectsMap.values()) {
                const { error } = await databaseService.upsertNexquareSubject(subject);
                if (!error)
                    savedSubjects++;
            }
            console.log(`✅ Saved ${savedSubjects} subject(s) to database`);
            // Save cohorts
            let savedCohorts = 0;
            for (const cohort of cohortsMap.values()) {
                const { error } = await databaseService.upsertNexquareCohort(cohort);
                if (!error)
                    savedCohorts++;
            }
            console.log(`✅ Saved ${savedCohorts} cohort(s) to database`);
            // Save groups
            let savedGroups = 0;
            for (const group of groupsMap.values()) {
                const { error } = await databaseService.upsertNexquareGroup(group);
                if (!error)
                    savedGroups++;
            }
            console.log(`✅ Saved ${savedGroups} group(s) to database`);
            // Save homerooms
            let savedHomerooms = 0;
            for (const homeroom of homeroomsMap.values()) {
                const { error } = await databaseService.upsertNexquareHomeroom(homeroom);
                if (!error)
                    savedHomerooms++;
            }
            console.log(`✅ Saved ${savedHomerooms} homeroom(s) to database`);
            // Now save the actual student allocation relationships using bulk insert
            console.log('💾 Preparing student allocation relationships for bulk insert...');
            // Collect all student sourced IDs for bulk lookup
            const studentSourcedIds = new Set();
            for (const allocation of allAllocations) {
                const data = allocation;
                const studentSourcedId = data.sourcedId || data.studentSourcedId;
                if (studentSourcedId) {
                    studentSourcedIds.add(studentSourcedId);
                }
            }
            console.log(`   🔍 Bulk fetching student IDs for ${studentSourcedIds.size} unique student(s)...`);
            const studentIdMap = await this.bulkGetStudentIds(Array.from(studentSourcedIds));
            console.log(`   ✅ Found ${studentIdMap.size} student ID(s) in database`);
            // Collect all group sourced IDs for bulk lookup
            const groupSourcedIds = new Set();
            for (const allocation of allAllocations) {
                const data = allocation;
                const groups = data.group || data.groups || (data.user?.group) || (data.user?.groups) || [];
                if (Array.isArray(groups)) {
                    for (const group of groups) {
                        const sourcedId = group.sourcedId || group.sourced_id;
                        if (sourcedId) {
                            groupSourcedIds.add(sourcedId);
                        }
                    }
                }
            }
            console.log(`   🔍 Bulk fetching group IDs for ${groupSourcedIds.size} unique group(s)...`);
            const groupIdMap = await this.bulkGetGroupIds(Array.from(groupSourcedIds));
            console.log(`   ✅ Found ${groupIdMap.size} group ID(s) in database`);
            const recordsToInsert = [];
            let skippedCount = 0;
            for (const allocation of allAllocations) {
                const data = allocation;
                const studentSourcedId = data.sourcedId || data.studentSourcedId;
                const academicYear = data.academicYear || null;
                if (!studentSourcedId) {
                    continue;
                }
                const studentInfo = studentIdMap.get(studentSourcedId);
                const studentId = studentInfo?.id || null;
                // Collect all allocation types
                const subjects = data.subject || [];
                const cohorts = data.cohort || [];
                const lessons = data.lesson || [];
                const homerooms = data.homeRoom || [];
                const groups = data.group || data.groups || (data.user?.group) || (data.user?.groups) || [];
                // Add subject allocations
                for (const subject of subjects) {
                    try {
                        recordsToInsert.push({
                            student_id: studentId,
                            student_sourced_id: studentSourcedId,
                            school_id: schoolSourcedId,
                            academic_year: academicYear,
                            subject_sourced_id: subject.subjectSourcedId || null,
                            subject_id: subject.subjectId || null,
                            subject_name: subject.subjectName || null,
                            allocation_type: subject.allocationType || null,
                        });
                    }
                    catch (error) {
                        skippedCount++;
                    }
                }
                // Add cohort allocations
                for (const cohort of cohorts) {
                    try {
                        recordsToInsert.push({
                            student_id: studentId,
                            student_sourced_id: studentSourcedId,
                            school_id: schoolSourcedId,
                            academic_year: academicYear,
                            cohort_sourced_id: cohort.sourcedId || null,
                            cohort_id: cohort.cohortId || null,
                            cohort_name: cohort.cohortName || null,
                        });
                    }
                    catch (error) {
                        skippedCount++;
                    }
                }
                // Add lesson allocations
                for (const lesson of lessons) {
                    try {
                        recordsToInsert.push({
                            student_id: studentId,
                            student_sourced_id: studentSourcedId,
                            school_id: schoolSourcedId,
                            academic_year: academicYear,
                            lesson_sourced_id: lesson.sourcedId || null,
                            lesson_id: lesson.lessonId || null,
                            lesson_name: lesson.lessonName || null,
                            class_id: lesson.classId || null,
                        });
                    }
                    catch (error) {
                        skippedCount++;
                    }
                }
                // Add homeroom allocations
                for (const homeroom of homerooms) {
                    try {
                        recordsToInsert.push({
                            student_id: studentId,
                            student_sourced_id: studentSourcedId,
                            school_id: schoolSourcedId,
                            academic_year: academicYear,
                            homeroom_sourced_id: homeroom.sourcedId || null,
                            homeroom_class_name: homeroom.className || null,
                            homeroom_grade_name: homeroom.gradeName || null,
                        });
                    }
                    catch (error) {
                        skippedCount++;
                    }
                }
                // Add group allocations
                for (const group of groups) {
                    try {
                        const groupSourcedId = group.sourcedId || group.sourced_id;
                        const groupInfo = groupSourcedId ? groupIdMap.get(groupSourcedId) : null;
                        const groupId = groupInfo?.id || null;
                        const groupName = group.groupName || group.group_name || null;
                        recordsToInsert.push({
                            student_id: studentId,
                            student_sourced_id: studentSourcedId,
                            school_id: schoolSourcedId,
                            academic_year: academicYear,
                            group_sourced_id: groupSourcedId || null,
                            group_id: groupId,
                            group_name: groupName,
                        });
                    }
                    catch (error) {
                        skippedCount++;
                    }
                }
            }
            console.log(`   💾 Bulk inserting ${recordsToInsert.length} student allocation relationship(s) to database...`);
            const { inserted, error: bulkError } = await databaseService.bulkInsertStudentAllocations(recordsToInsert);
            if (bulkError) {
                console.error(`❌ Bulk insert failed: ${bulkError}`);
                throw new Error(`Bulk insert failed: ${bulkError}`);
            }
            console.log(`✅ Saved ${inserted} student allocation relationship(s) to database`);
            if (skippedCount > 0) {
                console.warn(`⚠️  Skipped ${skippedCount} allocation(s) due to errors`);
            }
            return allAllocations;
        }
        catch (error) {
            console.error('Failed to fetch student allocations:', error);
            throw error;
        }
    }
    /**
     * Get staff allocations
     */
    async getStaffAllocations(config, schoolId) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            console.log(`👨‍🏫 Fetching staff allocations for school ${targetSchoolId}...`);
            const allAllocations = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;
            // Get the school sourced_id from sourced_id
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Allocations will be saved with school_id = NULL.`);
            }
            while (hasMore) {
                // Use staffAllocation endpoint (camelCase, similar to studentsAllocation)
                const endpoint = `${NEXQUARE_ENDPOINTS.STAFF_ALLOCATIONS}/${targetSchoolId}/staffAllocation`;
                const queryParams = new URLSearchParams();
                queryParams.append('offset', offset.toString());
                queryParams.append('limit', limit.toString());
                const url = `${endpoint}?${queryParams.toString()}`;
                const response = await this.makeRequest(url, config);
                // Handle different response structures
                let allocations = [];
                if (Array.isArray(response)) {
                    allocations = response;
                }
                else if (response.users && Array.isArray(response.users)) {
                    allocations = response.users;
                }
                else if (response.user) {
                    allocations = [response];
                }
                else if (response.data) {
                    allocations = Array.isArray(response.data) ? response.data : [response.data];
                }
                else if (typeof response === 'object' && response !== null) {
                    allocations = [response];
                }
                if (allocations.length === 0) {
                    hasMore = false;
                    break;
                }
                allAllocations.push(...allocations);
                console.log(`   Fetched ${allocations.length} staff allocation(s) (total: ${allAllocations.length})`);
                // If we got fewer than the limit, we've reached the end
                if (allocations.length < limit) {
                    hasMore = false;
                }
                else {
                    offset += limit;
                }
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            console.log(`✅ Found ${allAllocations.length} total staff allocation(s)`);
            // Save staff allocation relationships using bulk insert
            console.log('💾 Preparing staff allocation relationships for bulk insert...');
            // Collect all staff sourced IDs for bulk lookup
            const staffSourcedIds = new Set();
            for (const allocation of allAllocations) {
                const data = allocation;
                const staffSourcedId = data.sourcedId || data.staffSourcedId;
                if (staffSourcedId) {
                    staffSourcedIds.add(staffSourcedId);
                }
            }
            // Bulk fetch staff IDs (similar to students)
            const staffIdMap = new Map();
            if (staffSourcedIds.size > 0) {
                const uniqueIds = Array.from(staffSourcedIds);
                const batchSize = 1000;
                for (let i = 0; i < uniqueIds.length; i += batchSize) {
                    const batch = uniqueIds.slice(i, i + batchSize);
                    const placeholders = batch.map((_, idx) => `@id${idx}`).join(',');
                    const query = `
            SELECT id, sourced_id FROM NEX.staff WHERE sourced_id IN (${placeholders});
          `;
                    const params = {};
                    batch.forEach((id, idx) => {
                        params[`id${idx}`] = id;
                    });
                    const result = await executeQuery(query, params);
                    if (!result.error && result.data) {
                        result.data.forEach(row => {
                            staffIdMap.set(row.sourced_id, { id: row.id, sourced_id: row.sourced_id });
                        });
                    }
                }
            }
            const recordsToInsert = [];
            let skippedCount = 0;
            for (const allocation of allAllocations) {
                const data = allocation;
                const staffSourcedId = data.sourcedId || data.staffSourcedId;
                const academicYear = data.academicYear || null;
                if (!staffSourcedId) {
                    continue;
                }
                const staffInfo = staffIdMap.get(staffSourcedId);
                const staffId = staffInfo?.id || null;
                const subjects = data.subject || [];
                const cohorts = data.cohort || [];
                const lessons = data.lesson || [];
                // Add subject allocations
                for (const subject of subjects) {
                    try {
                        recordsToInsert.push({
                            staff_id: staffId,
                            staff_sourced_id: staffSourcedId,
                            school_id: schoolSourcedId,
                            academic_year: academicYear,
                            subject_sourced_id: subject.subjectSourcedId || subject.subject_sourced_id || null,
                            subject_id: subject.subjectId || subject.subject_id || null,
                            subject_name: subject.subjectName || subject.subject_name || null,
                            allocation_type: subject.allocationType || subject.allocation_type || null,
                        });
                    }
                    catch (error) {
                        skippedCount++;
                    }
                }
                // Add cohort allocations
                for (const cohort of cohorts) {
                    try {
                        recordsToInsert.push({
                            staff_id: staffId,
                            staff_sourced_id: staffSourcedId,
                            school_id: schoolSourcedId,
                            academic_year: academicYear,
                            cohort_sourced_id: cohort.sourcedId || cohort.sourced_id || null,
                            cohort_id: cohort.cohortId || cohort.cohort_id || null,
                            cohort_name: cohort.cohortName || cohort.cohort_name || null,
                        });
                    }
                    catch (error) {
                        skippedCount++;
                    }
                }
                // Add lesson allocations
                for (const lesson of lessons) {
                    try {
                        recordsToInsert.push({
                            staff_id: staffId,
                            staff_sourced_id: staffSourcedId,
                            school_id: schoolSourcedId,
                            academic_year: academicYear,
                            lesson_sourced_id: lesson.sourcedId || lesson.sourced_id || null,
                            lesson_id: lesson.lessonId || lesson.lesson_id || null,
                            lesson_name: lesson.lessonName || lesson.lesson_name || null,
                            class_id: lesson.classId || lesson.class_id || null,
                        });
                    }
                    catch (error) {
                        skippedCount++;
                    }
                }
            }
            console.log(`   💾 Bulk inserting ${recordsToInsert.length} staff allocation relationship(s) to database...`);
            const { inserted, error: bulkError } = await databaseService.bulkInsertStaffAllocations(recordsToInsert);
            if (bulkError) {
                console.error(`❌ Bulk insert failed: ${bulkError}`);
                throw new Error(`Bulk insert failed: ${bulkError}`);
            }
            console.log(`✅ Saved ${inserted} staff allocation relationship(s) to database`);
            if (skippedCount > 0) {
                console.warn(`⚠️  Skipped ${skippedCount} allocation(s) due to errors`);
            }
            return allAllocations;
        }
        catch (error) {
            console.error('Failed to fetch staff allocations:', error);
            throw error;
        }
    }
    /**
     * Get student by sourced_id (helper method)
     */
    async getNexquareStudent(sourcedId) {
        try {
            const query = `
        SELECT * FROM NEX.students WHERE sourced_id = @sourced_id;
      `;
            const result = await executeQuery(query, {
                sourced_id: sourcedId,
            });
            if (result.error) {
                return { data: null, error: result.error };
            }
            return { data: result.data?.[0] || null, error: null };
        }
        catch (error) {
            console.error(`Error getting student ${sourcedId}:`, error);
            return { data: null, error: error.message || 'Unknown error' };
        }
    }
    /**
     * Get staff by sourced_id (helper method)
     */
    async getNexquareStaff(sourcedId) {
        try {
            const query = `
        SELECT * FROM NEX.staff WHERE sourced_id = @sourced_id;
      `;
            const result = await executeQuery(query, {
                sourced_id: sourcedId,
            });
            if (result.error) {
                return { data: null, error: result.error };
            }
            return { data: result.data?.[0] || null, error: null };
        }
        catch (error) {
            console.error(`Error getting staff ${sourcedId}:`, error);
            return { data: null, error: error.message || 'Unknown error' };
        }
    }
    /**
     * Bulk fetch student IDs by sourced_id or identifier
     * Returns a map of student_sourced_id -> { id, sourced_id }
     */
    async bulkGetStudentIds(studentIdentifiers) {
        if (studentIdentifiers.length === 0) {
            return new Map();
        }
        try {
            // Build query with IN clause - SQL Server supports up to 2100 parameters
            // We'll batch this if needed, but typically we won't have that many unique students
            const uniqueIds = [...new Set(studentIdentifiers.filter(id => id))];
            if (uniqueIds.length === 0) {
                return new Map();
            }
            // Split into batches of 1000 to stay well under the limit
            const batchSize = 1000;
            const resultMap = new Map();
            for (let i = 0; i < uniqueIds.length; i += batchSize) {
                const batch = uniqueIds.slice(i, i + batchSize);
                const placeholders = batch.map((_, idx) => `@id${idx}`).join(',');
                const identifierPlaceholders = batch.map((_, idx) => `@identifier${idx}`).join(',');
                const query = `
          SELECT id, sourced_id, identifier 
          FROM NEX.students 
          WHERE sourced_id IN (${placeholders}) 
             OR identifier IN (${identifierPlaceholders});
        `;
                const params = {};
                batch.forEach((id, idx) => {
                    params[`id${idx}`] = id;
                    params[`identifier${idx}`] = id;
                });
                const result = await executeQuery(query, params);
                if (!result.error && result.data) {
                    result.data.forEach(row => {
                        // Map by sourced_id
                        if (row.sourced_id) {
                            resultMap.set(row.sourced_id, { id: row.id, sourced_id: row.sourced_id });
                        }
                        // Also map by identifier if different
                        if (row.identifier && row.identifier !== row.sourced_id) {
                            resultMap.set(row.identifier, { id: row.id, sourced_id: row.sourced_id });
                        }
                    });
                }
            }
            return resultMap;
        }
        catch (error) {
            console.error('Error bulk fetching student IDs:', error);
            return new Map();
        }
    }
    /**
     * Bulk fetch group IDs from database by sourced_id
     */
    async bulkGetGroupIds(groupSourcedIds) {
        if (groupSourcedIds.length === 0) {
            return new Map();
        }
        try {
            const uniqueIds = [...new Set(groupSourcedIds.filter(id => id))];
            if (uniqueIds.length === 0) {
                return new Map();
            }
            // Split into batches of 1000 to stay well under the limit
            const batchSize = 1000;
            const resultMap = new Map();
            for (let i = 0; i < uniqueIds.length; i += batchSize) {
                const batch = uniqueIds.slice(i, i + batchSize);
                const placeholders = batch.map((_, idx) => `@id${idx}`).join(',');
                const query = `
          SELECT id, sourced_id
          FROM NEX.groups 
          WHERE sourced_id IN (${placeholders});
        `;
                const params = {};
                batch.forEach((id, idx) => {
                    params[`id${idx}`] = id;
                });
                const result = await executeQuery(query, params);
                if (!result.error && result.data) {
                    result.data.forEach(row => {
                        if (row.sourced_id) {
                            resultMap.set(row.sourced_id, { id: row.id, sourced_id: row.sourced_id });
                        }
                    });
                }
            }
            return resultMap;
        }
        catch (error) {
            console.error('Error bulk fetching group IDs:', error);
            return new Map();
        }
    }
    /**
     * Get daily plans (timetable data)
     * Note: API limits date range to 1 week, so we fetch week by week
     */
    async getDailyPlans(config, schoolId, fromDate, toDate, subject, classId, cohort, teacher, location) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            // Default to current week if no dates provided
            // API allows max 7 days range (inclusive), so we use 6 days from today
            const today = new Date();
            const defaultFromDate = fromDate || this.formatDateForAPI(today);
            // Calculate 6 days from today to ensure we stay within 7-day limit (inclusive)
            const sixDaysLater = new Date(today);
            sixDaysLater.setDate(sixDaysLater.getDate() + 6);
            const defaultToDate = toDate || this.formatDateForAPI(sixDaysLater);
            console.log(`📅 Fetching daily plans for school ${targetSchoolId} from ${defaultFromDate} to ${defaultToDate}...`);
            const allPlans = [];
            // Get the school sourced_id from sourced_id
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Plans will be saved with school_id = NULL.`);
            }
            // Helper function to fetch plans for a date range
            const fetchPlansForRange = async (startDate, endDate) => {
                const endpoint = NEXQUARE_ENDPOINTS.DAILY_PLAN;
                const queryParams = new URLSearchParams();
                queryParams.append('fromDate', startDate);
                queryParams.append('toDate', endDate);
                queryParams.append('schooolId', targetSchoolId); // Note: API uses "schooolId" (3 o's)
                if (subject)
                    queryParams.append('subject', subject);
                if (classId)
                    queryParams.append('class', classId);
                if (cohort)
                    queryParams.append('cohort', cohort);
                if (teacher)
                    queryParams.append('teacher', teacher);
                if (location)
                    queryParams.append('location', location);
                const url = `${endpoint}?${queryParams.toString()}`;
                const response = await this.makeRequest(url, config);
                // Handle different response structures
                let plans = [];
                if (Array.isArray(response)) {
                    plans = response;
                }
                else if (response.plans && Array.isArray(response.plans)) {
                    plans = response.plans;
                }
                else if (response.data && Array.isArray(response.data)) {
                    plans = response.data;
                }
                else if (response.dailyPlan && Array.isArray(response.dailyPlan)) {
                    plans = response.dailyPlan;
                }
                else if (typeof response === 'object' && response !== null) {
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
            const recordsToInsert = [];
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
                }
                catch (error) {
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
        }
        catch (error) {
            console.error('Failed to fetch daily plans:', error);
            throw error;
        }
    }
    /**
     * Format date for API (YYYY-MM-DD)
     */
    formatDateForAPI(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    /**
     * Get daily attendance records
     * Fetches in monthly chunks to avoid timeout
     */
    async getDailyAttendance(config, schoolId, startDate, endDate, categoryRequired = false, rangeType = 0, studentSourcedId) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            // Default to current academic year if no dates provided
            const today = new Date();
            const defaultStartDate = startDate || this.formatDateForAPI(new Date(today.getFullYear(), 0, 1)); // Jan 1 of current year
            const defaultEndDate = endDate || this.formatDateForAPI(today);
            console.log(`📊 Fetching daily attendance for school ${targetSchoolId} from ${defaultStartDate} to ${defaultEndDate}...`);
            const allAttendance = [];
            // Get the school sourced_id from sourced_id
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Attendance will be saved with school_id = NULL.`);
            }
            // Helper function to fetch attendance for a date range
            const fetchAttendanceForRange = async (start, end, offset = 0) => {
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
                const response = await this.makeRequest(url, config);
                // Debug: Log response structure for first call (first chunk, first offset)
                if (offset === 0) {
                    console.log('🔍 Daily attendance response keys:', Object.keys(response).join(', '));
                    if (response.attendance && Array.isArray(response.attendance) && response.attendance.length > 0) {
                        console.log('🔍 First attendance record keys:', Object.keys(response.attendance[0]).join(', '));
                        console.log('🔍 First attendance sample:', JSON.stringify(response.attendance[0]).substring(0, 300));
                    }
                    else if (Array.isArray(response) && response.length > 0) {
                        console.log('🔍 First attendance record keys:', Object.keys(response[0]).join(', '));
                        console.log('🔍 First attendance sample:', JSON.stringify(response[0]).substring(0, 300));
                    }
                }
                // Handle different response structures
                let records = [];
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
                }
                else if (Array.isArray(response)) {
                    records = response;
                }
                else if (response.attendance && Array.isArray(response.attendance)) {
                    records = response.attendance;
                }
                else if (response.data && Array.isArray(response.data)) {
                    records = response.data;
                }
                else if (response.dailyAttendance && Array.isArray(response.dailyAttendance)) {
                    records = response.dailyAttendance;
                }
                else if (response.students && Array.isArray(response.students)) {
                    // Response might have students array with nested attendance
                    // Flatten: one record per student per date
                    for (const student of response.students) {
                        if (student.attendance && typeof student.attendance === 'object') {
                            // Attendance is an object with dates as keys
                            for (const [date, attendanceData] of Object.entries(student.attendance)) {
                                const dataObj = typeof attendanceData === 'object' && attendanceData !== null
                                    ? attendanceData
                                    : {};
                                records.push({
                                    ...dataObj,
                                    studentSourcedId: student.sourcedId || student.id,
                                    date: date
                                });
                            }
                        }
                        else {
                            // Single attendance record for student
                            records.push({
                                ...student,
                                studentSourcedId: student.sourcedId || student.id
                            });
                        }
                    }
                }
                else if (typeof response === 'object' && response !== null) {
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
            const chunks = [];
            let currentStart = new Date(start);
            while (currentStart <= end) {
                const chunkEnd = new Date(currentStart);
                chunkEnd.setMonth(chunkEnd.getMonth() + 1);
                chunkEnd.setDate(0); // Last day of current month
                if (chunkEnd > end) {
                    chunkEnd.setTime(end.getTime());
                }
                chunks.push({
                    start: this.formatDateForAPI(currentStart),
                    end: this.formatDateForAPI(chunkEnd)
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
                    const { records, hasMore } = await fetchAttendanceForRange(chunk.start, chunk.end, chunkOffset);
                    if (records.length === 0) {
                        chunkHasMore = false;
                        break;
                    }
                    allAttendance.push(...records);
                    console.log(`     Fetched ${records.length} record(s) (total: ${allAttendance.length})`);
                    if (!hasMore || records.length < 1000) {
                        chunkHasMore = false;
                    }
                    else {
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
            const studentIdentifiers = new Set();
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
            const recordsToInsert = [];
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
                    let attendanceDate = defaultStartDate;
                    if (record.attendanceDate) {
                        try {
                            const dateObj = new Date(record.attendanceDate);
                            if (!isNaN(dateObj.getTime())) {
                                attendanceDate = this.formatDateForAPI(dateObj);
                            }
                        }
                        catch (e) {
                            attendanceDate = record.date || record.attendance_date || defaultStartDate;
                        }
                    }
                    else {
                        attendanceDate = record.date || record.attendance_date || defaultStartDate;
                    }
                    // Get student_id from bulk lookup map
                    let dbStudentId = null;
                    if (studentSourcedId) {
                        // Try direct lookup
                        const studentInfo = studentIdMap.get(studentSourcedId);
                        if (studentInfo) {
                            dbStudentId = studentInfo.id;
                            studentSourcedId = studentInfo.sourced_id; // Use canonical sourced_id
                        }
                        else if (/^\d+$/.test(studentSourcedId)) {
                            // Try with ST- prefix
                            const studentInfoWithPrefix = studentIdMap.get(`ST-${studentSourcedId}`);
                            if (studentInfoWithPrefix) {
                                dbStudentId = studentInfoWithPrefix.id;
                                studentSourcedId = studentInfoWithPrefix.sourced_id;
                            }
                        }
                    }
                    // Map status: API uses "P" (Present), "A" (Absent), etc.
                    let status = null;
                    if (record.status) {
                        if (typeof record.status === 'string') {
                            status = record.status;
                        }
                        else if (typeof record.status === 'object' && record.status !== null) {
                            status = record.status.status || record.status.code || record.status.value ||
                                record.status.name || JSON.stringify(record.status);
                        }
                    }
                    else {
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
                    let categoryCode = null;
                    let categoryName = null;
                    if (record.categoryCode || record.category_code) {
                        categoryCode = record.categoryCode || record.category_code;
                    }
                    else if (record.status && typeof record.status === 'object' && record.status !== null) {
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
                }
                catch (error) {
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
        }
        catch (error) {
            console.error('Failed to fetch daily attendance:', error);
            throw error;
        }
    }
    /**
     * Get lesson attendance records
     * Fetches in monthly chunks to avoid timeout
     */
    async getLessonAttendance(config, schoolId, startDate, endDate, categoryRequired = false, rangeType = 0, studentSourcedId) {
        try {
            const targetSchoolId = schoolId || this.getCurrentSchoolId();
            if (!targetSchoolId) {
                throw new Error('School ID is required');
            }
            // Default to current academic year if no dates provided
            const today = new Date();
            const defaultStartDate = startDate || this.formatDateForAPI(new Date(today.getFullYear(), 0, 1)); // Jan 1 of current year
            const defaultEndDate = endDate || this.formatDateForAPI(today);
            console.log(`📚 Fetching lesson attendance for school ${targetSchoolId} from ${defaultStartDate} to ${defaultEndDate}...`);
            const allAttendance = [];
            // Get the school sourced_id from sourced_id
            const schoolSourcedId = await this.getSchoolSourcedId(targetSchoolId);
            if (!schoolSourcedId) {
                console.warn(`⚠️  Warning: School with sourced_id "${targetSchoolId}" not found in database. Attendance will be saved with school_id = NULL.`);
            }
            // Helper function to fetch attendance for a date range
            const fetchAttendanceForRange = async (start, end, offset = 0) => {
                const endpoint = NEXQUARE_ENDPOINTS.LESSON_ATTENDANCE;
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
                const response = await this.makeRequest(url, config);
                // Handle different response structures
                let records = [];
                if (Array.isArray(response)) {
                    records = response;
                }
                else if (response.attendance && Array.isArray(response.attendance)) {
                    records = response.attendance;
                }
                else if (response.data && Array.isArray(response.data)) {
                    records = response.data;
                }
                else if (response.lessonAttendance && Array.isArray(response.lessonAttendance)) {
                    records = response.lessonAttendance;
                }
                else if (typeof response === 'object' && response !== null) {
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
            const chunks = [];
            let currentStart = new Date(start);
            while (currentStart <= end) {
                const chunkEnd = new Date(currentStart);
                chunkEnd.setMonth(chunkEnd.getMonth() + 1);
                chunkEnd.setDate(0); // Last day of current month
                if (chunkEnd > end) {
                    chunkEnd.setTime(end.getTime());
                }
                chunks.push({
                    start: this.formatDateForAPI(currentStart),
                    end: this.formatDateForAPI(chunkEnd)
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
                    const { records, hasMore } = await fetchAttendanceForRange(chunk.start, chunk.end, chunkOffset);
                    if (records.length === 0) {
                        chunkHasMore = false;
                        break;
                    }
                    allAttendance.push(...records);
                    console.log(`     Fetched ${records.length} record(s) (total: ${allAttendance.length})`);
                    if (!hasMore || records.length < 1000) {
                        chunkHasMore = false;
                    }
                    else {
                        chunkOffset += 1000;
                    }
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            console.log(`✅ Found ${allAttendance.length} total lesson attendance record(s)`);
            // Save attendance to database using bulk insert
            console.log('💾 Preparing lesson attendance records for bulk insert...');
            // Step 1: Collect all student identifiers for bulk lookup
            const studentIdentifiers = new Set();
            for (const record of allAttendance) {
                const studentSourcedId = record.sourcedId || record.studentSourcedId || record.sourcedID;
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
            const recordsToInsert = [];
            let skippedCount = 0;
            for (const record of allAttendance) {
                try {
                    const studentSourcedId = record.sourcedId || record.studentSourcedId || record.sourcedID;
                    const attendanceDate = record.date || record.attendanceDate || record.attendance_date || defaultStartDate;
                    // Get student_id from bulk lookup map
                    let dbStudentId = null;
                    let canonicalSourcedId = studentSourcedId || null;
                    if (studentSourcedId) {
                        // Try direct lookup
                        const studentInfo = studentIdMap.get(studentSourcedId);
                        if (studentInfo) {
                            dbStudentId = studentInfo.id;
                            canonicalSourcedId = studentInfo.sourced_id;
                        }
                        else if (/^\d+$/.test(studentSourcedId)) {
                            // Try with ST- prefix
                            const studentInfoWithPrefix = studentIdMap.get(`ST-${studentSourcedId}`);
                            if (studentInfoWithPrefix) {
                                dbStudentId = studentInfoWithPrefix.id;
                                canonicalSourcedId = studentInfoWithPrefix.sourced_id;
                            }
                        }
                    }
                    const metadataJson = record.metadata ? JSON.stringify(record.metadata) : null;
                    recordsToInsert.push({
                        school_id: schoolSourcedId,
                        student_id: dbStudentId,
                        student_sourced_id: canonicalSourcedId,
                        lesson_id: record.lessonId || record.lesson_id || null,
                        timetable_lesson_sourced_id: record.timetableLessonSourcedId || record.timetable_lesson_sourced_id || record.ttLesson || null,
                        attendance_date: attendanceDate,
                        attendance_time: record.time || record.attendanceTime || record.attendance_time || null,
                        status: record.status || null,
                        category_code: record.categoryCode || record.category_code || null,
                        category_name: record.categoryName || record.category_name || null,
                        subject_sourced_id: record.subjectSourcedId || record.subject_sourced_id || record.subject || null,
                        subject_name: record.subjectName || record.subject_name || null,
                        class_sourced_id: record.classSourcedId || record.class_sourced_id || record.class || null,
                        class_name: record.className || record.class_name || null,
                        teacher_sourced_id: record.teacherSourcedId || record.teacher_sourced_id || record.teacher || null,
                        teacher_name: record.teacherName || record.teacher_name || null,
                        notes: record.notes || null,
                        metadata: metadataJson,
                    });
                }
                catch (error) {
                    console.error(`❌ Error preparing lesson attendance record:`, error.message);
                    skippedCount++;
                }
            }
            // Step 3: Bulk insert all records using optimized bulk insert method
            console.log(`   💾 Bulk inserting ${recordsToInsert.length} record(s) to database...`);
            const { inserted, error: bulkError } = await databaseService.bulkInsertLessonAttendance(recordsToInsert);
            if (bulkError) {
                console.error(`❌ Bulk insert failed: ${bulkError}`);
                throw new Error(`Bulk insert failed: ${bulkError}`);
            }
            console.log(`✅ Saved ${inserted} lesson attendance record(s) to database`);
            if (skippedCount > 0) {
                console.warn(`⚠️  Skipped ${skippedCount} record(s) due to missing identifiers or errors`);
            }
            return allAttendance;
        }
        catch (error) {
            console.error('Failed to fetch lesson attendance:', error);
            throw error;
        }
    }
    /**
     * Fetch student assessment/grade book data
     * Returns Excel file which is parsed and bulk inserted to database using temporary table approach
     * This is faster than batched INSERT statements as SQL Server can optimize the final insert
     * No validations - direct mapping from Excel to database
     * Processes all data efficiently using temp table and single INSERT SELECT operation
     */
    async getStudentAssessments(config, schoolId, academicYear, fileName, limit = 10000, offset = 0) {
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
     */
    async saveAssessmentBatch(records, schoolSourcedId) {
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
}
// Export singleton instance
export const nexquareService = new NexquareService();
//# sourceMappingURL=NexquareService.js.map