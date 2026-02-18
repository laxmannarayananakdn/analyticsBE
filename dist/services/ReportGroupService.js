/**
 * Report Group Service
 * CRUD for report groups, group-report assignments, and user-report-group assignments.
 * Reports = Superset dashboards (by UUID).
 */
import { executeQuery } from '../config/database.js';
/**
 * Get all report groups
 */
export async function getAllReportGroups() {
    const result = await executeQuery(`SELECT Report_Group_ID, Group_Name, Group_Description FROM admin.Report_Group ORDER BY Group_Name`, {});
    if (result.error)
        throw new Error(result.error);
    return result.data || [];
}
/**
 * Get report group by ID
 */
export async function getReportGroupById(reportGroupId) {
    const result = await executeQuery(`SELECT Report_Group_ID, Group_Name, Group_Description FROM admin.Report_Group WHERE Report_Group_ID = @reportGroupId`, { reportGroupId });
    if (result.error)
        throw new Error(result.error);
    return result.data && result.data.length > 0 ? result.data[0] : null;
}
/**
 * Create report group
 */
export async function createReportGroup(reportGroupId, groupName, groupDescription, createdBy) {
    const result = await executeQuery(`INSERT INTO admin.Report_Group (Report_Group_ID, Group_Name, Group_Description, Created_By)
     VALUES (@reportGroupId, @groupName, @groupDescription, @createdBy);
     SELECT Report_Group_ID, Group_Name, Group_Description FROM admin.Report_Group WHERE Report_Group_ID = @reportGroupId`, { reportGroupId, groupName, groupDescription, createdBy });
    if (result.error)
        throw new Error(result.error);
    if (!result.data || result.data.length === 0)
        throw new Error('Failed to create report group');
    return result.data[0];
}
/**
 * Update report group
 */
export async function updateReportGroup(reportGroupId, groupName, groupDescription) {
    const result = await executeQuery(`UPDATE admin.Report_Group SET Group_Name = @groupName, Group_Description = @groupDescription WHERE Report_Group_ID = @reportGroupId;
     SELECT Report_Group_ID, Group_Name, Group_Description FROM admin.Report_Group WHERE Report_Group_ID = @reportGroupId`, { reportGroupId, groupName, groupDescription });
    if (result.error)
        throw new Error(result.error);
    if (!result.data || result.data.length === 0)
        throw new Error('Report group not found');
    return result.data[0];
}
/**
 * Delete report group (cascades to Report_Group_Report and User_Report_Group)
 */
export async function deleteReportGroup(reportGroupId) {
    const result = await executeQuery(`DELETE FROM admin.Report_Group WHERE Report_Group_ID = @reportGroupId`, { reportGroupId });
    if (result.error)
        throw new Error(result.error);
}
/**
 * Get dashboard UUIDs in a report group
 */
export async function getReportGroupReports(reportGroupId) {
    const result = await executeQuery(`SELECT Dashboard_UUID FROM admin.Report_Group_Report WHERE Report_Group_ID = @reportGroupId ORDER BY Dashboard_UUID`, { reportGroupId });
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map((r) => r.Dashboard_UUID);
}
/**
 * Set report group's dashboard list (replaces existing)
 */
export async function setReportGroupReports(reportGroupId, dashboardUuids, createdBy) {
    const group = await getReportGroupById(reportGroupId);
    if (!group)
        throw new Error('Report group not found');
    await executeQuery(`DELETE FROM admin.Report_Group_Report WHERE Report_Group_ID = @reportGroupId`, { reportGroupId });
    if (dashboardUuids.length === 0)
        return;
    const insertParts = [];
    const params = { reportGroupId, createdBy };
    dashboardUuids.forEach((uuid, i) => {
        insertParts.push(`(@reportGroupId, @uuid${i}, @createdBy)`);
        params[`uuid${i}`] = uuid;
    });
    const sql = `INSERT INTO admin.Report_Group_Report (Report_Group_ID, Dashboard_UUID, Created_By) VALUES ${insertParts.join(', ')}`;
    const result = await executeQuery(sql, params);
    if (result.error)
        throw new Error(result.error);
}
/**
 * Get report group IDs assigned to a user
 */
export async function getUserReportGroups(email) {
    const result = await executeQuery(`SELECT Report_Group_ID FROM admin.User_Report_Group WHERE User_ID = @email ORDER BY Report_Group_ID`, { email });
    if (result.error)
        throw new Error(result.error);
    return (result.data || []).map((r) => r.Report_Group_ID);
}
/**
 * Set report groups for a user (replaces existing)
 */
export async function setUserReportGroups(email, reportGroupIds, createdBy) {
    const userResult = await executeQuery(`SELECT User_ID FROM admin.[User] WHERE User_ID = @email`, { email });
    if (userResult.error || !userResult.data || userResult.data.length === 0) {
        throw new Error('User not found');
    }
    await executeQuery(`DELETE FROM admin.User_Report_Group WHERE User_ID = @email`, { email });
    if (reportGroupIds.length === 0)
        return;
    const insertParts = reportGroupIds.map((_, i) => `(@email, @groupId${i}, @createdBy)`);
    const params = { email, createdBy };
    reportGroupIds.forEach((gid, i) => {
        params[`groupId${i}`] = gid;
    });
    const sql = `INSERT INTO admin.User_Report_Group (User_ID, Report_Group_ID, Created_By) VALUES ${insertParts.join(', ')}`;
    const result = await executeQuery(sql, params);
    if (result.error)
        throw new Error(result.error);
}
//# sourceMappingURL=ReportGroupService.js.map