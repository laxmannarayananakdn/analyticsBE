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