/**
 * Configuration Loader Middleware
 * Loads and caches API configurations from database per request
 */
import { Request, Response, NextFunction } from 'express';
export interface NexquareConfig {
    id: number;
    client_id: string;
    client_secret: string;
    domain_url: string;
    school_name: string;
    school_id?: string | null;
}
export interface ManageBacConfig {
    id: number;
    api_token: string;
    base_url: string;
    school_name: string;
    school_id?: number | null;
}
declare global {
    namespace Express {
        interface Request {
            nexquareConfig?: NexquareConfig;
            manageBacConfig?: ManageBacConfig;
        }
    }
}
/**
 * Middleware to load Nexquare config from database
 * Looks for config_id in query params or body
 */
export declare const loadNexquareConfig: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Middleware to load ManageBac config from database
 * Looks for config_id in query params or body
 */
export declare const loadManageBacConfig: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=configLoader.d.ts.map