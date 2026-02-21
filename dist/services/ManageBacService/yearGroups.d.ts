/**
 * Year Groups Methods
 * Handles fetching and saving year groups from ManageBac API
 */
import type { YearGroup } from '../../types/managebac.js';
import type { BaseManageBacService } from './BaseManageBacService.js';
export declare function getYearGroups(this: BaseManageBacService, apiKey: string, baseUrl?: string): Promise<YearGroup[]>;
//# sourceMappingURL=yearGroups.d.ts.map