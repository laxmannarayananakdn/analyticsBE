/**
 * FIS Country master data (admin.fis_country, admin.fis_country_entity)
 */

import { executeQuery } from '../config/database.js';

export interface FisCountry {
  countryCode: string;
  countryName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateFisCountryRequest {
  countryCode: string;
  countryName: string;
  createdBy?: string;
}

export interface UpdateFisCountryRequest {
  countryName?: string;
  updatedBy?: string;
}

type DbCountryRow = {
  country_code: string;
  country_name: string;
  created_at?: Date;
  updated_at?: Date;
};

function transformCountry(row: DbCountryRow): FisCountry {
  return {
    countryCode: row.country_code,
    countryName: row.country_name,
    createdAt: row.created_at?.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

export async function getAllFisCountries(): Promise<FisCountry[]> {
  const result = await executeQuery<DbCountryRow>(
    `SELECT country_code, country_name, created_at, updated_at
     FROM admin.fis_country
     ORDER BY country_name, country_code`
  );
  if (result.error) throw new Error(result.error);
  return (result.data || []).map(transformCountry);
}

export async function getFisCountryByCode(countryCode: string): Promise<FisCountry | null> {
  const result = await executeQuery<DbCountryRow>(
    `SELECT country_code, country_name, created_at, updated_at
     FROM admin.fis_country WHERE country_code = @countryCode`,
    { countryCode: countryCode.trim().toUpperCase() }
  );
  if (result.error) throw new Error(result.error);
  if (!result.data?.length) return null;
  return transformCountry(result.data[0]);
}

export async function createFisCountry(req: CreateFisCountryRequest): Promise<FisCountry> {
  const code = req.countryCode.trim().toUpperCase();
  const name = req.countryName.trim();
  if (!code || !name) throw new Error('countryCode and countryName are required');

  const existing = await getFisCountryByCode(code);
  if (existing) throw new Error('Country code already exists');

  const result = await executeQuery<DbCountryRow>(
    `INSERT INTO admin.fis_country (country_code, country_name, created_by)
     VALUES (@countryCode, @countryName, @createdBy);
     SELECT country_code, country_name, created_at, updated_at
     FROM admin.fis_country WHERE country_code = @countryCode`,
    { countryCode: code, countryName: name, createdBy: req.createdBy || null }
  );
  if (result.error || !result.data?.length) {
    throw new Error(result.error || 'Failed to create country');
  }
  return transformCountry(result.data[0]);
}

export async function updateFisCountry(
  countryCode: string,
  req: UpdateFisCountryRequest
): Promise<FisCountry> {
  if (req.countryName === undefined) {
    const row = await getFisCountryByCode(countryCode);
    if (!row) throw new Error('Country not found');
    return row;
  }

  const result = await executeQuery<DbCountryRow>(
    `UPDATE admin.fis_country
     SET country_name = @countryName, updated_by = @updatedBy
     WHERE country_code = @countryCode;
     SELECT country_code, country_name, created_at, updated_at
     FROM admin.fis_country WHERE country_code = @countryCode`,
    {
      countryCode: countryCode.trim().toUpperCase(),
      countryName: req.countryName.trim(),
      updatedBy: req.updatedBy || null,
    }
  );
  if (result.error || !result.data?.length) {
    throw new Error(result.error || 'Country not found');
  }
  return transformCountry(result.data[0]);
}

export async function setEntityCountry(
  entityCode: string,
  countryCode: string | null | undefined,
  updatedBy?: string
): Promise<void> {
  const code = entityCode.trim().toUpperCase();
  await executeQuery(
    `DELETE FROM admin.fis_country_entity WHERE entity_code = @entityCode`,
    { entityCode: code }
  );

  if (!countryCode || !countryCode.trim()) return;

  const cc = countryCode.trim().toUpperCase();
  const country = await getFisCountryByCode(cc);
  if (!country) throw new Error('Country not found');

  const result = await executeQuery(
    `INSERT INTO admin.fis_country_entity (country_code, entity_code, created_by)
     VALUES (@countryCode, @entityCode, @createdBy)`,
    { countryCode: cc, entityCode: code, createdBy: updatedBy || null }
  );
  if (result.error) throw new Error(result.error);
}

export async function getEntityCountryCode(entityCode: string): Promise<string | null> {
  const result = await executeQuery<{ country_code: string }>(
    `SELECT country_code FROM admin.fis_country_entity WHERE entity_code = @entityCode`,
    { entityCode: entityCode.trim().toUpperCase() }
  );
  if (result.error) throw new Error(result.error);
  return result.data?.[0]?.country_code ?? null;
}
