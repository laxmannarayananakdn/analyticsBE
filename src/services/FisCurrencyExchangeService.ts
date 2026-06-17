/**
 * FIS Currency Exchange master data (admin.fis_currency_exchange)
 * with currency names and entity mappings (admin.fis_currency, admin.fis_currency_entity)
 */

import { executeQuery } from '../config/database.js';

export const TO_CURRENCY = 'USD';

export type ExchangeType = 'Actual' | 'Budget' | 'Plan' | 'Average' | 'Spot';

export interface FisCurrencyEntityRef {
  entityCode: string;
  entityName: string;
}

export interface FisCurrencyExchange {
  exchangeId: number;
  fromCurrency: string;
  toCurrency: string;
  currencyName: string | null;
  entities: FisCurrencyEntityRef[];
  exchangeRate: number;
  exchangeType: ExchangeType;
  effectiveFrom: string;
  effectiveTo: string | null;
  year: number;
  createdBy?: string | null;
  createdAt?: string;
  updatedBy?: string | null;
  updatedAt?: string;
}

export interface CreateFisCurrencyExchangeRequest {
  fromCurrency: string;
  currencyName: string;
  entityCodes?: string[];
  exchangeRate: number;
  exchangeType: ExchangeType;
  effectiveFrom: string;
  effectiveTo?: string | null;
  year: number;
  createdBy?: string;
}

export interface UpdateFisCurrencyExchangeRequest {
  currencyName?: string;
  entityCodes?: string[];
  exchangeRate?: number;
  exchangeType?: ExchangeType;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  year?: number;
  updatedBy?: string;
}

type DbRow = {
  exchange_id: number;
  from_currency: string;
  to_currency: string;
  currency_name: string | null;
  exchange_rate: number;
  exchange_type: string;
  effective_from: Date;
  effective_to: Date | null;
  year: number;
  created_by?: string | null;
  created_at?: Date;
  updated_by?: string | null;
  updated_at?: Date;
};

type EntityMapRow = {
  currency_code: string;
  entity_code: string;
  entity_name: string;
};

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase();
}

function buildEntityMap(rows: EntityMapRow[]): Map<string, FisCurrencyEntityRef[]> {
  const map = new Map<string, FisCurrencyEntityRef[]>();
  for (const row of rows) {
    if (!map.has(row.currency_code)) map.set(row.currency_code, []);
    map.get(row.currency_code)!.push({
      entityCode: row.entity_code,
      entityName: row.entity_name,
    });
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.entityCode.localeCompare(b.entityCode));
  }
  return map;
}

async function loadEntityMap(): Promise<Map<string, FisCurrencyEntityRef[]>> {
  const result = await executeQuery<EntityMapRow>(
    `SELECT ce.currency_code, ce.entity_code, e.entity_name
     FROM admin.fis_currency_entity ce
     INNER JOIN admin.fis_entity e ON e.entity_code = ce.entity_code
     ORDER BY ce.currency_code, ce.entity_code`
  );
  if (result.error) throw new Error(result.error);
  return buildEntityMap(result.data || []);
}

function transform(row: DbRow, entityMap: Map<string, FisCurrencyEntityRef[]>): FisCurrencyExchange {
  return {
    exchangeId: row.exchange_id,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    currencyName: row.currency_name,
    entities: entityMap.get(row.from_currency) || [],
    exchangeRate: Number(row.exchange_rate),
    exchangeType: row.exchange_type as ExchangeType,
    effectiveFrom: formatDate(row.effective_from)!,
    effectiveTo: formatDate(row.effective_to),
    year: row.year,
    createdBy: row.created_by,
    createdAt: row.created_at?.toISOString(),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at?.toISOString(),
  };
}

const SELECT_COLS = `
  e.exchange_id, e.from_currency, e.to_currency, c.currency_name, e.exchange_rate, e.exchange_type,
  e.effective_from, e.effective_to, e.[year], e.created_by, e.created_at, e.updated_by, e.updated_at
`;

export async function getAvailableYears(): Promise<number[]> {
  const result = await executeQuery<{ year: number }>(
    `SELECT DISTINCT [year] FROM admin.fis_currency_exchange ORDER BY [year] DESC`
  );
  if (result.error) throw new Error(result.error);
  return (result.data || []).map((r) => r.year);
}

