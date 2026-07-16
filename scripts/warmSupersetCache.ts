/**
 * Warm Superset Chart Cache
 *
 * Pre-loads chart caches for dashboards. Supports:
 *   - plain warm (admin, no filters)
 *   - --by-entity (one warm pass per entity — best for Entity dashboard filter)
 *   - --by-country (one warm pass per country entity set)
 *
 * Auth: POST /api/v1/security/login → Bearer access token + CSRF
 * Warm: PUT /api/v1/chart/warm_up_cache  { chart_id, dashboard_id, extra_filters? }
 *
 * Run:
 *   npm run warm-cache -- --dashboard-ids 33 --by-entity
 *   npm run warm-cache -- --dashboard-ids 33 --by-entity --entities PKES,INES
 *   npm run warm-cache -- --dashboard-ids 33 --by-country
 *   npm run warm-cache -- --dashboard-ids 33 --by-entity --dry-run
 *
 * Cache location: Superset data/results cache on the App Service
 * (Redis if configured; otherwise local/filesystem). No Azure Blob needed.
 */

import dotenv from 'dotenv';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const SUPERSET_URL = (
  process.env.SUPERSET_URL || 'https://superset-edtech-app.azurewebsites.net'
).replace(/\/$/, '');
const SUPERSET_USERNAME = process.env.SUPERSET_USERNAME || 'admin';
const SUPERSET_PASSWORD = process.env.SUPERSET_PASSWORD || '';
const DEFAULT_DELAY_MS = 500;
const PAGE_SIZE = 100;
const DEFAULT_DASHBOARD_ID = 33;
const SUPERSET_AZURE_SQL_DATABASE_ID = parseInt(
  process.env.SUPERSET_AZURE_SQL_DATABASE_ID || '1',
  10
);

interface CliOptions {
  dashboardIds: number[];
  delayMs: number;
  dryRun: boolean;
  byCountry: boolean;
  byEntity: boolean;
  countries: string[] | undefined;
  entities: string[] | undefined;
}

interface AuthSession {
  accessToken: string;
  csrfToken: string;
  cookieHeader?: string;
}

interface DashboardRow {
  id: number;
  dashboard_title?: string;
  slug?: string | null;
}

interface ChartRow {
  id?: number;
  form_data?: { slice_id?: number };
  slice_name?: string;
  slice_id?: number;
}

interface CountryEntityGroup {
  countryCode: string;
  countryName: string;
  entityCodes: string[];
}

interface EntityWarmTarget {
  entityCode: string;
  entityDescriptionUse: string;
  countryCode: string | null;
  countryName: string | null;
}

interface WarmResult {
  dashboardId: number;
  dashboardTitle: string;
  countryCode: string | null;
  entityCode: string | null;
  chartId: number;
  chartName: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
  vizStatus?: string | null;
}

