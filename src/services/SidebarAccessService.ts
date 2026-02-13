/**
 * Sidebar Access Service
 * RBAC: which sidebar items each user can see
 * - No rows for a user = full access (backwards compatible)
 * - Has rows = only listed items are visible
 */

import { executeQuery } from '../config/database.js';

export interface SidebarItem {
  id: string;
  label: string;
  category: 'main' | 'report' | 'admin';
  folder?: string; // for reports: Education, Finance, etc.
}

export interface SidebarAccessMatrix {
  users: { email: string; displayName: string | null }[];
  items: SidebarItem[];
  permissions: Record<string, string[]>; // email -> item ids
}

const ADMIN_ITEMS: { id: string; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'admin:superset-config', label: 'Superset Dashboards Config' },
  { id: 'admin:ef-upload', label: 'Upload External Files' },
  { id: 'admin:nexquare-config', label: 'Nexquare Configuration' },
  { id: 'admin:managebac-config', label: 'ManageBac Configuration' },
  { id: 'admin:nexquare-sync', label: 'Nexquare Data Sync' },
  { id: 'admin:managebac-sync', label: 'ManageBac Data Sync' },
  { id: 'admin:rp-config', label: 'RP Configuration' },
  { id: 'admin:users', label: 'User Management' },
  { id: 'admin:access-control', label: 'Access Control' },
  { id: 'admin:access-groups', label: 'Access Groups' },
  { id: 'admin:sidebar-access', label: 'Sidebar Access' },
  { id: 'admin:microsoft-tenant-config', label: 'Microsoft Tenant Config' },
  { id: 'admin:nodes', label: 'Node Management' },
  { id: 'admin:departments', label: 'Department Management' },
  { id: 'admin:school-assignment', label: 'School Assignment' },
];

/**
 * Get all sidebar items (static + dynamic reports from superset_dashboard_configs)
 */
export async function getSidebarItems(): Promise<SidebarItem[]> {
  const staticItems: SidebarItem[] = ADMIN_ITEMS.map((a, i) => ({
    id: a.id,
    label: a.label,
    category: a.id === 'dashboard' ? 'main' : 'admin',
    folder: undefined,
  }));

  const dashResult = await executeQuery<{ uuid: string; name: string; folder: string | null }>(
    `SELECT uuid, name, folder FROM admin.superset_dashboard_configs WHERE is_active = 1 ORDER BY folder ASC, sort_order ASC, name ASC`
  );

  const reportItems: SidebarItem[] = (dashResult.data || []).map((d) => ({
    id: `report:${d.uuid}`,
    label: d.name,
    category: 'report',
    folder: d.folder || 'Education',
  }));

  // Order: dashboard first, then reports (by folder), then admin items
  const mainItems = staticItems.filter((s) => s.category === 'main');
  const adminItems = staticItems.filter((s) => s.category === 'admin');
  return [...mainItems, ...reportItems, ...adminItems];
}

/**
 * Get item IDs the user is allowed to see.
 * Returns empty array = user has full access (no restrictions).
 */
export async function getUserSidebarAccess(email: string): Promise<string[]> {
  const result = await executeQuery<{ Item_ID: string }>(
    `SELECT Item_ID FROM admin.user_sidebar_access WHERE User_ID = @email`,
    { email }
  );
  const rows = result.data || [];
  if (rows.length === 0) {
    return []; // empty = full access
  }
  return rows.map((r) => r.Item_ID);
}

/**
 * Set sidebar access for a user. Replaces all existing.
 * itemIds: list of item ids to grant. Empty = revoke all (user gets full access per our logic).
 */
export async function setUserSidebarAccess(
  email: string,
  itemIds: string[],
  createdBy: string
): Promise<void> {
  const userCheck = await executeQuery(
    `SELECT User_ID FROM admin.[User] WHERE User_ID = @email`,
    { email }
  );
  if (!userCheck.data || userCheck.data.length === 0) {
    throw new Error('User not found');
  }

  await executeQuery(`DELETE FROM admin.user_sidebar_access WHERE User_ID = @email`, { email });

  for (const itemId of itemIds) {
    const r = await executeQuery(
      `INSERT INTO admin.user_sidebar_access (User_ID, Item_ID, Created_At, Created_By) VALUES (@email, @itemId, SYSDATETIMEOFFSET(), @createdBy)`,
      { email, itemId, createdBy }
    );
    if (r.error) throw new Error(r.error);
  }
}

/**
 * Get full matrix for admin UI: users, items, permissions
 */
export async function getSidebarAccessMatrix(): Promise<SidebarAccessMatrix> {
  const [itemsResult, usersResult, permResult] = await Promise.all([
    getSidebarItems(),
    executeQuery<{ User_ID: string; Display_Name: string | null }>(
      `SELECT User_ID, Display_Name FROM admin.[User] WHERE Is_Active = 1 ORDER BY Display_Name, User_ID`
    ),
    executeQuery<{ User_ID: string; Item_ID: string }>(
      `SELECT User_ID, Item_ID FROM admin.user_sidebar_access`
    ),
  ]);

  const users = (usersResult.data || []).map((u) => ({
    email: u.User_ID,
    displayName: u.Display_Name || null,
  }));

  const permissions: Record<string, string[]> = {};
  for (const p of permResult.data || []) {
    if (!permissions[p.User_ID]) permissions[p.User_ID] = [];
    permissions[p.User_ID].push(p.Item_ID);
  }

  return {
    users,
    items: itemsResult,
    permissions,
  };
}
