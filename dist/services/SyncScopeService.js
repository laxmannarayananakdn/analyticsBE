/**
 * Sync Scope Service
 * Resolves which school configs (ManageBac and Nexquare) to sync based on node(s), with optional descendant inclusion.
 * Used by SyncOrchestratorService to determine the scope of a sync run.
 */
import { executeQuery } from '../config/database.js';
/**
 * Get school configs for the given scope.
 * - If `configIdsMb` / `configIdsNex`: return only those configs (overrides node/all for that source).
 * - If `all`: return all active MB and NEX configs.
 * - If `nodeIds`: return configs whose schools are in Node_School for those nodes (and optionally descendants).
 * - Configs must have school_id populated and match Node_School.School_ID for the given source.
 */
export async function getConfigsForScope(params) {
    let mb;
    let nex;
    if (params.configIdsMb?.length || params.configIdsNex?.length) {
        const [mbRes, nexRes] = await Promise.all([
            params.configIdsMb?.length
                ? getConfigsByIds('mb', params.configIdsMb)
                : Promise.resolve([]),
            params.configIdsNex?.length
                ? getConfigsByIds('nex', params.configIdsNex)
                : Promise.resolve([]),
        ]);
        mb = mbRes;
        nex = nexRes;
        return { mb, nex };
    }
    if (params.all) {
        const all = await getAllActiveConfigs();
        mb = all.mb;
        nex = all.nex;
    }
    else {
        const nodeIds = params.nodeIds;
        if (!nodeIds || nodeIds.length === 0) {
            return { mb: [], nex: [] };
        }
        const effectiveNodeIds = params.includeDescendants
            ? await expandNodesWithDescendants(nodeIds)
            : nodeIds;
        const nodeResult = await getConfigsForNodes(effectiveNodeIds);
        mb = nodeResult.mb;
        nex = nodeResult.nex;
    }
    return { mb, nex };
}
/**
 * Get configs by explicit ID list (for CLI --mb-config-ids / --nex-config-ids).
 */
async function getConfigsByIds(source, ids) {
    if (ids.length === 0)
        return [];
    const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
    const params = {};
    ids.forEach((id, i) => {
        params[`id${i}`] = id;
    });
    if (source === 'mb') {
        const result = await executeQuery(`SELECT id, api_token, base_url, school_name, school_id
       FROM MB.managebac_school_configs
       WHERE id IN (${placeholders}) AND is_active = 1
       ORDER BY school_name`, params);
        return result.error ? [] : (result.data || []);
    }
    const result = await executeQuery(`SELECT id, client_id, client_secret, domain_url, school_name, school_id
     FROM NEX.nexquare_school_configs
     WHERE id IN (${placeholders}) AND is_active = 1
     ORDER BY school_name`, params);
    return result.error ? [] : (result.data || []);
}
/**
 * Get all active ManageBac and Nexquare configs.
 */
async function getAllActiveConfigs() {
    const [mbResult, nexResult] = await Promise.all([
        executeQuery(`SELECT id, api_token, base_url, school_name, school_id
       FROM MB.managebac_school_configs
       WHERE is_active = 1
       ORDER BY country, school_name`),
        executeQuery(`SELECT id, client_id, client_secret, domain_url, school_name, school_id
       FROM NEX.nexquare_school_configs
       WHERE is_active = 1
       ORDER BY country, school_name`),
    ]);
    return {
        mb: mbResult.error ? [] : (mbResult.data || []),
        nex: nexResult.error ? [] : (nexResult.data || []),
    };
}
/**
 * Expand node IDs to include all descendants (children, grandchildren, etc.)
 */
async function expandNodesWithDescendants(nodeIds) {
    if (nodeIds.length === 0)
        return [];
    const placeholders = nodeIds.map((_, i) => `@n${i}`).join(', ');
    const params = {};
    nodeIds.forEach((id, i) => {
        params[`n${i}`] = id;
    });
    const query = `
    WITH NodeTree AS (
      SELECT Node_ID FROM admin.Node WHERE Node_ID IN (${placeholders})
      UNION ALL
      SELECT n.Node_ID
      FROM admin.Node n
      INNER JOIN NodeTree nt ON n.Parent_Node_ID = nt.Node_ID
    )
    SELECT DISTINCT Node_ID FROM NodeTree
  `;
    const result = await executeQuery(query, params);
    if (result.error || !result.data) {
        return nodeIds;
    }
    return result.data.map((r) => r.Node_ID);
}
/**
 * Get MB and NEX configs for schools in Node_School for the given nodes.
 * Joins on school_id (cast for MB) and School_Source.
 */
async function getConfigsForNodes(nodeIds) {
    if (nodeIds.length === 0)
        return { mb: [], nex: [] };
    const placeholders = nodeIds.map((_, i) => `@n${i}`).join(', ');
    const params = {};
    nodeIds.forEach((id, i) => {
        params[`n${i}`] = id;
    });
    const nodeClause = `ns.Node_ID IN (${placeholders})`;
    const mbQuery = `
    SELECT mb.id, mb.api_token, mb.base_url, mb.school_name, mb.school_id
    FROM MB.managebac_school_configs mb
    INNER JOIN admin.Node_School ns
      ON ns.School_Source = 'mb'
      AND ns.School_ID = CAST(mb.school_id AS NVARCHAR(50))
    WHERE mb.is_active = 1
      AND mb.school_id IS NOT NULL
      AND mb.school_id != 0
      AND ${nodeClause}
    ORDER BY mb.country, mb.school_name
  `;
    const nexQuery = `
    SELECT nsc.id, nsc.client_id, nsc.client_secret, nsc.domain_url, nsc.school_name, nsc.school_id
    FROM NEX.nexquare_school_configs nsc
    INNER JOIN admin.Node_School ns
      ON ns.School_Source = 'nex'
      AND ns.School_ID = nsc.school_id
    WHERE nsc.is_active = 1
      AND nsc.school_id IS NOT NULL
      AND LTRIM(RTRIM(CAST(nsc.school_id AS NVARCHAR(255)))) != ''
      AND ${nodeClause}
    ORDER BY nsc.country, nsc.school_name
  `;
    const [mbResult, nexResult] = await Promise.all([
        executeQuery(mbQuery, params),
        executeQuery(nexQuery, params),
    ]);
    return {
        mb: mbResult.error ? [] : (mbResult.data || []),
        nex: nexResult.error ? [] : (nexResult.data || []),
    };
}
//# sourceMappingURL=SyncScopeService.js.map