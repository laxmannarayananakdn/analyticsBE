/**
 * ManageBac API Configuration
 * Note: Credentials and base URLs are now loaded from database via config_id parameter
 * These are only constants used by the service
 */
export declare const MANAGEBAC_CONFIG: {
    readonly TIMEOUT: 30000;
    readonly RETRY_ATTEMPTS: 3;
    readonly DEFAULT_BASE_URL: "https://api.managebac.com";
};
export declare const MANAGEBAC_ENDPOINTS: {
    readonly SCHOOL: "/school";
    readonly ACADEMIC_YEARS: "/school/academic-years";
    readonly GRADES: "/school/grades";
    readonly SUBJECTS: "/school/subjects";
    readonly TEACHERS: "/teachers";
    readonly STUDENTS: "/students";
    readonly CLASSES: "/classes";
    readonly YEAR_GROUPS: "/year-groups";
    readonly MEMBERSHIPS: "/memberships";
    readonly TERM_GRADES: "/classes/:class_id/assessments/term/:term_id/term-grades";
    readonly AUTH: "/auth/validate";
};
/**
 * Build ManageBac URL from base URL
 * Note: This is now used in ManageBacService with config-provided base_url
 */
export declare const buildManageBacUrl: (endpoint: string, baseUrl: string) => string;
export declare const getManageBacHeaders: (apiKey: string, method?: string) => Record<string, string>;
//# sourceMappingURL=managebac.d.ts.map