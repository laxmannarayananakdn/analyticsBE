/**
 * Microsoft OAuth Token Verification
 * Verifies Azure AD / Entra ID tokens using JWKS
 */

import * as jose from 'jose';
import { getTenantConfigByClientId } from './MicrosoftTenantService.js';

/**
 * Decode JWT without verification (to get header/claims)
 */
function decodeTokenUnsafe(token: string): { payload?: any; header?: any } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return { payload, header };
  } catch {
    return null;
  }
}

/**
 * Verify Microsoft ID token and extract email
 * - Validates signature via JWKS
 * - Ensures aud matches a registered tenant's client_id
 * - Returns email from token payload
 */
export async function verifyMicrosoftIdToken(
  idToken: string
): Promise<{ email: string; error?: string }> {
  const decoded = decodeTokenUnsafe(idToken);
  if (!decoded?.payload) {
    return { email: '', error: 'Invalid token format' };
  }

  const { aud, iss, exp } = decoded.payload;

  // Token must have aud (audience = our client_id)
  if (!aud) {
    return { email: '', error: 'Token missing audience' };
  }

  const clientId = typeof aud === 'string' ? aud : aud[0];
  const tenantConfig = await getTenantConfigByClientId(clientId);
  if (!tenantConfig) {
    return { email: '', error: 'Unknown tenant or app registration' };
  }

  // Build JWKS URL from issuer
  // iss format: https://login.microsoftonline.com/{tenant-id}/v2.0
  const issUrl = typeof iss === 'string' ? iss : '';
  const jwksUrl = issUrl.replace('/v2.0', '/discovery/v2.0/keys');
  if (!jwksUrl.startsWith('https://login.microsoftonline.com/')) {
    return { email: '', error: 'Invalid token issuer' };
  }

  try {
    const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));
    const { payload } = await jose.jwtVerify(idToken, JWKS, {
      issuer: issUrl,
      audience: clientId,
    });

    const email =
      (payload as any).preferred_username ||
      (payload as any).email ||
      (payload as any).upn ||
      '';
    if (!email) {
      return { email: '', error: 'Token does not contain email' };
    }

    return { email };
  } catch (err: any) {
    if (err.code === 'ERR_JWT_EXPIRED') {
      return { email: '', error: 'Token expired' };
    }
    return { email: '', error: err.message || 'Token verification failed' };
  }
}
