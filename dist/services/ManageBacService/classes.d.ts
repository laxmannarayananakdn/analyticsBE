/**
 * Classes Methods
 * Handles fetching classes from ManageBac API
 */
import type { Class } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function getClasses(this: BaseManageBacService, apiKey: string, baseUrl?: string): Promise<Class[]>;
export declare function getClassById(this: BaseManageBacService, apiKey: string, classId: number, baseUrl?: string): Promise<Class | null>;
//# sourceMappingURL=classes.d.ts.map