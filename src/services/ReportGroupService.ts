/**
 * Report Group Service
 * CRUD for report groups, group-report assignments, and user-report-group assignments.
 * Reports = Superset dashboards (by UUID).
 */

import { executeQuery } from '../config/database.js';

export interface ReportGroup {
  Report_Group_ID: string;
  Group_Name: string;
  Group_Description: string | null;
}

/**
 * Get all report groups
 */
export async function getAllReportGroups(): Promise<ReportGroup[]> {
  const result = await executeQuery<ReportGroup>(
    `SELECT Report_Group_ID, Group_Name, Group_Description FROM admin.Report_Group ORDER BY Group_Name`,
    {}
  );
  if (result.error) throw new Error(result.error);
  return result.data || [];
}

/**
 * Get report group by ID
 */
export async function getReportGroupById(reportGroupId: string): Promise<ReportGroup | null> {
  const result = await executeQuery<ReportGroup>(
    `SELECT Report_Group_ID, Group_Name, Group_Description FROM admin.Report_Group WHERE Report_Group_ID = @reportGroupId`,
    { reportGroupId }
  );
  if (result.error) throw new Error(result.error);
  return result.data && result.data.length > 0 ? result.data[0] : null;
}

/**
 * Create report group
 */
export async function createReportGroup(
  reportGroupId: string,
  groupName: string,
  groupDescription: string | null,
  createdBy: string
): Promise<ReportGroup> {
  const result = await executeQuery<ReportGroup>(
    `INSERT INTO admin.Report_Group (Report_Group_ID, Group_Name, Group_Description, Created_By)
     VALUES (@reportGroupId, @groupName, @groupDescription, @createdBy);
     SELECT Report_Group_ID, Group_Name, Group_Description FROM admin.Report_Group WHERE Report_Group_ID = @reportGroupId`,
    { reportGroupId, groupName, groupDescription, createdBy }
  );
  if (result.error) throw new Error(result.error);
  if (!result.data || result.data.length === 0) throw new Error('Failed to create report group');
  return result.data[0];
}

/**
 * Update report group
 */
export async function updateReportGroup(
  reportGroupId: string,
  groupName: string,
  groupDescription: string | null
): Promise<ReportGroup> {
  const result = await executeQuery<ReportGroup>(
    `UPDATE admin.Report_Group SET Group_Name = @groupName, Group_Description = @groupDescription WHERE Report_Group_ID = @reportGroupId;
     SELECT Report_Group_ID, Group_Name, Group_Description FROM admin.Report_Group WHERE Report_Group_ID = @reportGroupId`,
    { reportGroupId, groupName, groupDescription }
  );
  if (result.error) throw new Error(result.error);
  if (!result.data || result.data.length === 0) throw new Error('Report group not found');
  return result.data[0];
}

/**
 * Delete report group (cascades to Report_Group_Report and User_Report_Group)
 */
export async function deleteReportGroup(reportGroupId: string): Promise<void> {
  const result = await executeQuery(
    `DELETE FROM admin.Report_Group WHERE Report_Group_ID = @reportGroupId`,
    { reportGroupId }
  );
  if (result.error) throw new Error(result.error);
}

/**
 * Get dashboard UUIDs in a report group
 */
export async function getReportGroupReports(reportGroupId: string): Promise<string[]> {
  const result = await executeQuery<{ Dashboard_UUID: string }>(
    `SELECT Dashboard_UUID FROM admin.Report_Group_Report WHERE Report_Group_ID = @reportGroupId ORDER BY Dashboard_UUID`,
    { reportGroupId }
  );
  if (result.error) throw new Error(result.error);
  return (result.data || []).map((r) => r.Dashboard_UUID);
}

/**
 * Set report group's dashboard list (replaces existing)
 */
export async function setReportGroupReports(
  reportGroupId: string,
  dashboardUuids: string[],
  createdBy: string
): Promise<void> {
  const group = await getReportGroupById(reportGroupId);
  if (!group) throw new Error('Report group not found');

  await executeQuery(`DELETE FROM admin.Report_Group_Report WHERE Report_Group_ID = @reportGroupId`, { reportGroupId });

  if (dashboardUuids.length === 0) return;

  const insertParts: string[] = [];
  const params: Record<string, any> = { reportGroupId, createdBy };
  dashboardUuids.forEach((uuid, i) => {
    insertParts.push(`(@reportGroupId, @uuid${i}, @createdBy)`);
    params[`uuid${i}`] = uuid;
  });

  const sql = `INSERT INTO admin.Report_Group_Report (Report_Group_ID, Dashboard_UUID, Created_By) VALUES ${insertParts.join(', ')}`;
  const result = await executeQuery(sql, params);
  if (result.error) throw new Error(result.error);
}

/**
 * Get report group IDs assigned to a user
 */
export async function getUserReportGroups(email: string): Promise<string[]> {
  const result = await executeQuery<{ Report_Group_ID: string }>(
    `SELECT Report_Group_ID FROM admin.User_Report_Group WHERE User_ID = @email ORDER BY Report_Group_ID`,
    { email }
  );
  if (result.error) throw new Error(result.error);
  return (result.data || []).map((r) => r.Report_Group_ID);
}

/**
 * Set report groups for a user (replaces existing)
 */
export async function setUserReportGroups(
  email: string,
  reportGroupIds: string[],
  createdBy: string
): Promise<void> {
  const userResult = await executeQuery(`SELECT User_ID FROM admin.[User] WHERE User_ID = @email`, { email });
  if (userResult.error || !userResult.data || userResult.data.length === 0) {
    throw new Error('User not found');
  }

  await executeQuery(`DELETE FROM admin.User_Report_Group WHERE User_ID = @email`, { email });

  if (reportGroupIds.length === 0) return;

  const insertParts = reportGroupIds.map((_, i) => `(@email, @groupId${i}, @createdBy)`);
  const params: Record<string, any> = { email, createdBy };
  reportGroupIds.forEach((gid, i) => {
    params[`groupId${i}`] = gid;
  });

  const sql = `INSERT INTO admin.User_Report_Group (User_ID, Report_Group_ID, Created_By) VALUES ${insertParts.join(', ')}`;
  const result = await executeQuery(sql, params);
  if (result.error) throw new Error(result.error);
}
