/**
 * Access Groups Service
 * CRUD for groups, group node access, and user-group assignment.
 */
import { executeQuery } from '../config/database.js';
/**
 * Get all access groups
 */
export async function getAllGroups() {
    const result = await executeQuery(`SELECT Group_ID, Group_Name, Group_Description FROM admin.Access_Group ORDER BY Group_Name`, {});
    if (result.error)
        throw new Error(result.error);
    return result.data || [];
}
/**
 * Get group by ID
 */
export async function getGroupById(groupId) {
    const result = await executeQuery(`SELECT Group_ID, Group_Name, Group_Description FROM admin.Access_Group WHERE Group_ID = @groupId`, { groupId });
    if (result.error)
        throw new Error(result.error);
    return result.data && result.data.length > 0 ? result.data[0] : null;
}
/**
 * Create access group
 */
export async function createGroup(groupId, groupName, groupDescription, createdBy) {
    const result = await executeQuery(`INSERT INTO admin.Access_Group (Group_ID, Group_Name, Group_Description, Created_By)
     VALUES (@groupId, @groupName, @groupDescription, @createdBy);
     SELECT Group_ID, Group_Name, Group_Description FROM admin.Access_Group WHERE Group_ID = @groupId`, { groupId, groupName, groupDescription, createdBy });
    if (result.error)
        throw new Error(result.error);
    if (!result.data || result.data.length === 0)
        throw new Error('Failed to create group');
    return result.data[0];
}
/**
 * Update access group
 */
export async function updateGroup(groupId, groupName, groupDescription) {
    const result = await executeQuery(`UPDATE admin.Access_Group SET Group_Name = @groupName, Group_Description = @groupDescription WHERE Group_ID = @groupId;
     SELECT Group_ID, Group_Name, Group_Description FROM admin.Access_Group WHERE Group_ID = @groupId`, { groupId, groupName, groupDescription });
    if (result.error)
        throw new Error(result.error);
    if (!result.data || result.data.length === 0)
        throw new Error('Group not found');
    return result.data[0];
}
/**
 * Delete access group (cascades to Group_Node_Access and User_Group)
 */
export async function deleteGroup(groupId) {
    const result = await executeQuery(`DELETE FROM admin.Access_Group WHERE Group_ID = @groupId`, { groupId });
    if (result.error)
        throw new Error(result.error);
}
/**
 * Get group's node access
 */
export async function getGroupNodeAccess(groupId) {
    const result = await executeQuery(`SELECT Group_ID, Node_ID, Department_ID FROM admin.Group_Node_Access WHERE Group_ID = @groupId ORDER BY Node_ID, Department_ID`, { groupId });
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map((r) => ({
        groupId: r.Group_ID,
        nodeId: r.Node_ID,
        departmentId: r.Department_ID,
    }));
}
/**
 * Set group's node access (replaces existing)
 */
export async function setGroupNodeAccess(groupId, nodeAccessList, createdBy) {
    await executeQuery(`DELETE FROM admin.Group_Node_Access WHERE Group_ID = @groupId`, { groupId });
    if (nodeAccessList.length === 0)
        return;
    const insertParts = [];
    const params = { groupId, createdBy };
    let i = 0;
    for (const na of nodeAccessList) {
        for (const deptId of na.departmentIds) {
            insertParts.push(`(@groupId, @nodeId${i}, @deptId${i}, @createdBy)`);
            params[`nodeId${i}`] = na.nodeId;
            params[`deptId${i}`] = deptId;
            i++;
        }
    }
    if (insertParts.length > 0) {
        const sql = `INSERT INTO admin.Group_Node_Access (Group_ID, Node_ID, Department_ID, Created_By) VALUES ${insertParts.join(', ')}`;
        const result = await executeQuery(sql, params);
        if (result.error)
            throw new Error(result.error);
    }
}
/**
 * Get groups assigned to a user
 */
export async function getUserGroups(email) {
    const result = await executeQuery(`SELECT Group_ID FROM admin.User_Group WHERE User_ID = @email ORDER BY Group_ID`, { email });
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map((r) => r.Group_ID);
}
/**
 * Get group's page access (sidebar item IDs: dashboard, admin:*, etc.)
 */
export async function getGroupPageAccess(groupId) {
    const result = await executeQuery(`SELECT Item_ID FROM admin.Group_Page_Access WHERE Group_ID = @groupId ORDER BY Item_ID`, { groupId });
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map((r) => r.Item_ID);
}
/**
 * Set group's page access (replaces existing)
 * itemIds: list of sidebar item IDs (dashboard, admin:nodes, etc. - NOT report:uuid)
 */
export async function setGroupPageAccess(groupId, itemIds, createdBy) {
    const group = await getGroupById(groupId);
    if (!group)
        throw new Error('Group not found');
    await executeQuery(`DELETE FROM admin.Group_Page_Access WHERE Group_ID = @groupId`, { groupId });
    if (itemIds.length === 0)
        return;
    const insertParts = [];
    const params = { groupId, createdBy };
    itemIds.forEach((itemId, i) => {
        insertParts.push(`(@groupId, @itemId${i}, @createdBy)`);
        params[`itemId${i}`] = itemId;
    });
    const sql = `INSERT INTO admin.Group_Page_Access (Group_ID, Item_ID, Created_By) VALUES ${insertParts.join(', ')}`;
    const result = await executeQuery(sql, params);
    if (result.error)
        throw new Error(result.error);
}
/**
 * Set groups for a user (replaces existing)
 */
export async function setUserGroups(email, groupIds, createdBy) {
    const userResult = await executeQuery(`SELECT User_ID FROM admin.[User] WHERE User_ID = @email`, { email });
    if (userResult.error || !userResult.data || userResult.data.length === 0) {
        throw new Error('User not found');
    }
    await executeQuery(`DELETE FROM admin.User_Group WHERE User_ID = @email`, { email });
    if (groupIds.length === 0)
        return;
    const insertParts = groupIds.map((_, i) => `(@email, @groupId${i}, @createdBy)`);
    const params = { email, createdBy };
    groupIds.forEach((gid, i) => {
        params[`groupId${i}`] = gid;
    });
    const sql = `INSERT INTO admin.User_Group (User_ID, Group_ID, Created_By) VALUES ${insertParts.join(', ')}`;
    const result = await executeQuery(sql, params);
    if (result.error)
        throw new Error(result.error);
}
//# sourceMappingURL=GroupService.js.map