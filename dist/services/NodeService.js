/**
 * Node Management Service
 */
import { executeQuery } from '../config/database';
/**
 * Get all nodes as flat list
 */
export async function getAllNodes() {
    const result = await executeQuery(`SELECT * FROM admin.Node ORDER BY Node_ID`);
    if (result.error) {
        throw new Error(result.error);
    }
    return (result.data || []).map(transformNode);
}
/**
 * Get node by ID (returns NodeTree format)
 */
export async function getNodeById(nodeId) {
    const result = await executeQuery(`SELECT * FROM admin.Node WHERE Node_ID = @nodeId`, { nodeId });
    if (result.error || !result.data || result.data.length === 0) {
        return null;
    }
    return transformNode(result.data[0]);
}
/**
 * Transform database node to API format
 */
function isTruthy(v) {
    return v === true || v === 1;
}
function transformNodeToTree(node) {
    return {
        nodeId: node.Node_ID,
        nodeDescription: node.Node_Description,
        isHeadOffice: isTruthy(node.Is_Head_Office),
        isSchoolNode: isTruthy(node.Is_School_Node),
        parentNodeId: node.Parent_Node_ID,
        children: [],
    };
}
/**
 * Transform database node to API format (flat)
 */
function transformNode(node) {
    return {
        nodeId: node.Node_ID,
        nodeDescription: node.Node_Description,
        isHeadOffice: isTruthy(node.Is_Head_Office),
        isSchoolNode: isTruthy(node.Is_School_Node),
        parentNodeId: node.Parent_Node_ID,
    };
}
/**
 * Get nodes as tree structure
 */
export async function getNodesTree() {
    const result = await executeQuery(`SELECT * FROM admin.Node ORDER BY Node_ID`);
    if (result.error) {
        throw new Error(result.error);
    }
    const nodes = result.data || [];
    // Build tree structure with transformed nodes
    const nodeMap = new Map();
    const rootNodes = [];
    // Create map of all nodes (transformed)
    nodes.forEach(node => {
        nodeMap.set(node.Node_ID, transformNodeToTree(node));
    });
    // Build tree
    nodes.forEach(node => {
        const treeNode = nodeMap.get(node.Node_ID);
        if (node.Parent_Node_ID) {
            const parent = nodeMap.get(node.Parent_Node_ID);
            if (parent) {
                parent.children = parent.children || [];
                parent.children.push(treeNode);
            }
            else {
                // Parent not found, treat as root
                rootNodes.push(treeNode);
            }
        }
        else {
            rootNodes.push(treeNode);
        }
    });
    return rootNodes;
}
/**
 * Create node
 */
export async function createNode(createRequest) {
    const { nodeId, nodeDescription, isHeadOffice, isSchoolNode, parentNodeId, createdBy } = createRequest;
    // Check if node already exists
    const existing = await getNodeById(nodeId);
    if (existing) {
        throw new Error('Node with this ID already exists');
    }
    // Check if another node is already Head Office
    if (isHeadOffice) {
        const headOfficeCheck = await executeQuery(`SELECT Node_ID FROM admin.Node WHERE Is_Head_Office = 1`);
        if (headOfficeCheck.data && headOfficeCheck.data.length > 0) {
            throw new Error(`Another node (${headOfficeCheck.data[0].Node_ID}) is already set as Head Office. Only one Head Office is allowed.`);
        }
    }
    // Validate parent node exists if provided
    if (parentNodeId) {
        const parent = await getNodeById(parentNodeId);
        if (!parent) {
            throw new Error('Parent node not found');
        }
    }
    const result = await executeQuery(`INSERT INTO admin.Node 
     (Node_ID, Node_Description, Is_Head_Office, Is_School_Node, Parent_Node_ID, Created_By)
     VALUES (@nodeId, @nodeDescription, @isHeadOffice, @isSchoolNode, @parentNodeId, @createdBy);
     SELECT * FROM admin.Node WHERE Node_ID = @nodeId`, {
        nodeId,
        nodeDescription,
        isHeadOffice: isHeadOffice ? 1 : 0,
        isSchoolNode: isSchoolNode ? 1 : 0,
        parentNodeId: parentNodeId || null,
        createdBy,
    });
    if (result.error || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'Failed to create node');
    }
    return transformNode(result.data[0]);
}
/**
 * Update node
 */
