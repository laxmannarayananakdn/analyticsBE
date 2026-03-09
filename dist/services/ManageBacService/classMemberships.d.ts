/**
 * Class Memberships Sync Methods
 * Handles syncing class memberships for year groups from ManageBac API
 */
import type { BaseManageBacService } from './BaseManageBacService.js';
/**
 * Sync class memberships for all year groups in the current school.
 * Required before term-grades sync (term grades use MB.class_memberships to find classes).
 */
export declare function syncMembershipsForSchool(this: BaseManageBacService, apiKey: string, baseUrl?: string): Promise<void>;
export declare function syncClassMembershipsForYearGroup(this: BaseManageBacService, apiKey: string, yearGroupId: number, baseUrl?: string): Promise<void>;
//# sourceMappingURL=classMemberships.d.ts.map