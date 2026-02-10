/**
 * User Access Management Service
 */
import { UserNodeAccess, UserSchoolAccess, GrantAccessRequest } from '../types/auth';
/**
 * Get user's node access assignments
 */
export declare function getUserAccess(email: string): Promise<UserNodeAccess[]>;
/**
 * Get user's school access (using database function)
 */
export declare function getUserSchoolAccess(email: string): Promise<UserSchoolAccess[]>;
/**
 * Get user's distinct departments
 */
export declare function getUserDepartments(email: string): Promise<string[]>;
/**
 * Grant user access to node with departments
 */
export declare function grantAccess(email: string, grantRequest: GrantAccessRequest, createdBy: string): Promise<UserNodeAccess[]>;
/**
 * Update user's department access for a node (replaces existing)
 */
export declare function updateAccess(email: string, nodeId: string, updateRequest: {
    departmentIds: string[];
}, createdBy: string): Promise<UserNodeAccess[]>;
/**
 * Revoke all user access to a node
 */
export declare function revokeNodeAccess(email: string, nodeId: string): Promise<void>;
/**
 * Revoke specific department access for a node
 */
export declare function revokeDepartmentAccess(email: string, nodeId: string, departmentId: string): Promise<void>;
//# sourceMappingURL=AccessService.d.ts.map