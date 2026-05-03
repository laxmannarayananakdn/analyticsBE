/**
 * Enable embedding for Superset dashboards
 * Usage: node scripts/enable-dashboard-embedding.js [dashboard_id]
 *
 * Note: If you get "CSRF session token is missing", enable embedding manually
 * in Superset UI: Dashboard → ⋮ menu → Embed dashboard → Enable
 */

const SUPERSET_URL = 'https://superset-edtech-app.azurewebsites.net';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin12345';
const DASHBOARD_ID = process.argv[2] || '1';

/** Extract Cookie header from fetch response for forwarding */
function getCookies(response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie.split(',').map((c) => c.split(';')[0].trim()).join('; ');
}

async function enableDashboardEmbedding() {
  try {
    console.log(`=== Enabling Embedding for Dashboard ${DASHBOARD_ID} ===\n`);

    // Step 1: Login and get access token + session cookies

    const loginResponse = await fetch(`${SUPERSET_URL}/api/v1/security/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'manual',
      body: JSON.stringify({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
        provider: 'db',
        refresh: true,
      }),
    });

    const sessionCookie = getCookies(loginResponse);
    const loginData = await loginResponse.json();
    const accessToken = loginData.access_token;

    if (!accessToken) {
      throw new Error(
        loginData.message || 'Failed to get access token'
      );
    }



    // Get CSRF token (required for PUT/POST)

    const csrfRes = await fetch(`${SUPERSET_URL}/api/v1/security/csrf_token/`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.result;
    if (!csrfToken) {
      throw new Error('Failed to get CSRF token');
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken,
      Referer: `${SUPERSET_URL}/`,
      Origin: SUPERSET_URL,
    };
    if (sessionCookie) {
      headers.Cookie = sessionCookie;
      console.log('✓ Using session cookie for CSRF validation\n');
    }

    // Step 2: Get current dashboard configuration
    try {
      const dashboardRes = await fetch(
        `${SUPERSET_URL}/api/v1/dashboard/${DASHBOARD_ID}`,
        { headers }
      );
      const dashboardInfo = await dashboardRes.json();
      console.log('Current dashboard info:');
      console.log(JSON.stringify(dashboardInfo.result, null, 2));
    } catch (err) {
      console.log('Could not fetch dashboard info:', err.message);
    }

    // Step 3: Enable embedding via dedicated embedded endpoint


    const allowedDomains = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:3001',
      'https://superset-edtech-app.azurewebsites.net'
    ];

    const embeddedPayload = {
      allowed_domains: allowedDomains,
    };

    const updateResponse = await fetch(
      `${SUPERSET_URL}/api/v1/dashboard/${DASHBOARD_ID}/embedded`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(embeddedPayload),
      }
    );

    const updateData = await updateResponse.json();

    if (updateResponse.ok) {

    } else {
      console.log('Error:', updateData.message || JSON.stringify(updateData));
      if (updateData.errors) {
        updateData.errors.forEach((e) => console.log(' -', e.message));
      }
    }

    // Step 4: Verify embedding

    const verifyRes = await fetch(
      `${SUPERSET_URL}/api/v1/dashboard/${DASHBOARD_ID}`,
      { headers }
    );
    const verifyData = await verifyRes.json();
    const embedded = verifyData.result?.embedded;


  } catch (error) {
    console.error('ERROR:', error.message);
    if (error.response?.status === 404) {
      console.error(`\nDashboard ${DASHBOARD_ID} not found. Check the dashboard ID.`);
    }
  }

}

enableDashboardEmbedding();
