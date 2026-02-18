/**
 * User Access Management Service
 */
import { executeQuery } from '../config/database.js';
/**
 * Get user's effective node access (derived from Access Groups only).
 * Node access is configured in Access Groups; users get access via User Groups assignment.
 */
export async function getUserAccess(email) {
    const result = await executeQuery(`WITH UserGroupNodes AS (
        SELECT DISTINCT gna.Node_ID, gna.Department_ID
        FROM admin.User_Group ug
        INNER JOIN admin.[User] u ON ug.User_ID = u.User_ID
        INNER JOIN admin.Group_Node_Access gna ON ug.Group_ID = gna.Group_ID
        WHERE u.User_ID = @email AND u.Is_Active = 1
    ),
    NodeHierarchy AS (
        SELECT Node_ID AS Ancestor_Node_ID, Node_ID AS Descendant_Node_ID, Department_ID
        FROM UserGroupNodes
        UNION ALL
        SELECT nh.Ancestor_Node_ID, n.Node_ID AS Descendant_Node_ID, nh.Department_ID
        FROM NodeHierarchy nh
        INNER JOIN admin.Node n ON nh.Descendant_Node_ID = n.Parent_Node_ID
    ),
    EffectiveNodes AS (
        SELECT DISTINCT nh.Descendant_Node_ID AS Node_ID, nh.Department_ID
        FROM NodeHierarchy nh
    )
    SELECT en.Node_ID, en.Department_ID, d.Department_Name, n.Node_Description
    FROM EffectiveNodes en
    INNER JOIN admin.Department d ON en.Department_ID = d.Department_ID
    INNER JOIN admin.Node n ON en.Node_ID = n.Node_ID
    ORDER BY en.Node_ID, en.Department_ID`, { email });
    if (result.error) {
        throw new Error(result.error);
    }
    return (result.data || []).map((r) => ({
        User_ID: email,
        Node_ID: r.Node_ID,
        Department_ID: r.Department_ID,
        Created_Date: new Date(),
        Modified_Date: new Date(),
        Created_By: null,
    }));
}
/**
 * Get user's school access (using database function)
 */
export async function getUserSchoolAccess(email) {
    const result = await executeQuery(`SELECT * FROM admin.fn_GetUserSchoolAccess(@email)`, { email });
    if (result.error) {
        throw new Error(result.error);
    }
    // Group by school and aggregate departments
    const schoolMap = new Map();
    (result.data || []).forEach(access => {
        const key = `${access.School_ID}_${access.School_Source}`;
        if (!schoolMap.has(key)) {
            schoolMap.set(key, {
                schoolId: access.School_ID,
                schoolSource: access.School_Source,
                departments: [],
            });
        }
        schoolMap.get(key).departments.push(access.Department_ID);
    });
    return Array.from(schoolMap.values());
}
/**
 * Get user's distinct departments
 */
export async function getUserDepartments(email) {
    const result = await executeQuery(`SELECT DISTINCT Department_ID FROM admin.fn_GetUserSchoolAccess(@email)`, { email });
    if (result.error) {
        throw new Error(result.error);
    }
    return (result.data || []).map(d => d.Department_ID);
}
/**
 * Grant user access to node with departments
 */
export async function grantAccess(email, grantRequest, createdBy) {
    const { nodeId, departmentIds } = grantRequest;
    // Verify user exists
    const userResult = await executeQuery(`SELECT User_ID FROM admin.[User] WHERE User_ID = @email`, { email });
    if (userResult.error || !userResult.data || userResult.data.length === 0) {
        throw new Error('User not found');
    }
    // Verify node exists
    const nodeResult = await executeQuery(`SELECT Node_ID FROM admin.Node WHERE Node_ID = @nodeId`, { nodeId });
    if (nodeResult.error || !nodeResult.data || nodeResult.data.length === 0) {
        throw new Error('Node not found');
    }
    // Verify all departments exist
    const deptPlaceholders = departmentIds.map((_, i) => `@dept${i}`).join(',');
    const deptParams = {};
    departmentIds.forEach((deptId, i) => {
        deptParams[`dept${i}`] = deptId;
    });
    const deptResult = await executeQuery(`SELECT Department_ID FROM admin.Department 
     WHERE Department_ID IN (${deptPlaceholders})`, deptParams);
    if (deptResult.error || !deptResult.data || deptResult.data.length !== departmentIds.length) {
        throw new Error('One or more departments not found');
    }
    // Insert access records (ignore duplicates)
    const insertValues = departmentIds.map((deptId, i) => `(@email, @nodeId, @dept${i}, @createdBy)`).join(',');
    const insertParams = { email, nodeId, createdBy };
    departmentIds.forEach((deptId, i) => {
        insertParams[`dept${i}`] = deptId;
    });
    await executeQuery(`INSERT INTO admin.User_Node_Access (User_ID, Node_ID, Department_ID, Created_By)
     VALUES ${insertValues}`, insertParams);
    // Return updated access list
    return getUserAccess(email);
}
/**
 * Update user's department access for a node (replaces existing)
 */
export async function updateAccess(email, nodeId, updateRequest, createdBy) {
    // Delete existing access for this node
    await executeQuery(`DELETE FROM admin.User_Node_Access 
     WHERE User_ID = @email AND Node_ID = @nodeId`, { email, nodeId });
    // Grant new access
    if (updateRequest.departmentIds.length > 0) {
        await grantAccess(email, { nodeId, departmentIds: updateRequest.departmentIds }, createdBy);
    }
    return getUserAccess(email);
}
/**
 * Revoke all user access to a node
 */
export async function revokeNodeAccess(email, nodeId) {
    const result = await executeQuery(`DELETE FROM admin.User_Node_Access 
     WHERE User_ID = @email AND Node_ID = @nodeId`, { email, nodeId });
    if (result.error) {
        throw new Error(result.error);
    }
}
/**
 * Get node IDs the user has access to (from Access Groups only, including descendant nodes via hierarchy).
 * Used for scope-based report filtering.
 */
export async function getUserAccessibleNodeIds(email) {
    const result = await executeQuery(`WITH UserGroupNodes AS (
        SELECT DISTINCT gna.Node_ID
        FROM admin.User_Group ug
        INNER JOIN admin.[User] u ON ug.User_ID = u.User_ID
        INNER JOIN admin.Group_Node_Access gna ON ug.Group_ID = gna.Group_ID
        WHERE u.User_ID = @email AND u.Is_Active = 1
    ),
    NodeHierarchy AS (
        SELECT Node_ID AS Descendant_Node_ID FROM UserGroupNodes
        UNION ALL
        SELECT n.Node_ID AS Descendant_Node_ID
        FROM NodeHierarchy nh
        INNER JOIN admin.Node n ON nh.Descendant_Node_ID = n.Parent_Node_ID
    )
    SELECT DISTINCT Descendant_Node_ID AS Node_ID FROM NodeHierarchy`, { email });
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map((r) => r.Node_ID);
}
/**
 * Revoke specific department access for a node
 */
export async function revokeDepartmentAccess(email, nodeId, departmentId) {
    const result = await executeQuery(`DELETE FROM admin.User_Node_Access 
     WHERE User_ID = @email AND Node_ID = @nodeId AND Department_ID = @departmentId`, { email, nodeId, departmentId });
    if (result.error) {
        throw new Error(result.error);
    }
}
//# sourceMappingURL=AccessService.js.map