type EntityRow = {
  entity_code: string;
  entity_name: string;
  country_code: string | null;
  country_name: string | null;
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let dashboardIds: number[] | undefined;
  let delayMs = DEFAULT_DELAY_MS;
  let dryRun = false;
  let byCountry = false;
  let byEntity = false;
  let countries: string[] | undefined;
  let entities: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dashboard-ids' && args[i + 1]) {
      dashboardIds = args[++i]
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
    } else if (arg === '--delay' && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      if (!isNaN(parsed) && parsed >= 0) delayMs = parsed;
    } else if (arg === '--countries' && args[i + 1]) {
      countries = args[++i]
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg === '--entities' && args[i + 1]) {
      entities = args[++i]
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    } else if (arg === '--by-country') {
      byCountry = true;
    } else if (arg === '--by-entity') {
      byEntity = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run warm-cache -- [options]

Options:
  --dashboard-ids 33      Dashboard IDs (default: 33 for --by-entity/--by-country)
  --by-entity             Warm once per entity (best when users filter by Entity)
  --by-country            Warm once per country entity set
  --entities PKES,INES    Limit --by-entity to these entity codes
  --countries PAK,KEN     Limit --by-country / --by-entity to these country codes
  --delay MS              Delay between warm requests (default ${DEFAULT_DELAY_MS})
  --dry-run               List work without warming cache
  --help                  Show this help`);
      process.exit(0);
    }
  }

  if (!dashboardIds?.length) {
    dashboardIds = byCountry || byEntity ? [DEFAULT_DASHBOARD_ID] : [];
  }

  return { dashboardIds, delayMs, dryRun, byCountry, byEntity, countries, entities };
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
    throw new Error(
      'SUPERSET_PASSWORD is required. Set it in backend/.env (or the process environment).'
    );
  }

  console.log(`🔐 Logging in to ${SUPERSET_URL} as ${SUPERSET_USERNAME}...`);

  const loginRes = await fetch(`${SUPERSET_URL}/api/v1/security/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      username: SUPERSET_USERNAME,
      password: SUPERSET_PASSWORD,
      provider: 'db',
      refresh: true,
    }),
  });

  const loginCookie = getCookies(loginRes);
  const loginBody = (await loginRes.json()) as {
    access_token?: string;
    message?: string;
  };

  if (!loginRes.ok || !loginBody.access_token) {
    throw new Error(
      `Login failed (${loginRes.status}): ${loginBody.message || JSON.stringify(loginBody)}`
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
    throw new Error(`Failed to get CSRF token (${csrfRes.status})`);
  }

  const cookieHeader = [loginCookie, csrfCookie].filter(Boolean).join('; ') || undefined;

  console.log('✅ Authenticated with Superset\n');
  return {
    accessToken,
    csrfToken: csrfBody.result,
    cookieHeader,
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

async function fetchDashboardsFromMetadata(
  dashboardIds?: number[]
): Promise<DashboardRow[]> {
  const client = createMetadataClient();
  if (!client) {
    throw new Error(
      'Superset metadata DB not configured (SUPERSET_DB_HOST or SUPERSET_DATABASE_URL).'
    );
  }

  await client.connect();
  try {
    if (dashboardIds?.length) {
      const res = await client.query<{ id: number; dashboard_title: string }>(
        `SELECT id, dashboard_title
         FROM dashboards
         WHERE id = ANY($1::int[])
         ORDER BY id`,
        [dashboardIds]
      );
      return res.rows;
    }

    const res = await client.query<{ id: number; dashboard_title: string }>(
      `SELECT id, dashboard_title FROM dashboards ORDER BY id`
    );
    return res.rows;
  } finally {
    await client.end();
  }
}

async function fetchChartsFromMetadata(dashboardId: number): Promise<ChartRow[]> {
  const client = createMetadataClient();
  if (!client) {
    throw new Error(
      'Superset metadata DB not configured (SUPERSET_DB_HOST or SUPERSET_DATABASE_URL).'
    );
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

async function fetchAllDashboards(session: AuthSession): Promise<DashboardRow[]> {
  const dashboards: DashboardRow[] = [];
  let page = 0;

  for (;;) {
    const qs = new URLSearchParams({
      q: JSON.stringify({
        page,
        page_size: PAGE_SIZE,
        order_column: 'changed_on',
        order_direction: 'desc',
      }),
    });

    const res = await fetch(`${SUPERSET_URL}/api/v1/dashboard/?${qs}`, {
      method: 'GET',
      headers: authHeaders(session, false),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to list dashboards (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      result?: DashboardRow[];
      count?: number;
    };
    const batch = data.result || [];
    dashboards.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    if (typeof data.count === 'number' && dashboards.length >= data.count) break;
    page += 1;
  }

  return dashboards;
}

function chartIdFromRow(chart: ChartRow): number | null {
  const id = chart.id ?? chart.slice_id ?? chart.form_data?.slice_id;
  return typeof id === 'number' && !isNaN(id) ? id : null;
}

async function fetchDashboardCharts(
  session: AuthSession,
  dashboardId: number
): Promise<ChartRow[]> {
  const res = await fetch(`${SUPERSET_URL}/api/v1/dashboard/${dashboardId}/charts`, {
    method: 'GET',
    headers: authHeaders(session, false),
  });

  if (res.ok) {
    const data = (await res.json()) as { result?: ChartRow[] };
    const charts = data.result || [];
    if (charts.length > 0) return charts;
  }

  console.log(
    `   ℹ️  REST charts endpoint unavailable/empty for dashboard ${dashboardId}; using metadata DB`
  );
  return fetchChartsFromMetadata(dashboardId);
}

function groupEntitiesByCountry(rows: EntityRow[]): CountryEntityGroup[] {
  const map = new Map<string, CountryEntityGroup>();
  for (const row of rows) {
    if (!row.country_code) continue;
    const existing = map.get(row.country_code);
    if (existing) {
      if (!existing.entityCodes.includes(row.entity_code)) {
        existing.entityCodes.push(row.entity_code);
      }
    } else {
      map.set(row.country_code, {
        countryCode: row.country_code,
        countryName: row.country_name || row.country_code,
        entityCodes: [row.entity_code],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode));
}

function toEntityWarmTargets(rows: EntityRow[]): EntityWarmTarget[] {
  return rows
    .filter((r) => !!r.entity_code)
    .map((r) => ({
      entityCode: r.entity_code,
      entityDescriptionUse: `${r.entity_code} - ${r.entity_name}`,
      countryCode: r.country_code,
      countryName: r.country_name,
    }))
    .sort((a, b) => a.entityCode.localeCompare(b.entityCode));
}

const ENTITY_SQL = `SELECT e.entity_code, e.entity_name, fce.country_code, fc.country_name
FROM admin.fis_entity e
INNER JOIN admin.fis_country_entity fce ON fce.entity_code = e.entity_code
LEFT JOIN admin.fis_country fc ON fc.country_code = fce.country_code
WHERE e.status = 'active'
ORDER BY fce.country_code, e.entity_code`;

async function fetchEntityRowsFromAzureSql(): Promise<EntityRow[] | null> {
  if (!process.env.AZURE_SQL_SERVER || !process.env.AZURE_SQL_DATABASE) {
    return null;
  }

  try {
    const { executeQuery } = await import('../src/config/database.js');
    const result = await executeQuery<EntityRow>(ENTITY_SQL);
    if (result.error || !result.data?.length) {
      console.log(`   ℹ️  Azure SQL entity query skipped/failed: ${result.error || 'no rows'}`);
      return null;
    }
    return result.data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`   ℹ️  Azure SQL unreachable (${message.slice(0, 120)}); falling back to SQL Lab`);
    return null;
  }
}

async function fetchEntityRowsFromSqlLab(session: AuthSession): Promise<EntityRow[]> {
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
    data?: EntityRow[];
    error?: string;
    message?: string;
  };

  if (!res.ok || body.error || !body.data?.length) {
    throw new Error(
      `Failed to load entities via SQL Lab (${res.status}): ${
        body.error || body.message || 'no rows'
      }`
    );
  }

  return body.data;
}

async function fetchEntityRows(session: AuthSession): Promise<EntityRow[]> {
  const fromAzure = await fetchEntityRowsFromAzureSql();
  if (fromAzure?.length) {
    console.log(`📋 Loaded ${fromAzure.length} entit(y/ies) from Azure SQL`);
    return fromAzure;
  }
  const fromSqlLab = await fetchEntityRowsFromSqlLab(session);
  console.log(`📋 Loaded ${fromSqlLab.length} entit(y/ies) via Superset SQL Lab`);
  return fromSqlLab;
}

function buildEntityExtraFilters(
  entityCodes: string[],
  entityDescriptions?: string[]
): string {
  const filters: Array<{ col: string; op: string; val: string[] }> = [
    { col: 'entity', op: 'IN', val: entityCodes },
  ];
  if (entityDescriptions?.length) {
    filters.push({ col: 'entity_description_use', op: 'IN', val: entityDescriptions });
  }
  return JSON.stringify(filters);
}

async function warmChartCache(
  session: AuthSession,
  dashboardId: number,
  chartId: number,
  extraFiltersJson?: string
): Promise<{ status: number; body: unknown; durationMs: number }> {
  const started = Date.now();
  const payload: Record<string, unknown> = {
    dashboard_id: dashboardId,
    chart_id: chartId,
  };
  if (extraFiltersJson) {
    payload.extra_filters = extraFiltersJson;
  }

  const res = await fetch(`${SUPERSET_URL}/api/v1/chart/warm_up_cache`, {
    method: 'PUT',
    headers: authHeaders(session),
    body: JSON.stringify(payload),
  });

  const durationMs = Date.now() - started;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }

  return { status: res.status, body, durationMs };
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function parseWarmBody(body: unknown): {
  vizError?: string | null;
  vizStatus?: string | null;
  message?: string;
} {
  const bodyObj = body as {
    result?: Array<{ viz_error?: string | null; viz_status?: string | null }>;
    message?: string;
    error?: string;
  };
  const first = bodyObj?.result?.[0];
  return {
    vizError: first?.viz_error,
    vizStatus: first?.viz_status ?? null,
    message: bodyObj?.message || bodyObj?.error,
  };
}

async function warmOneChart(args: {
  session: AuthSession;
  dashboard: DashboardRow;
  chart: ChartRow;
  countryCode: string | null;
  entityCode: string | null;
  entityCodes?: string[];
  entityDescriptions?: string[];
  dryRun: boolean;
  results: WarmResult[];
}): Promise<void> {
  const {
    session,
    dashboard,
    chart,
    countryCode,
    entityCode,
    entityCodes,
    entityDescriptions,
    dryRun,
    results,
  } = args;
  const title = dashboard.dashboard_title || `Dashboard ${dashboard.id}`;
  const chartId = chartIdFromRow(chart);
  const chartName = chart.slice_name || (chartId != null ? `Chart ${chartId}` : 'unknown');
  const scopeLabel = entityCode
    ? ` [${entityCode}]`
    : countryCode
      ? ` [${countryCode}]`
      : '';

  if (chartId == null) {
    console.error(`   ❌ Skipping chart with missing id (${chartName})`);
    results.push({
      dashboardId: dashboard.id,
      dashboardTitle: title,
      countryCode,
      entityCode,
      chartId: 0,
      chartName,
      ok: false,
      status: null,
      durationMs: 0,
      error: 'Missing chart id',
    });
    return;
  }

  if (dryRun) {
    const entityHint = entityCodes?.length ? ` entities=${entityCodes.join(',')}` : '';
    console.log(
      `   ○ [dry-run] would warm chart ${chartId} (${chartName})${scopeLabel}${entityHint}`
    );
    results.push({
      dashboardId: dashboard.id,
      dashboardTitle: title,
      countryCode,
      entityCode,
      chartId,
      chartName,
      ok: true,
      status: null,
      durationMs: 0,
    });
    return;
  }

  try {
    const extraFilters = entityCodes?.length
      ? buildEntityExtraFilters(entityCodes, entityDescriptions)
      : undefined;
    const { status, body, durationMs } = await warmChartCache(
      session,
      dashboard.id,
      chartId,
      extraFilters
    );
    const parsed = parseWarmBody(body);
    const ok = status >= 200 && status < 300 && !parsed.vizError;

    if (ok) {
      console.log(
        `   ✅${scopeLabel} chart ${chartId} (${chartName}) — HTTP ${status}` +
          `${parsed.vizStatus ? ` viz=${parsed.vizStatus}` : ''} — ${formatMs(durationMs)}`
      );
    } else {
      const errMsg =
        parsed.vizError ||
        parsed.message ||
        (typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200));
      console.error(
        `   ❌${scopeLabel} chart ${chartId} (${chartName}) — HTTP ${status} — ${formatMs(durationMs)} — ${errMsg}`
      );
    }

    results.push({
      dashboardId: dashboard.id,
      dashboardTitle: title,
      countryCode,
      entityCode,
      chartId,
      chartName,
      ok,
      status,
      durationMs,
      error: ok ? undefined : String(parsed.vizError || parsed.message || 'warm_up_cache failed'),
      vizStatus: parsed.vizStatus,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`   ❌${scopeLabel} chart ${chartId} (${chartName}) — ${message}`);
    results.push({
      dashboardId: dashboard.id,
      dashboardTitle: title,
      countryCode,
      entityCode,
      chartId,
      chartName,
      ok: false,
      status: null,
      durationMs: 0,
      error: message,
    });
  }
}

async function resolveDashboards(
  session: AuthSession,
  options: CliOptions
): Promise<DashboardRow[]> {
  let dashboards = await fetchAllDashboards(session);

  if (options.dashboardIds.length) {
    const allow = new Set(options.dashboardIds);
    dashboards = dashboards.filter((d) => allow.has(d.id));
    if (dashboards.length === 0) {
      console.log(
        'ℹ️  REST dashboard list empty; resolving --dashboard-ids from metadata DB'
      );
      dashboards = await fetchDashboardsFromMetadata(options.dashboardIds);
    }
  } else if (dashboards.length === 0) {
    console.log('ℹ️  REST dashboard list empty; loading all dashboards from metadata DB');
    dashboards = await fetchDashboardsFromMetadata();
  }

  return dashboards;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const runStarted = Date.now();
  const results: WarmResult[] = [];

  if (!options.dashboardIds.length && !options.byCountry && !options.byEntity) {
    console.error('Provide --dashboard-ids and/or --by-entity/--by-country. See --help.');
    process.exit(1);
  }

  if (options.byCountry && options.byEntity) {
    console.error('Use only one of --by-entity or --by-country.');
    process.exit(1);
  }

  const modeExtra = options.byEntity
    ? ' + by-entity'
    : options.byCountry
      ? ' + by-country'
      : '';

  console.log('=== Superset Cache Warm-Up ===');
  console.log(`Base URL:  ${SUPERSET_URL}`);
  console.log(`Delay:     ${options.delayMs}ms between requests`);
  console.log(`Mode:      ${options.dryRun ? 'dry-run' : 'warm'}${modeExtra}`);
  console.log(`Dashboards:${options.dashboardIds.join(', ') || '(all)'}`);
  if (options.countries?.length) {
    console.log(`Countries: ${options.countries.join(', ')}`);
  }
  if (options.entities?.length) {
    console.log(`Entities:  ${options.entities.join(', ')}`);
  }
  console.log('');

  const session = await login();
  const dashboards = await resolveDashboards(session, options);
  console.log(`📋 Found ${dashboards.length} dashboard(s)\n`);

  let countryGroups: CountryEntityGroup[] = [];
  let entityTargets: EntityWarmTarget[] = [];

  if (options.byCountry || options.byEntity) {
    const rows = await fetchEntityRows(session);
    countryGroups = groupEntitiesByCountry(rows);
    entityTargets = toEntityWarmTargets(rows);

    if (options.countries?.length) {
      const allow = new Set(options.countries);
      countryGroups = countryGroups.filter((g) => allow.has(g.countryCode));
      entityTargets = entityTargets.filter(
        (e) => e.countryCode && allow.has(e.countryCode)
      );
    }
    if (options.entities?.length) {
      const allow = new Set(options.entities);
      entityTargets = entityTargets.filter((e) => allow.has(e.entityCode));
    }

    if (options.byCountry) {
      for (const g of countryGroups) {
        console.log(
          `   ${g.countryCode} (${g.countryName}): ${g.entityCodes.join(', ')}`
        );
      }
    } else {
      for (const e of entityTargets) {
        console.log(
          `   ${e.entityCode} (${e.countryCode || 'n/a'}): ${e.entityDescriptionUse}`
        );
      }
    }
    console.log('');
  }

  for (const dashboard of dashboards) {
    const title = dashboard.dashboard_title || `Dashboard ${dashboard.id}`;
    console.log(`── Dashboard ${dashboard.id}: ${title}`);

    let charts: ChartRow[];
    try {
      charts = await fetchDashboardCharts(session, dashboard.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ Failed to fetch charts: ${message}`);
      results.push({
        dashboardId: dashboard.id,
        dashboardTitle: title,
        countryCode: null,
        entityCode: null,
        chartId: 0,
        chartName: '(dashboard charts fetch)',
        ok: false,
        status: null,
        durationMs: 0,
        error: message,
      });
      continue;
    }

    if (charts.length === 0) {
      console.log('   (no charts)\n');
      continue;
    }

    console.log(`   ${charts.length} chart(s)`);

    type Pass = {
      countryCode: string | null;
      entityCode: string | null;
      entityCodes?: string[];
      entityDescriptions?: string[];
      label?: string;
    };

    let passes: Pass[] = [{ countryCode: null, entityCode: null }];
    if (options.byEntity) {
      passes = entityTargets.map((e) => ({
        countryCode: e.countryCode,
        entityCode: e.entityCode,
        entityCodes: [e.entityCode],
        entityDescriptions: [e.entityDescriptionUse],
        label: e.entityDescriptionUse,
      }));
    } else if (options.byCountry) {
      passes = countryGroups.map((g) => ({
        countryCode: g.countryCode,
        entityCode: null,
        entityCodes: g.entityCodes,
        label: `${g.countryCode} (${g.entityCodes.join(', ')})`,
      }));
    }

    if ((options.byCountry || options.byEntity) && passes.length === 0) {
      console.error('   ❌ No entity/country targets to warm\n');
      continue;
    }

    for (const pass of passes) {
      if (pass.label) {
        console.log(`\n   ▸ ${options.byEntity ? 'Entity' : 'Country'} ${pass.label}`);
      }

      for (const chart of charts) {
        await warmOneChart({
          session,
          dashboard,
          chart,
          countryCode: pass.countryCode,
          entityCode: pass.entityCode,
          entityCodes: pass.entityCodes,
          entityDescriptions: pass.entityDescriptions,
          dryRun: options.dryRun,
          results,
        });
        if (!options.dryRun && options.delayMs > 0) {
          await sleep(options.delayMs);
        }
      }
    }

    console.log('');
  }

  const warmed = results.filter((r) => r.chartId > 0);
  const okCount = warmed.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  const timed = warmed.filter((r) => r.durationMs > 0);
  const slowest = [...timed].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);

  console.log('=== Summary ===');
  console.log(`Total duration: ${formatMs(Date.now() - runStarted)}`);
  console.log(`Dashboards:     ${dashboards.length}`);
  if (options.byCountry) {
    console.log(`Countries:      ${countryGroups.length}`);
  }
  if (options.byEntity) {
    console.log(`Entities:       ${entityTargets.length}`);
  }
  console.log(`Warm calls:     ${warmed.length} (${okCount} ok, ${failCount} failed)`);

  if (slowest.length > 0) {
    console.log('\nSlowest charts:');
    for (const r of slowest) {
      const scope = r.entityCode || r.countryCode || '';
      const scopePart = scope ? ` ${scope}` : '';
      console.log(
        `  ${formatMs(r.durationMs).padStart(8)}  dash ${r.dashboardId}${scopePart} chart ${r.chartId} — ${r.chartName}`
      );
    }
  }

  if (failCount > 0) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.ok)) {
      const scope = r.entityCode || r.countryCode || '';
      const scopePart = scope ? ` ${scope}` : '';
      console.log(
        `  dash ${r.dashboardId}${scopePart} chart ${r.chartId || '-'} — ${r.error || 'unknown error'}`
      );
    }
  }

  if (failCount > 0 && okCount === 0 && !options.dryRun) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
