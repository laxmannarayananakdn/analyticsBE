/**
 * Microsoft OAuth Token Verification
 * Verifies Azure AD / Entra ID tokens using JWKS
 */
/**
 * Verify Microsoft ID token and extract email
 * - Validates signature via JWKS
 * - Ensures aud matches a registered tenant's client_id
 * - Returns email from token payload
 */
export declare function verifyMicrosoftIdToken(idToken: string): Promise<{
    email: string;
    error?: string;
}>;
//# sourceMappingURL=MicrosoftOAuthVerifier.d.ts.map