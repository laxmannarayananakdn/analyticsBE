/**
 * Authentication Methods
 * Handles authentication with ManageBac API
 */
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function authenticate(this: BaseManageBacService, apiKey: string, baseUrl?: string): Promise<{
    success: boolean;
    error?: string;
    details?: any;
}>;
//# sourceMappingURL=auth.d.ts.map