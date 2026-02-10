/**
 * Authentication and Authorization Middleware
 */
import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                email: string;
                userId: string;
                authType: 'AppRegistration' | 'Password';
            };
        }
    }
}
/**
 * Authentication middleware - verifies JWT token
 */
export declare function authenticate(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Optional authentication middleware - doesn't fail if no token
 */
export declare function optionalAuthenticate(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Admin authorization middleware
 * For now, we'll use a simple check - in production, you might want to add an admin flag
 * or check against a specific admin user list
 */
export declare function requireAdmin(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map