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
/** Admin/dashboard page items for Group_Page_Access (exported for API/UI) */
export declare const ADMIN_ITEMS: {
    id: string;
    label: string;
}[];
/**
 * Get all sidebar items (static + dynamic reports from superset_dashboard_configs)
 */
export declare function getSidebarItems(): Promise<SidebarItem[]>;
/**
 * Get item IDs the user is allowed to see.
 * Returns empty array = user has full access (no restrictions).
 *
 * Sources (union):
 * 1. Pages from User Groups (Group_Page_Access via User_Group)
 * 2. Reports from Report Groups only (User_Report_Group -> Report_Group_Report)
 *
 * Report folders and reports flow from Report Groups alone.
 * Scope (scope_node_id) filtering is not applied here; RLS in Superset handles data filtering per report.
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