/**
 * User Access Management Service
 */

import { executeQuery } from '../config/database.js';
import { UserNodeAccess, SchoolAccess, UserSchoolAccess, GrantAccessRequest } from '../types/auth.js';

/**
 * Get user's node access assignments
 */
export async function getUserAccess(email: string): Promise<UserNodeAccess[]> {
  const result = await executeQuery<UserNodeAccess>(
    `SELECT una.*, d.Department_Name, n.Node_Description
     FROM admin.User_Node_Access una
     INNER JOIN admin.Department d ON una.Department_ID = d.Department_ID
     INNER JOIN admin.Node n ON una.Node_ID = n.Node_ID
     WHERE una.User_ID = @email
     ORDER BY una.Node_ID, una.Department_ID`,
    { email }
  );
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result.data || [];
}

/**
 * Get user's school access (using database function)
 */
export async function getUserSchoolAccess(email: string): Promise<UserSchoolAccess[]> {
  const result = await executeQuery<SchoolAccess>(
    `SELECT * FROM admin.fn_GetUserSchoolAccess(@email)`,
    { email }
  );
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  // Group by school and aggregate departments
  const schoolMap = new Map<string, UserSchoolAccess>();
  
  (result.data || []).forEach(access => {
    const key = `${access.School_ID}_${access.School_Source}`;
    if (!schoolMap.has(key)) {
      schoolMap.set(key, {
        schoolId: access.School_ID,
        schoolSource: access.School_Source,
        departments: [],
      });
    }
    schoolMap.get(key)!.departments.push(access.Department_ID);
  });
  
  return Array.from(schoolMap.values());
}

/**
 * Get user's distinct departments
 */
export async function getUserDepartments(email: string): Promise<string[]> {
  const result = await executeQuery<{ Department_ID: string }>(
    `SELECT DISTINCT Department_ID FROM admin.fn_GetUserSchoolAccess(@email)`,
    { email }
  );
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return (result.data || []).map(d => d.Department_ID);
}

/**
 * Grant user access to node with departments
 */
export async function grantAccess(
  email: string,
  grantRequest: GrantAccessRequest,
  createdBy: string
): Promise<UserNodeAccess[]> {
  const { nodeId, departmentIds } = grantRequest;
  
  // Verify user exists
  const userResult = await executeQuery(
    `SELECT User_ID FROM admin.[User] WHERE User_ID = @email`,
    { email }
  );
  
  if (userResult.error || !userResult.data || userResult.data.length === 0) {
    throw new Error('User not found');
  }
  
  // Verify node exists
  const nodeResult = await executeQuery(
    `SELECT Node_ID FROM admin.Node WHERE Node_ID = @nodeId`,
    { nodeId }
  );
  
  if (nodeResult.error || !nodeResult.data || nodeResult.data.length === 0) {
    throw new Error('Node not found');
  }
  
  // Verify all departments exist
  const deptPlaceholders = departmentIds.map((_, i) => `@dept${i}`).join(',');
  const deptParams: Record<string, any> = {};
  departmentIds.forEach((deptId, i) => {
    deptParams[`dept${i}`] = deptId;
  });
  
  const deptResult = await executeQuery(
    `SELECT Department_ID FROM admin.Department 
     WHERE Department_ID IN (${deptPlaceholders})`,
    deptParams
  );
  
  if (deptResult.error || !deptResult.data || deptResult.data.length !== departmentIds.length) {
    throw new Error('One or more departments not found');
  }
  
  // Insert access records (ignore duplicates)
  const insertValues = departmentIds.map((deptId, i) => 
    `(@email, @nodeId, @dept${i}, @createdBy)`
  ).join(',');
  
  const insertParams: Record<string, any> = { email, nodeId, createdBy };
  departmentIds.forEach((deptId, i) => {
    insertParams[`dept${i}`] = deptId;
  });
  
  await executeQuery(
    `INSERT INTO admin.User_Node_Access (User_ID, Node_ID, Department_ID, Created_By)
     VALUES ${insertValues}`,
    insertParams
  );
  
  // Return updated access list
  return getUserAccess(email);
}

/**
 * Update user's department access for a node (replaces existing)
 */
export async function updateAccess(
  email: string,
  nodeId: string,
  updateRequest: { departmentIds: string[] },
  createdBy: string
): Promise<UserNodeAccess[]> {
  // Delete existing access for this node
  await executeQuery(
    `DELETE FROM admin.User_Node_Access 
     WHERE User_ID = @email AND Node_ID = @nodeId`,
    { email, nodeId }
  );
  
  // Grant new access
  if (updateRequest.departmentIds.length > 0) {
    await grantAccess(email, { nodeId, departmentIds: updateRequest.departmentIds }, createdBy);
  }
  
  return getUserAccess(email);
}

/**
 * Revoke all user access to a node
 */
export async function revokeNodeAccess(email: string, nodeId: string): Promise<void> {
  const result = await executeQuery(
    `DELETE FROM admin.User_Node_Access 
     WHERE User_ID = @email AND Node_ID = @nodeId`,
    { email, nodeId }
  );
  
  if (result.error) {
    throw new Error(result.error);
  }
}

/**
 * Revoke specific department access for a node
 */
export async function revokeDepartmentAccess(
  email: string,
  nodeId: string,
  departmentId: string
): Promise<void> {
  const result = await executeQuery(
    `DELETE FROM admin.User_Node_Access 
     WHERE User_ID = @email AND Node_ID = @nodeId AND Department_ID = @departmentId`,
    { email, nodeId, departmentId }
  );
  
  if (result.error) {
    throw new Error(result.error);
  }
}
