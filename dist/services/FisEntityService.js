/**
 * FIS Entity master data (admin.fis_entity)
 */
import { executeQuery } from '../config/database.js';
function transform(row) {
    return {
        entityCode: row.entity_code,
        entityName: row.entity_name,
        status: row.status,
        createdAt: row.created_at?.toISOString(),
        updatedAt: row.updated_at?.toISOString(),
    };
}
export async function getAllFisEntities(activeOnly = false) {
    const where = activeOnly ? `WHERE status = 'active'` : '';
    const result = await executeQuery(`SELECT entity_code, entity_name, status, created_at, updated_at
     FROM admin.fis_entity
     ${where}
     ORDER BY entity_code`);
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map(transform);
}
export async function getFisEntityByCode(entityCode) {
    const result = await executeQuery(`SELECT entity_code, entity_name, status, created_at, updated_at
     FROM admin.fis_entity WHERE entity_code = @entityCode`, { entityCode });
    if (result.error)
        throw new Error(result.error);
    if (!result.data?.length)
        return null;
    return transform(result.data[0]);
}
export async function createFisEntity(req) {
    const code = req.entityCode.trim().toUpperCase();
    const name = req.entityName.trim();
    const status = req.status || 'active';
    if (!code || !name)
        throw new Error('entityCode and entityName are required');
    const existing = await getFisEntityByCode(code);
    if (existing)
        throw new Error('Entity code already exists');
    const result = await executeQuery(`INSERT INTO admin.fis_entity (entity_code, entity_name, status, created_by)
     VALUES (@entityCode, @entityName, @status, @createdBy);
     SELECT entity_code, entity_name, status, created_at, updated_at
     FROM admin.fis_entity WHERE entity_code = @entityCode`, { entityCode: code, entityName: name, status, createdBy: req.createdBy || null });
    if (result.error || !result.data?.length) {
        throw new Error(result.error || 'Failed to create entity');
    }
    return transform(result.data[0]);
}
export async function updateFisEntity(entityCode, req) {
    const updates = [];
    const params = { entityCode };
    if (req.entityName !== undefined) {
        updates.push('entity_name = @entityName');
        params.entityName = req.entityName.trim();
    }
    if (req.status !== undefined) {
        updates.push('status = @status');
        params.status = req.status;
    }
    if (req.updatedBy !== undefined) {
        updates.push('updated_by = @updatedBy');
        params.updatedBy = req.updatedBy;
    }
    if (updates.length === 0) {
        const row = await getFisEntityByCode(entityCode);
        if (!row)
            throw new Error('Entity not found');
        return row;
    }
    const result = await executeQuery(`UPDATE admin.fis_entity SET ${updates.join(', ')} WHERE entity_code = @entityCode;
     SELECT entity_code, entity_name, status, created_at, updated_at
     FROM admin.fis_entity WHERE entity_code = @entityCode`, params);
    if (result.error || !result.data?.length) {
        throw new Error(result.error || 'Entity not found');
    }
    return transform(result.data[0]);
}
//# sourceMappingURL=FisEntityService.js.map