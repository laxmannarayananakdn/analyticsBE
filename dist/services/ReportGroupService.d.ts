/**
 * Report Group Service
 * CRUD for report groups, group-report assignments, and user-report-group assignments.
 * Reports = Superset dashboards (by UUID).
 */
export interface ReportGroup {
    Report_Group_ID: string;
    Group_Name: string;
    Group_Description: string | null;
}
/**
 * Get all report groups
 */
export declare function getAllReportGroups(): Promise<ReportGroup[]>;
/**
 * Get report group by ID
 */
export declare function getReportGroupById(reportGroupId: string): Promise<ReportGroup | null>;
/**
 * Create report group
 */
export declare function createReportGroup(reportGroupId: string, groupName: string, groupDescription: string | null, createdBy: string): Promise<ReportGroup>;
/**
 * Update report group
 */
export declare function updateReportGroup(reportGroupId: string, groupName: string, groupDescription: string | null): Promise<ReportGroup>;
/**
 * Delete report group (cascades to Report_Group_Report and User_Report_Group)
 */
export declare function deleteReportGroup(reportGroupId: string): Promise<void>;
/**
 * Get dashboard UUIDs in a report group
 */
export declare function getReportGroupReports(reportGroupId: string): Promise<string[]>;
/**
 * Set report group's dashboard list (replaces existing)
 */
export declare function setReportGroupReports(reportGroupId: string, dashboardUuids: string[], createdBy: string): Promise<void>;
/**
 * Get report group IDs assigned to a user
 */
export declare function getUserReportGroups(email: string): Promise<string[]>;
/**
 * Set report groups for a user (replaces existing)
 */
export declare function setUserReportGroups(email: string, reportGroupIds: string[], createdBy: string): Promise<void>;
//# sourceMappingURL=ReportGroupService.d.ts.map