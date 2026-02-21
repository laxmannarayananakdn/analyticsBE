/**
 * User Access Management Service
 */
import { UserNodeAccess, UserSchoolAccess, GrantAccessRequest } from '../types/auth.js';
/**
 * Get user's effective node access (derived from Access Groups only).
 * Node access is configured in Access Groups; users get access via User Groups assignment.
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
 * Get nodes the user has access to (from Access Groups only, including descendant nodes via hierarchy).
 * Used when you need node access WITHOUT involving Node_School (e.g. node picker, "your nodes").
 * Each node is returned once with its description.
 */
export declare function getUserAccessibleNodes(email: string): Promise<Array<{
    nodeId: string;
    nodeDescription: string;
}>>;
/**
 * Get node IDs the user has access to (from Access Groups only, including descendant nodes via hierarchy).
 * Used for scope-based report filtering.
 */
export declare function getUserAccessibleNodeIds(email: string): Promise<string[]>;
/**
 * Revoke specific department access for a node
 */
export declare function revokeDepartmentAccess(email: string, nodeId: string, departmentId: string): Promise<void>;
//# sourceMappingURL=AccessService.d.ts.map