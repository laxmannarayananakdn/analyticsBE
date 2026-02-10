/**
 * Authentication and Authorization Types
 */

export interface User {
  User_ID: string; // Email address
  Email: string;
  Display_Name: string | null;
  Auth_Type: 'AppRegistration' | 'Password';
  Is_Temporary_Password: boolean;
  Is_Active: boolean;
  Created_Date: Date;
  Modified_Date: Date;
  Created_By: string | null;
  Last_Login: Date | null;
}

export interface Department {
  Department_ID: string;
  Department_Name: string;
  Department_Description: string | null;
  Schema_Name: string | null;
  Display_Order: number | null;
  Created_Date: Date;
  Modified_Date: Date;
  Created_By: string | null;
}

export interface Node {
  Node_ID: string;
  Node_Description: string;
  Is_Head_Office: boolean;
  Parent_Node_ID: string | null;
  Created_Date: Date;
  Modified_Date: Date;
  Created_By: string | null;
}

export interface NodeSchool {
  School_ID: string;
  Node_ID: string;
  School_Source: 'nex' | 'mb';
  Created_Date: Date;
  Modified_Date: Date;
  Created_By: string | null;
}

export interface UserNodeAccess {
  User_ID: string;
  Node_ID: string;
  Department_ID: string;
  Created_Date: Date;
  Modified_Date: Date;
  Created_By: string | null;
}

export interface SchoolAccess {
  School_ID: string;
  School_Source: 'nex' | 'mb';
  Department_ID: string;
}

export interface UserSchoolAccess {
  schoolId: string;
  schoolSource: 'nex' | 'mb';
  departments: string[];
}

export interface JwtPayload {
  email: string;
  userId: string;
  authType: 'AppRegistration' | 'Password';
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  email: string;
  password?: string;
  oauthToken?: string; // For Microsoft OAuth
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserRequest {
  email: string;
  displayName?: string;
  authType: 'AppRegistration' | 'Password';
  password?: string; // Required if authType is 'Password'
  createdBy: string; // Email of admin creating the user
}

export interface UpdateUserRequest {
  displayName?: string;
  isActive?: boolean;
}

export interface CreateDepartmentRequest {
  departmentId: string;
  departmentName: string;
  departmentDescription?: string;
  schemaName?: string;
  displayOrder?: number;
  createdBy: string;
}

export interface UpdateDepartmentRequest {
  departmentName?: string;
  departmentDescription?: string;
  schemaName?: string;
  displayOrder?: number;
}

export interface CreateNodeRequest {
  nodeId: string;
  nodeDescription: string;
  isHeadOffice?: boolean;
  isSchoolNode?: boolean;
  parentNodeId?: string | null;
  createdBy: string;
}

export interface UpdateNodeRequest {
  nodeDescription?: string;
  isHeadOffice?: boolean;
  isSchoolNode?: boolean;
  parentNodeId?: string | null;
}

export interface AssignSchoolRequest {
  schoolId: string;
  schoolSource: 'nex' | 'mb';
  createdBy: string;
}

export interface GrantAccessRequest {
  nodeId: string;
  departmentIds: string[];
}

export interface UpdateAccessRequest {
  departmentIds: string[];
}

export interface NodeTree extends Node {
  children?: NodeTree[];
}
