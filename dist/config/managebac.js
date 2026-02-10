/**
 * ManageBac API Configuration
 * Note: Credentials and base URLs are now loaded from database via config_id parameter
 * These are only constants used by the service
 */
export const MANAGEBAC_CONFIG = {
    TIMEOUT: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3,
    DEFAULT_BASE_URL: 'https://api.managebac.com', // Default if not provided in config
};
export const MANAGEBAC_ENDPOINTS = {
    SCHOOL: '/school',
    ACADEMIC_YEARS: '/school/academic-years',
    GRADES: '/school/grades',
    SUBJECTS: '/school/subjects',
    TEACHERS: '/teachers',
    STUDENTS: '/students',
    CLASSES: '/classes',
    YEAR_GROUPS: '/year-groups',
    MEMBERSHIPS: '/memberships',
    TERM_GRADES: '/classes/:class_id/assessments/term/:term_id/term-grades',
    AUTH: '/auth/validate',
};
/**
 * Build ManageBac URL from base URL
 * Note: This is now used in ManageBacService with config-provided base_url
 */
export const buildManageBacUrl = (endpoint, baseUrl) => {
    // Remove trailing slash if present
    let cleanBaseUrl = baseUrl.replace(/\/$/, '');
    // If user provided a school subdomain, use api.managebac.com instead
    if (cleanBaseUrl.includes('.managebac.com') && !cleanBaseUrl.includes('api.managebac.com')) {
        cleanBaseUrl = 'https://api.managebac.com';
    }
    // Add /v2 if not already present
    if (!cleanBaseUrl.includes('/v2')) {
        cleanBaseUrl = `${cleanBaseUrl}/v2`;
    }
    // Ensure endpoint starts with /
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBaseUrl}${cleanEndpoint}`;
};
export const getManageBacHeaders = (apiKey, method = 'GET') => {
    const headers = {
        'auth-token': apiKey,
        'Cache-Control': 'no-cache',
        'Accept': '*/*',
    };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
};
//# sourceMappingURL=managebac.js.map