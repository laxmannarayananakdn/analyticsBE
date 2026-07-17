/**
 * Warm Superset chart cache for FIS dashboards after report generation.
 * Soft-fail friendly — callers should not fail FIS jobs if warm fails.
 */

import pg from 'pg';
import { getAllFisEntities, getFisEntityByCode } from './FisEntityService.js';

const SUPERSET_URL = (
  process.env.SUPERSET_URL || 'https://superset-edtech-app.azurewebsites.net'
).replace(/\/$/, '');
const SUPERSET_USERNAME = process.env.SUPERSET_USERNAME || 'admin';
const SUPERSET_PASSWORD = process.env.SUPERSET_PASSWORD || '';
const DEFAULT_ENTITY_DASHBOARD_ID = parseInt(
  process.env.SUPERSET_FIS_DASHBOARD_ID || '33',
  10
);
const DEFAULT_HO_DASHBOARD_ID = parseInt(
  process.env.SUPERSET_FIS_HO_DASHBOARD_ID || '44',
  10
);
const DEFAULT_DELAY_MS = parseInt(process.env.SUPERSET_WARM_DELAY_MS || '500', 10);
const SUPERSET_AZURE_SQL_DATABASE_ID = parseInt(
  process.env.SUPERSET_AZURE_SQL_DATABASE_ID || '1',
  10
);

/** Dashboard warmed for the entity processed in the current FIS V2 run. */
const FIS_ENTITY_DASHBOARD_ID = DEFAULT_ENTITY_DASHBOARD_ID;
/** HO-only dashboard warmed for every active entity after each FIS V2 run. */
const FIS_HO_ALL_ENTITIES_DASHBOARD_ID = DEFAULT_HO_DASHBOARD_ID;

export type SupersetCacheWarmResult = {
  dashboardId: number;
  entityCodes: string[];
  chartCount: number;
  ok: number;
  failed: number;
  skipped: boolean;
  skipReason?: string;
  durationMs: number;
};

type AuthSession = {
  accessToken: string;
  csrfToken: string;
  cookieHeader?: string;
};

type ChartRow = { id: number; slice_name: string };

/** When false, FIS V2 skips post-run cache warm. Default: enabled. */
export function isSupersetCacheWarmEnabled(): boolean {
  return String(process.env.FIS_WARM_SUPERSET_CACHE ?? 'true').toLowerCase() !== 'false';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCookies(response: Response): string {
  const getSetCookie = (
    response.headers as unknown as { getSetCookie?: () => string[] }
  ).getSetCookie;
  const setCookies = getSetCookie ? getSetCookie.call(response.headers) : null;
  if (setCookies?.length) {
    return setCookies.map((c) => c.split(';')[0].trim()).join('; ');
  }
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .join('; ');
}

function authHeaders(session: AuthSession, includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: 'application/json',
    'X-CSRFToken': session.csrfToken,
    Referer: `${SUPERSET_URL}/`,
    Origin: SUPERSET_URL,
  };
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (session.cookieHeader) {
    headers.Cookie = session.cookieHeader;
  }
  return headers;
}

