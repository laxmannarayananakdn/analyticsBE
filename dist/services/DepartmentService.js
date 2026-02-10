/**
 * Department Management Service
 */
import { executeQuery } from '../config/database.js';
/**
 * Get all departments (ordered by Display_Order)
 */
export async function getAllDepartments() {
    const result = await executeQuery(`SELECT * FROM admin.Department ORDER BY Display_Order, Department_Name`);
    if (result.error) {
        throw new Error(result.error);
    }
    return result.data || [];
}
/**
 * Get department by ID
 */
export async function getDepartmentById(departmentId) {
    const result = await executeQuery(`SELECT * FROM admin.Department WHERE Department_ID = @departmentId`, { departmentId });
    if (result.error || !result.data || result.data.length === 0) {
        return null;
    }
    return result.data[0];
}
/**
 * Create department
 */
export async function createDepartment(createRequest) {
    const { departmentId, departmentName, departmentDescription, schemaName, displayOrder, createdBy } = createRequest;
    // Check if department already exists
    const existing = await getDepartmentById(departmentId);
    if (existing) {
        throw new Error('Department with this ID already exists');
    }
    const result = await executeQuery(`INSERT INTO admin.Department 
     (Department_ID, Department_Name, Department_Description, Schema_Name, Display_Order, Created_By)
     VALUES (@departmentId, @departmentName, @departmentDescription, @schemaName, @displayOrder, @createdBy);
     SELECT * FROM admin.Department WHERE Department_ID = @departmentId`, {
        departmentId,
        departmentName,
        departmentDescription: departmentDescription || null,
        schemaName: schemaName || null,
        displayOrder: displayOrder || null,
        createdBy,
    });
    if (result.error || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'Failed to create department');
    }
    return result.data[0];
}
/**
 * Update department
 */
export async function updateDepartment(departmentId, updateRequest) {
    const updates = [];
    const params = { departmentId };
    if (updateRequest.departmentName !== undefined) {
        updates.push('Department_Name = @departmentName');
        params.departmentName = updateRequest.departmentName;
    }
    if (updateRequest.departmentDescription !== undefined) {
        updates.push('Department_Description = @departmentDescription');
        params.departmentDescription = updateRequest.departmentDescription || null;
    }
    if (updateRequest.schemaName !== undefined) {
        updates.push('Schema_Name = @schemaName');
        params.schemaName = updateRequest.schemaName || null;
    }
    if (updateRequest.displayOrder !== undefined) {
        updates.push('Display_Order = @displayOrder');
        params.displayOrder = updateRequest.displayOrder || null;
    }
    if (updates.length === 0) {
        const dept = await getDepartmentById(departmentId);
        if (!dept) {
            throw new Error('Department not found');
        }
        return dept;
    }
    // Modified_Date is updated by trigger
    const result = await executeQuery(`UPDATE admin.Department 
     SET ${updates.join(', ')}
     WHERE Department_ID = @departmentId;
     SELECT * FROM admin.Department WHERE Department_ID = @departmentId`, params);
    if (result.error || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'Failed to update department');
    }
    return result.data[0];
}
//# sourceMappingURL=DepartmentService.js.map