export async function updateNode(nodeId, updateRequest) {
    const updates = [];
    const params = { nodeId };
    if (updateRequest.nodeDescription !== undefined) {
        updates.push('Node_Description = @nodeDescription');
        params.nodeDescription = updateRequest.nodeDescription;
    }
    if (updateRequest.isHeadOffice !== undefined) {
        // Check if another node is already Head Office (if setting to true)
        if (updateRequest.isHeadOffice) {
            const headOfficeCheck = await executeQuery(`SELECT Node_ID FROM admin.Node WHERE Is_Head_Office = 1 AND Node_ID != @nodeId`, { nodeId });
            if (headOfficeCheck.data && headOfficeCheck.data.length > 0) {
                throw new Error(`Another node (${headOfficeCheck.data[0].Node_ID}) is already set as Head Office. Only one Head Office is allowed.`);
            }
        }
        updates.push('Is_Head_Office = @isHeadOffice');
        params.isHeadOffice = updateRequest.isHeadOffice ? 1 : 0;
    }
    if (updateRequest.isSchoolNode !== undefined) {
        updates.push('Is_School_Node = @isSchoolNode');
        params.isSchoolNode = updateRequest.isSchoolNode ? 1 : 0;
    }
    if (updateRequest.parentNodeId !== undefined) {
        // Validate parent node exists if provided
        if (updateRequest.parentNodeId) {
            const parent = await getNodeById(updateRequest.parentNodeId);
            if (!parent) {
                throw new Error('Parent node not found');
            }
            // Prevent circular reference
            if (updateRequest.parentNodeId === nodeId) {
                throw new Error('Node cannot be its own parent');
            }
            // Check if this would create a circular reference
            const descendants = await getNodeDescendants(updateRequest.parentNodeId);
            if (descendants.includes(nodeId)) {
                throw new Error('Cannot set parent: would create circular reference');
            }
        }
        updates.push('Parent_Node_ID = @parentNodeId');
        params.parentNodeId = updateRequest.parentNodeId || null;
    }
    if (updates.length === 0) {
        const nodeResult = await executeQuery(`SELECT * FROM admin.Node WHERE Node_ID = @nodeId`, { nodeId });
        if (nodeResult.error || !nodeResult.data || nodeResult.data.length === 0) {
            throw new Error('Node not found');
        }
        return transformNode(nodeResult.data[0]);
    }
    // Modified_Date is updated by trigger
    const result = await executeQuery(`UPDATE admin.Node 
     SET ${updates.join(', ')}
     WHERE Node_ID = @nodeId;
     SELECT * FROM admin.Node WHERE Node_ID = @nodeId`, params);
    if (result.error || !result.data || result.data.length === 0) {
        throw new Error(result.error || 'Failed to update node');
    }
    return transformNode(result.data[0]);
}
/**
 * Get all descendant node IDs for a given node (helper for circular reference check)
 */
async function getNodeDescendants(nodeId) {
    const result = await executeQuery(`WITH NodeTree AS (
      SELECT Node_ID FROM admin.Node WHERE Node_ID = @nodeId
      UNION ALL
      SELECT n.Node_ID 
      FROM admin.Node n
      INNER JOIN NodeTree nt ON n.Parent_Node_ID = nt.Node_ID
    )
    SELECT Node_ID FROM NodeTree WHERE Node_ID != @nodeId`, { nodeId });
    if (result.error) {
        return [];
    }
    return (result.data || []).map(n => n.Node_ID);
}
//# sourceMappingURL=NodeService.js.map