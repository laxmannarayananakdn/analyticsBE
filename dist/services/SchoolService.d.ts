/**
 * School Assignment Service
 */
import { NodeSchool, AssignSchoolRequest } from '../types/auth.js';
/**
 * Get all node–school assignments (for admin UI lookups).
 */
export declare function getAllSchoolAssignments(): Promise<Array<{
    nodeId: string;
    schoolId: string;
    schoolSource: string;
}>>;
/**
 * Get schools assigned to a node
 */
export declare function getSchoolsByNode(nodeId: string): Promise<NodeSchool[]>;
/**
 * Assign school to node
 */
export declare function assignSchoolToNode(nodeId: string, assignRequest: AssignSchoolRequest): Promise<NodeSchool>;
/**
 * Unassign school from node
 */
export declare function unassignSchoolFromNode(nodeId: string, schoolId: string, schoolSource: 'nex' | 'mb'): Promise<void>;
/**
 * Get node assignment for a school
 */
export declare function getNodeForSchool(schoolId: string, schoolSource: 'nex' | 'mb'): Promise<NodeSchool | null>;
//# sourceMappingURL=SchoolService.d.ts.map