async function login(): Promise<AuthSession> {
  if (!SUPERSET_PASSWORD) {
    throw new Error('SUPERSET_PASSWORD is not configured');
  }

  const loginRes = await fetch(`${SUPERSET_URL}/api/v1/security/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      username: SUPERSET_USERNAME,
      password: SUPERSET_PASSWORD,
      provider: 'db',
      refresh: true,
    }),
  });

  const loginCookie = getCookies(loginRes);
  const loginBody = (await loginRes.json()) as { access_token?: string; message?: string };
  if (!loginRes.ok || !loginBody.access_token) {
    throw new Error(
      `Superset login failed (${loginRes.status}): ${loginBody.message || 'no token'}`
    );
  }

  const accessToken = loginBody.access_token;
  const csrfRes = await fetch(`${SUPERSET_URL}/api/v1/security/csrf_token/`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const csrfCookie = getCookies(csrfRes);
  const csrfBody = (await csrfRes.json()) as { result?: string };
  if (!csrfRes.ok || !csrfBody.result) {
    throw new Error(`Superset CSRF failed (${csrfRes.status})`);
  }

  return {
    accessToken,
    csrfToken: csrfBody.result,
    cookieHeader: [loginCookie, csrfCookie].filter(Boolean).join('; ') || undefined,
  };
}

function createMetadataClient(): pg.Client | null {
  if (process.env.SUPERSET_DATABASE_URL) {
    return new pg.Client({
      connectionString: process.env.SUPERSET_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  if (!process.env.SUPERSET_DB_HOST) return null;
  return new pg.Client({
    host: process.env.SUPERSET_DB_HOST,
    database: process.env.SUPERSET_DB_NAME || process.env.SUPERSET_DB_DATABASE,
    user: process.env.SUPERSET_DB_USER,
    password: process.env.SUPERSET_DB_PASSWORD,
    port: parseInt(process.env.SUPERSET_DB_PORT || '5432', 10),
    ssl: { rejectUnauthorized: false },
  });
}

async function fetchDashboardCharts(dashboardId: number): Promise<ChartRow[]> {
  const client = createMetadataClient();
  if (!client) {
    throw new Error('Superset metadata DB not configured (SUPERSET_DB_HOST)');
  }
  await client.connect();
  try {
    const res = await client.query<{ id: number; slice_name: string }>(
      `SELECT s.id, s.slice_name
       FROM dashboard_slices ds
       JOIN slices s ON s.id = ds.slice_id
       WHERE ds.dashboard_id = $1
       ORDER BY s.id`,
      [dashboardId]
    );
    return res.rows;
  } finally {
    await client.end();
  }
}

function buildEntityExtraFilters(entityCode: string, entityDescriptionUse: string): string {
  return JSON.stringify([
    { col: 'entity', op: 'IN', val: [entityCode] },
    { col: 'entity_description_use', op: 'IN', val: [entityDescriptionUse] },
  ]);
}

async function resolveEntityDescription(entityCode: string): Promise<string> {
  try {
    const entity = await getFisEntityByCode(entityCode);
    if (entity?.entityName) {
      return `${entity.entityCode} - ${entity.entityName}`;
    }
  } catch {
    // Fall through to code-only label
  }
  return entityCode;
}

const ENTITY_SQL = `SELECT e.entity_code
FROM admin.fis_entity e
INNER JOIN admin.fis_country_entity fce ON fce.entity_code = e.entity_code
WHERE e.status = 'active'
ORDER BY e.entity_code`;

async function fetchAllActiveEntityCodes(session?: AuthSession): Promise<string[]> {
  try {
    const entities = await getAllFisEntities(true);
    if (entities.length) {
      return entities.map((e) => e.entityCode);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(
      `[Superset cache] Azure SQL entity list failed (${message.slice(0, 100)}); trying SQL Lab`
    );
  }

  if (!session) {
    session = await login();
  }

  const res = await fetch(`${SUPERSET_URL}/api/v1/sqllab/execute/`, {
    method: 'POST',
    headers: authHeaders(session),
    body: JSON.stringify({
      database_id: SUPERSET_AZURE_SQL_DATABASE_ID,
      schema: 'admin',
      sql: ENTITY_SQL,
      runAsync: false,
    }),
  });

  const body = (await res.json()) as {
    data?: Array<{ entity_code: string }>;
    error?: string;
    message?: string;
  };

  if (!res.ok || body.error || !body.data?.length) {
    throw new Error(
      `Failed to load active entities (${res.status}): ${body.error || body.message || 'no rows'}`
    );
  }

  return body.data.map((r) => r.entity_code);
}

async function warmChart(
  session: AuthSession,
  dashboardId: number,
  chartId: number,
  extraFilters: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${SUPERSET_URL}/api/v1/chart/warm_up_cache`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: JSON.stringify({
      dashboard_id: dashboardId,
      chart_id: chartId,
      extra_filters: extraFilters,
    }),
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const parsed = body as {
    result?: Array<{ viz_error?: string | null }>;
    message?: string;
  };
  const vizError = parsed?.result?.[0]?.viz_error;
  if (!res.ok || vizError) {
    return {
      ok: false,
      error: String(vizError || parsed?.message || `HTTP ${res.status}`),
    };
  }
  return { ok: true };
}

/**
 * Warm FIS dashboard charts for one or more entity codes (entity-filter context).
 * Safe to call after FIS V2 publish; does not throw on partial chart failures.
 */
export async function warmSupersetCacheForEntities(params: {
  entityCodes: string[];
  dashboardId?: number;
  delayMs?: number;
  session?: AuthSession;
}): Promise<SupersetCacheWarmResult> {
  const started = Date.now();
  const dashboardId = params.dashboardId ?? FIS_ENTITY_DASHBOARD_ID;
  const delayMs =
    typeof params.delayMs === 'number' && params.delayMs >= 0
      ? params.delayMs
      : Number.isFinite(DEFAULT_DELAY_MS) && DEFAULT_DELAY_MS >= 0
        ? DEFAULT_DELAY_MS
        : 500;

  const entityCodes = [
    ...new Set(
      params.entityCodes
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

  if (!isSupersetCacheWarmEnabled()) {
    return {
      dashboardId,
      entityCodes,
      chartCount: 0,
      ok: 0,
      failed: 0,
      skipped: true,
      skipReason: 'FIS_WARM_SUPERSET_CACHE=false',
      durationMs: Date.now() - started,
    };
  }

  if (entityCodes.length === 0) {
    return {
      dashboardId,
      entityCodes,
      chartCount: 0,
      ok: 0,
      failed: 0,
      skipped: true,
      skipReason: 'No entity codes',
      durationMs: Date.now() - started,
    };
  }

  const session = params.session ?? (await login());
  const charts = await fetchDashboardCharts(dashboardId);
  let ok = 0;
  let failed = 0;

  for (const entityCode of entityCodes) {
    const description = await resolveEntityDescription(entityCode);
    const extraFilters = buildEntityExtraFilters(entityCode, description);
    console.log(
      `[Superset cache] Warming dashboard ${dashboardId} for ${entityCode} (${charts.length} charts)...`
    );

    for (const chart of charts) {
      const result = await warmChart(session, dashboardId, chart.id, extraFilters);
      if (result.ok) {
        ok += 1;
      } else {
        failed += 1;
        console.warn(
          `[Superset cache] Failed chart ${chart.id} (${chart.slice_name}) entity=${entityCode}: ${result.error}`
        );
      }
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const durationMs = Date.now() - started;
  console.log(
    `[Superset cache] Done dashboard=${dashboardId} entities=${entityCodes.join(',')} ` +
      `ok=${ok} failed=${failed} in ${(durationMs / 1000).toFixed(1)}s`
  );

  return {
    dashboardId,
    entityCodes,
    chartCount: charts.length,
    ok,
    failed,
    skipped: false,
    durationMs,
  };
}

/**
 * After FIS V2 publish:
 *  - Dashboard 33 (entity): warm charts for the entity that just ran
 *  - Dashboard 44 (HO USD): warm charts for every active entity
 * Soft-fail — never throws to the caller.
 */
export async function warmSupersetCacheAfterFisV2(entityCode: string): Promise<void> {
  if (!isSupersetCacheWarmEnabled()) {
    console.log('[Superset cache] Skipped after FIS V2: FIS_WARM_SUPERSET_CACHE=false');
    return;
  }

  const normalized = entityCode.trim().toUpperCase();
  if (!normalized) {
    console.log('[Superset cache] Skipped after FIS V2: no entity code');
    return;
  }

  try {
    const session = await login();

    const entityDash = await warmSupersetCacheForEntities({
      entityCodes: [normalized],
      dashboardId: FIS_ENTITY_DASHBOARD_ID,
      session,
    });
    if (entityDash.skipped) {
      console.log(`[Superset cache] Entity dashboard skipped: ${entityDash.skipReason}`);
    }

    let allEntityCodes: string[];
    try {
      allEntityCodes = await fetchAllActiveEntityCodes(session);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[Superset cache] HO dashboard warm skipped — could not load entities: ${message}`
      );
      return;
    }

    console.log(
      `[Superset cache] HO dashboard ${FIS_HO_ALL_ENTITIES_DASHBOARD_ID}: ` +
        `warming ${allEntityCodes.length} entit(y/ies)...`
    );

    const hoDash = await warmSupersetCacheForEntities({
      entityCodes: allEntityCodes,
      dashboardId: FIS_HO_ALL_ENTITIES_DASHBOARD_ID,
      session,
    });
    if (hoDash.skipped) {
      console.log(`[Superset cache] HO dashboard skipped: ${hoDash.skipReason}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Superset cache] Warm after FIS V2 failed (non-fatal): ${message}`);
  }
}