export async function getAllFisCurrencyExchanges(year?: number): Promise<FisCurrencyExchange[]> {
  const params: Record<string, unknown> = {};
  let where = '';
  if (year != null) {
    where = 'WHERE e.[year] = @year';
    params.year = year;
  }

  const [result, entityMap] = await Promise.all([
    executeQuery<DbRow>(
      `SELECT ${SELECT_COLS}
       FROM admin.fis_currency_exchange e
       LEFT JOIN admin.fis_currency c ON c.currency_code = e.from_currency
       ${where}
       ORDER BY e.[year] DESC, e.from_currency, e.exchange_type, e.effective_from DESC`,
      params
    ),
    loadEntityMap(),
  ]);

  if (result.error) throw new Error(result.error);
  return (result.data || []).map((row) => transform(row, entityMap));
}

export async function getFisCurrencyExchangeById(exchangeId: number): Promise<FisCurrencyExchange | null> {
  const [result, entityMap] = await Promise.all([
    executeQuery<DbRow>(
      `SELECT ${SELECT_COLS}
       FROM admin.fis_currency_exchange e
       LEFT JOIN admin.fis_currency c ON c.currency_code = e.from_currency
       WHERE e.exchange_id = @exchangeId`,
      { exchangeId }
    ),
    loadEntityMap(),
  ]);
  if (result.error) throw new Error(result.error);
  if (!result.data?.length) return null;
  return transform(result.data[0], entityMap);
}

