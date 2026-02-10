/**
 * TypeScript types for Nexquare API responses
 */

/**
 * OAuth Token Response
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * API Status Response
 */
export interface ApiStatus {
  statusCode: number;
  statusMessage: string;
}

/**
 * School/Organization from API
 */
export interface NexquareSchool {
  sourcedId: string;
  status: string;
  dateLastModified: string;
  metadata: Record<string, any>;
  name: string;
  type: string;
  identifier?: string;
  parent?: Record<string, any>;
  children?: any[];
}

/**
 * Schools API Response
 */
export interface SchoolsResponse {
  orgs: NexquareSchool[];
  status: ApiStatus;
}

/**
 * User (Student/Staff) from API
 */
export interface NexquareUser {
  sourcedId: string;
  status: string;
  dateLastModified?: string;
  metadata?: Record<string, any>;
  username?: string;
  userMasterIdentifier?: string;
  enabledUser?: boolean;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  identifier?: string;
  email?: string;
  sms?: string;
  phone?: string;
  agentSourcedIds?: string[];
  orgs?: Array<{ href?: string; sourcedId?: string; type?: string }>;
  userId?: string;
  role?: string;
  userType?: string;
}

/**
 * Users API Response
 */
export interface UsersResponse {
  users?: NexquareUser[];
  user?: NexquareUser;
  status: ApiStatus;
}

/**
 * Class from API
 */
export interface NexquareClass {
  sourcedId: string;
  status: string;
  dateLastModified?: string;
  metadata?: Record<string, any>;
  title?: string;
  classCode?: string;
  classType?: string;
  location?: string;
  grades?: string[];
  subjects?: Array<{ href?: string; sourcedId?: string; type?: string }>;
  course?: { href?: string; sourcedId?: string; type?: string };
  school?: { href?: string; sourcedId?: string; type?: string };
  periods?: Array<{ href?: string; sourcedId?: string; type?: string }>;
}

/**
 * Classes API Response
 */
export interface ClassesResponse {
  classes?: NexquareClass[];
  class?: NexquareClass;
  status: ApiStatus;
}

/**
 * Student Allocation Response
 */
export interface StudentAllocationResponse {
  user: {
    sourcedId: string;
    identifier?: string;
    fullName?: string;
    academicYear?: string;
    user?: string;
    schoolId?: number;
    homeRoom?: Array<{
      sourcedId: string;
      className?: string;
      gradeName?: string;
    }>;
    subject?: Array<{
      sourcedId: string;
      subjectId?: number;
      subjectName?: string;
      allocationType?: string;
    }>;
    cohort?: Array<{
      sourcedId: string;
      cohortId?: number;
      cohortName?: string;
    }>;
    lesson?: Array<{
      studentId?: number;
      sourcedId: string;
      subjectId?: number;
      cohortId?: number;
      lessonId?: string;
      classId?: number;
      lessonName?: string;
    }>;
    group?: Array<{
      sourcedId: string;
      groupName?: string;
      uniqueKey?: string;
    }>;
    timetableLesson?: string[];
  };
  status: ApiStatus;
}

/**
 * Generic API Response wrapper
 */
export interface NexquareApiResponse<T> {
  data?: T;
  status?: ApiStatus;
  [key: string]: any;
}
