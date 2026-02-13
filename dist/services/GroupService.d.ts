/**
 * Access Groups Service
 * CRUD for groups, group node access, and user-group assignment.
 */
export interface AccessGroup {
    Group_ID: string;
    Group_Name: string;
    Group_Description: string | null;
}
export interface GroupNodeAccess {
    groupId: string;
    nodeId: string;
    departmentId: string;
}
/**
 * Get all access groups
 */
export declare function getAllGroups(): Promise<AccessGroup[]>;
/**
 * Get group by ID
 */
export declare function getGroupById(groupId: string): Promise<AccessGroup | null>;
/**
 * Create access group
 */
export declare function createGroup(groupId: string, groupName: string, groupDescription: string | null, createdBy: string): Promise<AccessGroup>;
/**
 * Update access group
 */
export declare function updateGroup(groupId: string, groupName: string, groupDescription: string | null): Promise<AccessGroup>;
/**
 * Delete access group (cascades to Group_Node_Access and User_Group)
 */
export declare function deleteGroup(groupId: string): Promise<void>;
/**
 * Get group's node access
 */
export declare function getGroupNodeAccess(groupId: string): Promise<GroupNodeAccess[]>;
/**
 * Set group's node access (replaces existing)
 */
export declare function setGroupNodeAccess(groupId: string, nodeAccessList: Array<{
    nodeId: string;
    departmentIds: string[];
}>, createdBy: string): Promise<void>;
/**
 * Get groups assigned to a user
 */
export declare function getUserGroups(email: string): Promise<string[]>;
/**
 * Set groups for a user (replaces existing)
 */
export declare function setUserGroups(email: string, groupIds: string[], createdBy: string): Promise<void>;
//# sourceMappingURL=GroupService.d.ts.map