async function validateEntityCodes(entityCodes: string[]): Promise<void> {
  const unique = [...new Set(entityCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return;

  for (const code of unique) {
    const exists = await executeQuery(
      `SELECT entity_code FROM admin.fis_entity WHERE entity_code = @entityCode`,
      { entityCode: code }
    );
    if (exists.error) throw new Error(exists.error);
    if (!exists.data?.length) throw new Error(`Entity not found: ${code}`);
  }
}

async function assertEntitiesAvailableForCurrency(
  currencyCode: string,
  entityCodes: string[]
): Promise<void> {
  const unique = [...new Set(entityCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return;

  for (const entityCode of unique) {
    const conflict = await executeQuery<{ currency_code: string }>(
      `SELECT currency_code FROM admin.fis_currency_entity
       WHERE entity_code = @entityCode AND currency_code <> @currencyCode`,
      { entityCode, currencyCode }
    );
    if (conflict.error) throw new Error(conflict.error);
    if (conflict.data?.length) {
      throw new Error(`Entity ${entityCode} is already mapped to currency ${conflict.data[0].currency_code}`);
    }
  }
}

async function upsertCurrencyMaster(
  currencyCode: string,
  currencyName: string,
  entityCodes: string[] | undefined,
  user: string
): Promise<void> {
  const code = normalizeCurrency(currencyCode);
  const name = currencyName.trim();
  if (!code) throw new Error('fromCurrency is required');
  if (!name) throw new Error('currencyName is required');

  const normalizedEntities = entityCodes
    ? [...new Set(entityCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))]
    : undefined;

  if (normalizedEntities) {
    await validateEntityCodes(normalizedEntities);
    await assertEntitiesAvailableForCurrency(code, normalizedEntities);
  }

  const existing = await executeQuery(
    `SELECT currency_code FROM admin.fis_currency WHERE currency_code = @currencyCode`,
    { currencyCode: code }
  );
  if (existing.error) throw new Error(existing.error);

  if (existing.data?.length) {
    const update = await executeQuery(
      `UPDATE admin.fis_currency SET currency_name = @currencyName, updated_by = @updatedBy
       WHERE currency_code = @currencyCode`,
      { currencyCode: code, currencyName: name, updatedBy: user }
    );
    if (update.error) throw new Error(update.error);
  } else {
    const insert = await executeQuery(
      `INSERT INTO admin.fis_currency (currency_code, currency_name, created_by)
       VALUES (@currencyCode, @currencyName, @createdBy)`,
      { currencyCode: code, currencyName: name, createdBy: user }
    );
    if (insert.error) throw new Error(insert.error);
  }

  if (normalizedEntities) {
    const del = await executeQuery(
      `DELETE FROM admin.fis_currency_entity WHERE currency_code = @currencyCode`,
      { currencyCode: code }
    );
    if (del.error) throw new Error(del.error);

    for (const entityCode of normalizedEntities) {
      const ins = await executeQuery(
        `INSERT INTO admin.fis_currency_entity (currency_code, entity_code, created_by)
         VALUES (@currencyCode, @entityCode, @createdBy)`,
        { currencyCode: code, entityCode, createdBy: user }
      );
      if (ins.error) throw new Error(ins.error);
    }
  }
}

export async function createFisCurrencyExchange(
  req: CreateFisCurrencyExchangeRequest
): Promise<FisCurrencyExchange> {
  const fromCurrency = normalizeCurrency(req.fromCurrency);
  const exchangeType = req.exchangeType;
  const effectiveFrom = req.effectiveFrom;
  const effectiveTo = req.effectiveTo ?? null;
  const year = req.year;
  const exchangeRate = req.exchangeRate;

  if (!fromCurrency) throw new Error('fromCurrency is required');
  if (fromCurrency === TO_CURRENCY) throw new Error('fromCurrency cannot be USD');
  if (!exchangeRate || exchangeRate <= 0) throw new Error('exchangeRate must be greater than 0');
  if (!exchangeType) throw new Error('exchangeType is required');
  if (!effectiveFrom) throw new Error('effectiveFrom is required');
  if (!year) throw new Error('year is required');
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error('effectiveTo must be on or after effectiveFrom');
  }

  await upsertCurrencyMaster(
    fromCurrency,
    req.currencyName,
    req.entityCodes ?? [],
    req.createdBy || 'system'
  );

  const result = await executeQuery<DbRow>(
    `INSERT INTO admin.fis_currency_exchange (
       from_currency, to_currency, exchange_rate, exchange_type,
       effective_from, effective_to, [year], created_by
     )
     VALUES (
       @fromCurrency, @toCurrency, @exchangeRate, @exchangeType,
       @effectiveFrom, @effectiveTo, @year, @createdBy
     );
     SELECT ${SELECT_COLS}
     FROM admin.fis_currency_exchange e
     LEFT JOIN admin.fis_currency c ON c.currency_code = e.from_currency
     WHERE e.exchange_id = SCOPE_IDENTITY()`,
    {
      fromCurrency,
      toCurrency: TO_CURRENCY,
      exchangeRate,
      exchangeType,
      effectiveFrom,
      effectiveTo,
      year,
      createdBy: req.createdBy || null,
    }
  );
  if (result.error || !result.data?.length) {
    if (result.error?.includes('UQ_fis_currency_exchange') || result.error?.includes('UNIQUE')) {
      throw new Error('A rate already exists for this currency, type, effective date, and year');
    }
    if (result.error?.includes('FK_fis_currency_exchange_from_currency')) {
      throw new Error('Currency master record is missing; save currency details first');
    }
    throw new Error(result.error || 'Failed to create currency exchange');
  }

  const entityMap = await loadEntityMap();
  return transform(result.data[0], entityMap);
}

export async function updateFisCurrencyExchange(
  exchangeId: number,
  req: UpdateFisCurrencyExchangeRequest
): Promise<FisCurrencyExchange> {
  const existing = await getFisCurrencyExchangeById(exchangeId);
  if (!existing) throw new Error('Currency exchange not found');

  if (req.currencyName !== undefined || req.entityCodes !== undefined) {
    await upsertCurrencyMaster(
      existing.fromCurrency,
      req.currencyName ?? existing.currencyName ?? existing.fromCurrency,
      req.entityCodes ?? existing.entities.map((e) => e.entityCode),
      req.updatedBy || 'system'
    );
  }

  const exchangeRate = req.exchangeRate !== undefined ? req.exchangeRate : existing.exchangeRate;
  const exchangeType = req.exchangeType !== undefined ? req.exchangeType : existing.exchangeType;
  const effectiveFrom = req.effectiveFrom !== undefined ? req.effectiveFrom : existing.effectiveFrom;
  const effectiveTo = req.effectiveTo !== undefined ? req.effectiveTo : existing.effectiveTo;
  const year = req.year !== undefined ? req.year : existing.year;

  if (exchangeRate <= 0) throw new Error('exchangeRate must be greater than 0');
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error('effectiveTo must be on or after effectiveFrom');
  }

  const result = await executeQuery<DbRow>(
    `UPDATE admin.fis_currency_exchange SET
       to_currency = @toCurrency,
       exchange_rate = @exchangeRate,
       exchange_type = @exchangeType,
       effective_from = @effectiveFrom,
       effective_to = @effectiveTo,
       [year] = @year,
       updated_by = @updatedBy
     WHERE exchange_id = @exchangeId;
     SELECT ${SELECT_COLS}
     FROM admin.fis_currency_exchange e
     LEFT JOIN admin.fis_currency c ON c.currency_code = e.from_currency
     WHERE e.exchange_id = @exchangeId`,
    {
      exchangeId,
      toCurrency: TO_CURRENCY,
      exchangeRate,
      exchangeType,
      effectiveFrom,
      effectiveTo,
      year,
      updatedBy: req.updatedBy || null,
    }
  );
  if (result.error || !result.data?.length) {
    if (result.error?.includes('UQ_fis_currency_exchange') || result.error?.includes('UNIQUE')) {
      throw new Error('A rate already exists for this currency, type, effective date, and year');
    }
    throw new Error(result.error || 'Failed to update currency exchange');
  }

  const entityMap = await loadEntityMap();
  return transform(result.data[0], entityMap);
}
