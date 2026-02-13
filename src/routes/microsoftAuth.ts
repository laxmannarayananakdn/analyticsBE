/**
 * Microsoft OAuth - Backend flow (Web platform)
 * Redirect URI = backend URL. Backend exchanges code for tokens.
 */

import express from 'express';
import { getTenantConfigByDomain } from '../services/MicrosoftTenantService.js';
import { authenticateUserWithOAuth } from '../services/AuthService.js';
import { verifyMicrosoftIdToken } from '../services/MicrosoftOAuthVerifier.js';
import { tenantConfigLookupRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

const FRONTEND_URL = (process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0].trim()) || 'http://localhost:5173';

/**
 * GET /auth/microsoft/authorize?domain=xxx
 * Redirects user to Microsoft login. Callback goes to backend.
 */
router.get('/authorize', tenantConfigLookupRateLimiter, async (req, res) => {
  try {
    const domain = (req.query.domain as string)?.toLowerCase()?.trim();
    if (!domain) {
      return res.redirect(`${FRONTEND_URL}/login?error=domain_required`);
    }

    const config = await getTenantConfigByDomain(domain);
    if (!config) {
      return res.redirect(`${FRONTEND_URL}/login?error=tenant_not_configured`);
    }

    const redirectUri = `${getBackendBaseUrl(req)}/api/auth/microsoft/callback`;
    const state = Buffer.from(JSON.stringify({ domain }), 'utf8').toString('base64url');
    const tenant = config.authorityTenant || config.domain;

    const authUrl = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);

    const loginHint = req.query.login_hint;
    if (loginHint) {
      authUrl.searchParams.set('login_hint', loginHint as string);
    }

    res.redirect(authUrl.toString());
  } catch (err: any) {
    console.error('[Microsoft Auth] Authorize error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=authorize_failed`);
  }
});

/**
 * GET /auth/microsoft/callback?code=xxx&state=xxx
 * Microsoft redirects here. Exchange code for tokens, verify user, redirect to frontend with JWT.
 */
router.get('/callback', tenantConfigLookupRateLimiter, async (req, res) => {
  try {
    const { code, state, error: msError, error_description } = req.query;

    if (msError) {
      console.error('[Microsoft Auth] Microsoft returned error:', msError, error_description);
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent((error_description as string) || (msError as string))}`);
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/login?error=no_code`);
    }

    let domain: string;
    try {
      const stateObj = JSON.parse(Buffer.from(state as string, 'base64url').toString('utf8'));
      domain = stateObj.domain;
    } catch {
      return res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
    }

    const config = await getTenantConfigByDomain(domain);
    if (!config) {
      return res.redirect(`${FRONTEND_URL}/login?error=tenant_not_found`);
    }

    const redirectUri = `${getBackendBaseUrl(req)}/api/auth/microsoft/callback`;
    const tenant = config.authorityTenant || config.domain;
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[Microsoft Auth] Token exchange failed:', tokenRes.status, errBody);
      return res.redirect(`${FRONTEND_URL}/login?error=token_exchange_failed`);
    }

    const tokens = (await tokenRes.json()) as { id_token?: string };
    const idToken = tokens.id_token;
    if (!idToken) {
      return res.redirect(`${FRONTEND_URL}/login?error=no_id_token`);
    }

    const { email: tokenEmail, error: verifyError } = await verifyMicrosoftIdToken(idToken);
    if (verifyError || !tokenEmail) {
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(verifyError || 'Invalid token')}`);
    }

    const result = await authenticateUserWithOAuth(tokenEmail, idToken);
    if ('error' in result) {
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(result.error)}`);
    }

    const token = result.token;
    res.cookie('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (err: any) {
    console.error('[Microsoft Auth] Callback error:', err);
    res.redirect(`${FRONTEND_URL}/login?error=callback_failed`);
  }
});

function getBackendBaseUrl(req: express.Request): string {
  if (process.env.BACKEND_PUBLIC_URL) {
    return process.env.BACKEND_PUBLIC_URL.replace(/\/$/, '');
  }
  const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3001';
  return `${protocol}://${host}`;
}

export default router;
