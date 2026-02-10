# Hierarchical Access Control System - Implementation Guide

## Overview

This document describes the implementation of the hierarchical access control system with dynamic departments for the Data Analytics platform.

## Architecture

### Database Schema

All access control tables are in the `admin` schema:

- **admin.User**: User accounts (User_ID = Email)
- **admin.Department**: Master table for departments (cannot be deleted)
- **admin.Node**: Organizational hierarchy (cannot be deleted)
- **admin.Node_School**: Maps schools to nodes
- **admin.User_Node_Access**: Maps users to nodes with department permissions

### Key Design Decisions

1. **User_ID = Email**: Enforced by CHECK constraint
2. **No Deletion**: Nodes and Departments cannot be deleted (triggers prevent this)
3. **Soft Delete**: Users are deactivated (Is_Active = 0) instead of deleted
4. **Dynamic Departments**: New departments added via INSERT, no schema changes needed
5. **Additive Permissions**: User access is additive across multiple node assignments

## Setup Instructions

### 1. Database Functions

Execute the SQL script to create all required functions:

```bash
# Run in Azure SQL Database
sqlcmd -S your-server.database.windows.net -d your-database -U your-user -P your-password -i "SQL scripts/admin_functions.sql"
```

This creates:
- `admin.fn_GetUserSchoolAccess(@UserEmail)` - Core permission function
- `admin.fn_FilterAcademicData()` - RLS filter for Academic department
- `admin.fn_FilterHRData()` - RLS filter for HR department
- `admin.fn_FilterFinanceData()` - RLS filter for Finance department
- `admin.fn_FilterOperationsData()` - RLS filter for Operations department
- `admin.fn_GetActiveDepartments()` - Helper function
- `admin.fn_GetUserDepartments(@UserEmail)` - Helper function
- `admin.fn_GetNodeHierarchy(@NodeID)` - Helper function

### 2. Install Dependencies

```bash
cd backend
npm install
```

This installs:
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT token generation
- `express-rate-limit` - Rate limiting for login endpoint

### 3. Environment Variables

Add to your `.env` file:

```env
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=8h
```

**Important**: Use a strong, random secret key in production!

### 4. RLS Policies

Execute the RLS policies script (modify based on your actual table structure):

```bash
sqlcmd -S your-server.database.windows.net -d your-database -U your-user -P your-password -i "SQL scripts/admin_rls_policies.sql"
```

**Note**: The RLS policies script contains templates. You need to:
1. Uncomment the policies for your actual tables
2. Adjust column names (e.g., `school_id`, `School_ID`, etc.)
3. Apply to all department-specific tables in `nex` and `mb` schemas

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login with email/password or OAuth
- `POST /api/auth/logout` - Logout
- `POST /api/auth/change-password` - Change password (required for temporary passwords)

### User Management (Admin)

- `POST /api/users` - Create user
- `GET /api/users` - List all users
- `GET /api/users/:email` - Get user by email
- `PUT /api/users/:email` - Update user
- `PATCH /api/users/:email/deactivate` - Deactivate user (soft delete)
- `POST /api/users/:email/reset-password` - Reset password (generates temporary password)

### Department Management (Admin)

- `POST /api/departments` - Create department
- `GET /api/departments` - List all departments
- `GET /api/departments/:id` - Get department by ID
- `PUT /api/departments/:id` - Update department
- **NO DELETE** - Deletion prevented by database trigger

### Node Management (Admin)

- `POST /api/nodes` - Create node
- `GET /api/nodes` - List all nodes (use `?tree=true` for tree structure)
- `GET /api/nodes/:id` - Get node by ID
- `PUT /api/nodes/:id` - Update node
- **NO DELETE** - Deletion prevented by database trigger

### School Assignment (Admin)

- `POST /api/nodes/:nodeId/schools` - Assign school to node
- `GET /api/nodes/:nodeId/schools` - List schools in node
- `DELETE /api/nodes/:nodeId/schools/:schoolId/:source` - Unassign school
- `GET /api/schools/:schoolId/:source/node` - Get node assignment for school

### User Access Management (Admin)

- `POST /api/users/:email/access` - Grant access to node with departments
- `GET /api/users/:email/access` - List user's node+department assignments
- `PUT /api/users/:email/access/:nodeId` - Update department permissions for node
- `DELETE /api/users/:email/access/:nodeId` - Revoke all access to node
- `DELETE /api/users/:email/access/:nodeId/departments/:departmentId` - Revoke specific department

### User Query Endpoints

- `GET /api/users/me/schools` - Get schools user has access to with departments
- `GET /api/users/me/access` - Get user's node assignments
- `GET /api/users/me/departments` - Get distinct departments user has access to

