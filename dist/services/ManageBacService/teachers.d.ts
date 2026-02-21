/**
 * Teachers Methods
 * Handles fetching and saving teachers from ManageBac API
 */
import type { Teacher } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function getTeachers(this: BaseManageBacService, apiKey: string, filters?: {
    department?: string;
    active_only?: boolean;
}, baseUrl?: string, schoolId?: number, onLog?: (msg: string) => void): Promise<Teacher[]>;
//# sourceMappingURL=teachers.d.ts.map