/**
 * Node Management Service
 */
import { CreateNodeRequest, UpdateNodeRequest, NodeTree } from '../types/auth.js';
/**
 * Get all nodes as flat list
 */
export declare function getAllNodes(): Promise<NodeTree[]>;
/**
 * Get node by ID (returns NodeTree format)
 */
export declare function getNodeById(nodeId: string): Promise<NodeTree | null>;
/**
 * Get Head Office node ID (for global report scope).
 * Uses Is_Head_Office = 1 first, else topmost node (Parent_Node_ID IS NULL).
 */
export declare function getHeadOfficeNodeId(): Promise<string | null>;
/**
 * Get nodes as tree structure
 */
export declare function getNodesTree(): Promise<NodeTree[]>;
/**
 * Create node
 */
export declare function createNode(createRequest: CreateNodeRequest): Promise<NodeTree>;
/**
 * Update node
 */
export declare function updateNode(nodeId: string, updateRequest: UpdateNodeRequest): Promise<NodeTree>;
//# sourceMappingURL=NodeService.d.ts.map