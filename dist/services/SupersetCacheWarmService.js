/**
 * Warm Superset chart cache for FIS dashboards after report generation.
 * Soft-fail friendly — callers should not fail FIS jobs if warm fails.
 */
import pg from 'pg';
import { getFisEntityByCode } from './FisEntityService.js';
const SUPERSET_URL = (process.env.SUPERSET_URL || 'https://superset-edtech-app.azurewebsites.net').replace(/\/$/, '');
const SUPERSET_USERNAME = process.env.SUPERSET_USERNAME || 'admin';
const SUPERSET_PASSWORD = process.env.SUPERSET_PASSWORD || '';
const DEFAULT_DASHBOARD_ID = parseInt(process.env.SUPERSET_FIS_DASHBOARD_ID || '33', 10);
const DEFAULT_DELAY_MS = parseInt(process.env.SUPERSET_WARM_DELAY_MS || '500', 10);
/** When false, FIS V2 skips post-run cache warm. Default: enabled. */
export function isSupersetCacheWarmEnabled() {
    return String(process.env.FIS_WARM_SUPERSET_CACHE ?? 'true').toLowerCase() !== 'false';
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function getCookies(response) {
    const getSetCookie = response.headers.getSetCookie;
    const setCookies = getSetCookie ? getSetCookie.call(response.headers) : null;
    if (setCookies?.length) {
        return setCookies.map((c) => c.split(';')[0].trim()).join('; ');
    }
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie)
        return '';
    return setCookie
        .split(',')
        .map((c) => c.split(';')[0].trim())
        .join('; ');
}
function authHeaders(session, includeContentType = true) {
    const headers = {
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
async function login() {
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
    const loginBody = (await loginRes.json());
    if (!loginRes.ok || !loginBody.access_token) {
        throw new Error(`Superset login failed (${loginRes.status}): ${loginBody.message || 'no token'}`);
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
    const csrfBody = (await csrfRes.json());
    if (!csrfRes.ok || !csrfBody.result) {
        throw new Error(`Superset CSRF failed (${csrfRes.status})`);
    }
    return {
        accessToken,
        csrfToken: csrfBody.result,
        cookieHeader: [loginCookie, csrfCookie].filter(Boolean).join('; ') || undefined,
    };
}
function createMetadataClient() {
    if (process.env.SUPERSET_DATABASE_URL) {
        return new pg.Client({
            connectionString: process.env.SUPERSET_DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
    }
    if (!process.env.SUPERSET_DB_HOST)
        return null;
    return new pg.Client({
        host: process.env.SUPERSET_DB_HOST,
        database: process.env.SUPERSET_DB_NAME || process.env.SUPERSET_DB_DATABASE,
        user: process.env.SUPERSET_DB_USER,
        password: process.env.SUPERSET_DB_PASSWORD,
        port: parseInt(process.env.SUPERSET_DB_PORT || '5432', 10),
        ssl: { rejectUnauthorized: false },
    });
}
async function fetchDashboardCharts(dashboardId) {
    const client = createMetadataClient();
    if (!client) {
        throw new Error('Superset metadata DB not configured (SUPERSET_DB_HOST)');
    }
    await client.connect();
    try {
        const res = await client.query(`SELECT s.id, s.slice_name
       FROM dashboard_slices ds
       JOIN slices s ON s.id = ds.slice_id
       WHERE ds.dashboard_id = $1
       ORDER BY s.id`, [dashboardId]);
        return res.rows;
    }
    finally {
        await client.end();
    }
}
function buildEntityExtraFilters(entityCode, entityDescriptionUse) {
    return JSON.stringify([
        { col: 'entity', op: 'IN', val: [entityCode] },
        { col: 'entity_description_use', op: 'IN', val: [entityDescriptionUse] },
    ]);
}
async function resolveEntityDescription(entityCode) {
    try {
        const entity = await getFisEntityByCode(entityCode);
        if (entity?.entityName) {
            return `${entity.entityCode} - ${entity.entityName}`;
        }
    }
    catch {
        // Fall through to code-only label
    }
    return entityCode;
}
async function warmChart(session, dashboardId, chartId, extraFilters) {
    const res = await fetch(`${SUPERSET_URL}/api/v1/chart/warm_up_cache`, {
        method: 'PUT',
        headers: authHeaders(session),
        body: JSON.stringify({
            dashboard_id: dashboardId,
            chart_id: chartId,
            extra_filters: extraFilters,
        }),
    });
    let body;
    try {
        body = await res.json();
    }
    catch {
        body = null;
    }
    const parsed = body;
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
export async function warmSupersetCacheForEntities(params) {
    const started = Date.now();
    const dashboardId = params.dashboardId ?? DEFAULT_DASHBOARD_ID;
    const delayMs = typeof params.delayMs === 'number' && params.delayMs >= 0
        ? params.delayMs
        : Number.isFinite(DEFAULT_DELAY_MS) && DEFAULT_DELAY_MS >= 0
            ? DEFAULT_DELAY_MS
            : 500;
    const entityCodes = [
        ...new Set(params.entityCodes
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean)),
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
    const session = await login();
    const charts = await fetchDashboardCharts(dashboardId);
    let ok = 0;
    let failed = 0;
    for (const entityCode of entityCodes) {
        const description = await resolveEntityDescription(entityCode);
        const extraFilters = buildEntityExtraFilters(entityCode, description);
        console.log(`[Superset cache] Warming dashboard ${dashboardId} for ${entityCode} (${charts.length} charts)...`);
        for (const chart of charts) {
            const result = await warmChart(session, dashboardId, chart.id, extraFilters);
            if (result.ok) {
                ok += 1;
            }
            else {
                failed += 1;
                console.warn(`[Superset cache] Failed chart ${chart.id} (${chart.slice_name}) entity=${entityCode}: ${result.error}`);
            }
            if (delayMs > 0)
                await sleep(delayMs);
        }
    }
    const durationMs = Date.now() - started;
    console.log(`[Superset cache] Done dashboard=${dashboardId} entities=${entityCodes.join(',')} ` +
        `ok=${ok} failed=${failed} in ${(durationMs / 1000).toFixed(1)}s`);
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
 * Fire-and-forget / soft-fail wrapper for FIS V2 completion.
 */
export async function warmSupersetCacheAfterFisV2(entityCode) {
    try {
        const result = await warmSupersetCacheForEntities({
            entityCodes: [entityCode],
        });
        if (result.skipped) {
            console.log(`[Superset cache] Skipped after FIS V2: ${result.skipReason}`);
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Superset cache] Warm after FIS V2 failed (non-fatal): ${message}`);
    }
}
//# sourceMappingURL=SupersetCacheWarmService.js.map