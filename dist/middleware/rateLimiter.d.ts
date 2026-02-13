/**
 * Rate Limiting Middleware
 */
/**
 * Rate limiter for login endpoint (strict - actual login attempts)
 */
export declare const loginRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Lenient rate limiter for tenant-config-by-domain (read-only lookup as user types email)
 */
export declare const tenantConfigLookupRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * General API rate limiter
 */
export declare const apiRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=rateLimiter.d.ts.map