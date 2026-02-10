/**
 * Department Management Service
 */
import { Department, CreateDepartmentRequest, UpdateDepartmentRequest } from '../types/auth';
/**
 * Get all departments (ordered by Display_Order)
 */
export declare function getAllDepartments(): Promise<Department[]>;
/**
 * Get department by ID
 */
export declare function getDepartmentById(departmentId: string): Promise<Department | null>;
/**
 * Create department
 */
export declare function createDepartment(createRequest: CreateDepartmentRequest): Promise<Department>;
/**
 * Update department
 */
export declare function updateDepartment(departmentId: string, updateRequest: UpdateDepartmentRequest): Promise<Department>;
//# sourceMappingURL=DepartmentService.d.ts.map