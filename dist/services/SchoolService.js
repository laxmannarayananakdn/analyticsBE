/**
 * School Assignment Service
 */
import { executeQuery } from '../config/database.js';
/**
 * Get schools assigned to a node
 */
export async function getSchoolsByNode(nodeId) {
    const result = await executeQuery(`SELECT * FROM admin.Node_School WHERE Node_ID = @nodeId ORDER BY School_ID, School_Source`, { nodeId });
    if (result.error) {
        throw new Error(result.error);
    }
    return result.data || [];
}
/**
 * Assign school to node
 */
export async function assignSchoolToNode(nodeId, assignRequest) {
    const { schoolId, schoolSource, createdBy } = assignRequest;
    // Check if school is already assigned to another node
    const existing = await executeQuery(`SELECT * FROM admin.Node_School WHERE School_ID = @schoolId AND School_Source = @schoolSource`, { schoolId, schoolSource });
    if (existing.data && existing.data.length > 0) {
        const existingAssignment = existing.data[0];
        if (existingAssignment.Node_ID !== nodeId) {
            throw new Error(`School is already assigned to node ${existingAssignment.Node_ID}`);
        }
        // Already assigned to this node, return existing
        return existingAssignment;
    }
    // Verify node exists
    const nodeResult = await executeQuery(`SELECT Node_ID FROM admin.Node WHERE Node_ID = @nodeId`, { nodeId });
    if (nodeResult.error || !nodeResult.data || nodeResult.data.length === 0) {
        throw new Error('Node not found');
    }
    // Verify school exists in the appropriate schema
    // MB.schools has only: id (BIGINT). NEX.schools has: id, sourced_id, identifier.
    const schoolResult = schoolSource === 'mb'
        ? await executeQuery(`SELECT TOP 1 id FROM MB.schools WHERE CAST(id AS VARCHAR(50)) = @schoolId`, { schoolId })
        : await executeQuery(`SELECT TOP 1 id FROM NEX.schools WHERE id = @schoolId OR sourced_id = @schoolId OR identifier = @schoolId`, { schoolId });
    if (schoolResult.error || !schoolResult.data || schoolResult.data.length === 0) {
        throw new Error(`School not found in ${schoolSource} schema`);
    }
    // Insert assignment
    const result = await executeQuery(`INSERT INTO admin.Node_School (School_ID, Node_ID, School_Source, Created_By)
     VALUES (@schoolId, @nodeId, @schoolSource, @createdBy);
     SELECT * FROM admin.Node_School WHERE School_ID = @schoolId AND School_Source = @schoolSource`, { schoolId, nodeId, schoolSource, createdBy });
    if (result.error || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'Failed to assign school to node');
    }
    return result.data[0];
}
/**
 * Unassign school from node
 */
export async function unassignSchoolFromNode(nodeId, schoolId, schoolSource) {
    const result = await executeQuery(`DELETE FROM admin.Node_School 
     WHERE Node_ID = @nodeId AND School_ID = @schoolId AND School_Source = @schoolSource`, { nodeId, schoolId, schoolSource });
    if (result.error) {
        throw new Error(result.error);
    }
}
/**
 * Get node assignment for a school
 */
export async function getNodeForSchool(schoolId, schoolSource) {
    const result = await executeQuery(`SELECT * FROM admin.Node_School 
     WHERE School_ID = @schoolId AND School_Source = @schoolSource`, { schoolId, schoolSource });
    if (result.error || !result.data || result.data.length === 0) {
        return null;
    }
    return result.data[0];
}
//# sourceMappingURL=SchoolService.js.map