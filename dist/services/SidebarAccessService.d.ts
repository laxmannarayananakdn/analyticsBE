/**
 * Sidebar Access Service
 * RBAC: which sidebar items each user can see
 * - No rows for a user = full access (backwards compatible)
 * - Has rows = only listed items are visible
 */
export interface SidebarItem {
    id: string;
    label: string;
    category: 'main' | 'report' | 'admin';
    folder?: string;
}
export interface SidebarAccessMatrix {
    users: {
        email: string;
        displayName: string | null;
    }[];
    items: SidebarItem[];
    permissions: Record<string, string[]>;
}
/**
 * Get all sidebar items (static + dynamic reports from superset_dashboard_configs)
 */
export declare function getSidebarItems(): Promise<SidebarItem[]>;
/**
 * Get item IDs the user is allowed to see.
 * Returns empty array = user has full access (no restrictions).
 */
export declare function getUserSidebarAccess(email: string): Promise<string[]>;
/**
 * Set sidebar access for a user. Replaces all existing.
 * itemIds: list of item ids to grant. Empty = revoke all (user gets full access per our logic).
 */
export declare function setUserSidebarAccess(email: string, itemIds: string[], createdBy: string): Promise<void>;
/**
 * Get full matrix for admin UI: users, items, permissions
 */
export declare function getSidebarAccessMatrix(): Promise<SidebarAccessMatrix>;
//# sourceMappingURL=SidebarAccessService.d.ts.map