/**
 * Subjects Methods
 * Handles fetching and saving subjects from ManageBac API
 */
import type { Subject } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function getSubjects(this: BaseManageBacService, apiKey: string, baseUrl?: string): Promise<Subject[]>;
//# sourceMappingURL=subjects.d.ts.map