## Usage Examples

### 1. Create a User

```bash
POST /api/users
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "email": "john@school.com",
  "displayName": "John Doe",
  "authType": "Password"
}
```

Response includes `temporaryPassword` if not provided.

### 2. Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@school.com",
  "password": "TempPass123!"
}
```

If user has temporary password, returns `403` with `PASSWORD_CHANGE_REQUIRED` code.

### 3. Change Password

```bash
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "TempPass123!",
  "newPassword": "NewSecurePass123!"
}
```

### 4. Grant User Access

```bash
POST /api/users/john@school.com/access
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "nodeId": "IN-N",
  "departmentIds": ["ACADEMIC", "HR"]
}
```

### 5. Query User's Schools

```bash
GET /api/users/me/schools
Authorization: Bearer <user-token>
```

Response:
```json
[
  {
    "schoolId": "SCH001",
    "schoolSource": "nex",
    "departments": ["ACADEMIC", "HR"]
  }
]
```

## Adding a New Department

1. **Insert into admin.Department**:
```sql
INSERT INTO admin.Department (Department_ID, Department_Name, Department_Description, Display_Order, Created_By)
VALUES ('MARKETING', 'Marketing', 'Marketing and communications data', 5, 'admin@example.com');
```

2. **Create RLS Filter Function** (if department has dedicated tables):
```sql
CREATE FUNCTION admin.fn_FilterMarketingData(
    @School_ID VARCHAR(50),
    @School_Source VARCHAR(20)
)
RETURNS BIT
WITH SCHEMABINDING
AS
BEGIN
    DECLARE @UserEmail VARCHAR(255) = USER_NAME();
    DECLARE @HasAccess BIT = 0;
    
    IF EXISTS (
        SELECT 1
        FROM admin.fn_GetUserSchoolAccess(@UserEmail) usa
        WHERE usa.School_ID = @School_ID
            AND usa.School_Source = @School_Source
            AND usa.Department_ID = 'MARKETING'
    )
    BEGIN
        SET @HasAccess = 1;
    END
    
    RETURN @HasAccess;
END;
```

3. **Apply RLS Policy**:
```sql
CREATE SECURITY POLICY nex.Marketing_RLS_Policy
ADD FILTER PREDICATE admin.fn_FilterMarketingData(school_id, 'nex')
ON nex.marketing_campaigns;
```

4. **Assign to Users via API**:
```bash
POST /api/users/john@school.com/access
{
  "nodeId": "HQ",
  "departmentIds": ["MARKETING"]
}
```

## Security Considerations

1. **JWT Secret**: Use a strong, random secret key in production
2. **Password Hashing**: Uses bcrypt with 12 salt rounds
3. **Rate Limiting**: Login endpoint limited to 5 attempts per 15 minutes
4. **HTTPS**: Always use HTTPS in production
5. **Temporary Passwords**: Users must change temporary passwords on first login
6. **RLS**: All department-specific data is protected by Row-Level Security

## Testing

### Test Database Functions

```sql
-- Test user school access
SELECT * FROM admin.fn_GetUserSchoolAccess('user@example.com');

-- Test RLS filter
SELECT admin.fn_FilterAcademicData('SCH001', 'nex');

-- Test with EXECUTE AS USER
EXECUTE AS USER = 'user@example.com';
SELECT * FROM nex.students; -- Should only return schools user has access to
REVERT;
```

### Test API Endpoints

Use the provided endpoints with proper authentication tokens. All admin endpoints require:
- Valid JWT token in `Authorization: Bearer <token>` header
- Admin access (currently all authenticated users are admins)

## Troubleshooting

### Issue: "Password change required" on login
- User has `Is_Temporary_Password = 1`
- User must call `/api/auth/change-password` first

### Issue: "Node not found" when assigning school
- Verify node exists: `SELECT * FROM admin.Node WHERE Node_ID = 'NODE_ID'`
- Check node ID spelling

### Issue: RLS not filtering data
- Verify RLS policies are enabled: `SELECT * FROM sys.security_policies`
- Check filter function returns correct values
- Verify `USER_NAME()` returns email address in RLS context

### Issue: Circular reference when updating node parent
- System prevents nodes from being their own ancestor
- Check node hierarchy: `SELECT * FROM admin.fn_GetNodeHierarchy('NODE_ID')`

## Future Enhancements

1. **OAuth Implementation**: Complete Microsoft App Registration OAuth flow
2. **Admin Flag**: Add `Is_Admin` column to User table for proper admin checks
3. **Audit Logging**: Separate audit log table for tracking changes
4. **Bulk Operations**: Add bulk user creation/access assignment endpoints
5. **Password Reset Links**: Email-based password reset with expiration
