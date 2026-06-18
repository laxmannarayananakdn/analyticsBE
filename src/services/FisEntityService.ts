/**
 * FIS Entity master data (admin.fis_entity)
 */

import { executeQuery } from '../config/database.js';
import { setEntityCountry } from './FisCountryService.js';

export interface FisEntity {
  entityCode: string;
  entityName: string;
  status: 'active' | 'inactive';
  countryCode?: string | null;
  countryName?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateFisEntityRequest {
  entityCode: string;
  entityName: string;
  status?: 'active' | 'inactive';
  countryCode?: string | null;
  createdBy?: string;
}

export interface UpdateFisEntityRequest {
  entityName?: string;
  status?: 'active' | 'inactive';
  countryCode?: string | null;
  updatedBy?: string;
}

type DbRow = {
  entity_code: string;
  entity_name: string;
  status: string;
  country_code?: string | null;
  country_name?: string | null;
  created_at?: Date;
  updated_at?: Date;
};

function transform(row: DbRow): FisEntity {
  return {
    entityCode: row.entity_code,
    entityName: row.entity_name,
    status: row.status as 'active' | 'inactive',
    countryCode: row.country_code ?? null,
    countryName: row.country_name ?? null,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

const ENTITY_SELECT = `
  SELECT e.entity_code, e.entity_name, e.status,
         fce.country_code, fc.country_name,
         e.created_at, e.updated_at
  FROM admin.fis_entity e
  LEFT JOIN admin.fis_country_entity fce ON fce.entity_code = e.entity_code
  LEFT JOIN admin.fis_country fc ON fc.country_code = fce.country_code`;

export async function getAllFisEntities(activeOnly = false): Promise<FisEntity[]> {
  const where = activeOnly ? `WHERE e.status = 'active'` : '';
  const result = await executeQuery<DbRow>(
    `${ENTITY_SELECT}
     ${where}
     ORDER BY e.entity_code`
  );
  if (result.error) throw new Error(result.error);
  return (result.data || []).map(transform);
}

export async function getFisEntityByCode(entityCode: string): Promise<FisEntity | null> {
  const result = await executeQuery<DbRow>(
    `${ENTITY_SELECT}
     WHERE e.entity_code = @entityCode`,
    { entityCode }
  );
  if (result.error) throw new Error(result.error);
  if (!result.data?.length) return null;
  return transform(result.data[0]);
}

export async function createFisEntity(req: CreateFisEntityRequest): Promise<FisEntity> {
  const code = req.entityCode.trim().toUpperCase();
  const name = req.entityName.trim();
  const status = req.status || 'active';
  if (!code || !name) throw new Error('entityCode and entityName are required');

  const existing = await getFisEntityByCode(code);
  if (existing) throw new Error('Entity code already exists');

  const result = await executeQuery<DbRow>(
    `INSERT INTO admin.fis_entity (entity_code, entity_name, status, created_by)
     VALUES (@entityCode, @entityName, @status, @createdBy);
     ${ENTITY_SELECT}
     WHERE e.entity_code = @entityCode`,
    { entityCode: code, entityName: name, status, createdBy: req.createdBy || null }
  );
  if (result.error || !result.data?.length) {
    throw new Error(result.error || 'Failed to create entity');
  }

  if (req.countryCode !== undefined) {
    await setEntityCountry(code, req.countryCode, req.createdBy);
    const refreshed = await getFisEntityByCode(code);
    if (refreshed) return refreshed;
  }

  return transform(result.data[0]);
}

export async function updateFisEntity(
  entityCode: string,
  req: UpdateFisEntityRequest
): Promise<FisEntity> {
  const updates: string[] = [];
  const params: Record<string, unknown> = { entityCode };

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

  if (updates.length === 0 && req.countryCode === undefined) {
    const row = await getFisEntityByCode(entityCode);
    if (!row) throw new Error('Entity not found');
    return row;
  }

  if (updates.length > 0) {
    const result = await executeQuery<DbRow>(
      `UPDATE admin.fis_entity SET ${updates.join(', ')} WHERE entity_code = @entityCode;
       ${ENTITY_SELECT}
       WHERE e.entity_code = @entityCode`,
      params
    );
    if (result.error || !result.data?.length) {
      throw new Error(result.error || 'Entity not found');
    }
  }

  if (req.countryCode !== undefined) {
    await setEntityCountry(entityCode, req.countryCode, req.updatedBy);
  }

  const row = await getFisEntityByCode(entityCode);
  if (!row) throw new Error('Entity not found');
  return row;
}
