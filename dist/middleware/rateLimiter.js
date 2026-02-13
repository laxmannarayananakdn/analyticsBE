/**
 * Rate Limiting Middleware
 */
import rateLimit from 'express-rate-limit';
/**
 * Rate limiter for login endpoint (strict - actual login attempts)
 */
export const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * Lenient rate limiter for tenant-config-by-domain (read-only lookup as user types email)
 */
export const tenantConfigLookupRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute per IP
    message: 'Too many requests, please wait a moment',
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * General API rate limiter
 */
export const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
//# sourceMappingURL=rateLimiter.js.map