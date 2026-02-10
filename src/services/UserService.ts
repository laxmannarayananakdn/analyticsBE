/**
 * User Management Service
 */

import { executeQuery } from '../config/database.js';
import { User, UpdateUserRequest, CreateUserRequest } from '../types/auth.js';
import { createUser as authCreateUser } from './AuthService.js';

/**
 * Get all users
 */
export async function getAllUsers(): Promise<User[]> {
  const result = await executeQuery<User>(
    `SELECT * FROM admin.[User] ORDER BY Created_Date DESC`
  );
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result.data || [];
}

/**
 * Get user by email/User_ID
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await executeQuery<User>(
    `SELECT * FROM admin.[User] WHERE User_ID = @email OR Email = @email`,
    { email }
  );
  
  if (result.error || !result.data || result.data.length === 0) {
    return null;
  }
  
  return result.data[0];
}

/**
 * Create user (wrapper around AuthService.createUser)
 */
export async function createUser(createRequest: CreateUserRequest) {
  return authCreateUser(createRequest);
}

/**
 * Update user
 */
export async function updateUser(
  email: string,
  updateRequest: UpdateUserRequest
): Promise<User> {
  const updates: string[] = [];
  const params: Record<string, any> = { email };
  
  if (updateRequest.displayName !== undefined) {
    updates.push('Display_Name = @displayName');
    params.displayName = updateRequest.displayName || null;
  }
  
  if (updateRequest.isActive !== undefined) {
    updates.push('Is_Active = @isActive');
    params.isActive = updateRequest.isActive ? 1 : 0;
  }
  
  if (updates.length === 0) {
    const user = await getUserByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
  
  updates.push('Modified_Date = GETDATE()');
  
  const result = await executeQuery<User>(
    `UPDATE admin.[User] 
     SET ${updates.join(', ')}
     WHERE User_ID = @email;
     SELECT * FROM admin.[User] WHERE User_ID = @email`,
    params
  );
  
  if (result.error || !result.data || result.data.length === 0) {
    throw new Error(result.error || 'Failed to update user');
  }
  
  return result.data[0];
}

/**
 * Deactivate user (soft delete)
 */
export async function deactivateUser(email: string): Promise<User> {
  const result = await executeQuery<User>(
    `UPDATE admin.[User] 
     SET Is_Active = 0, Modified_Date = GETDATE()
     WHERE User_ID = @email;
     SELECT * FROM admin.[User] WHERE User_ID = @email`,
    { email }
  );
  
  if (result.error || !result.data || result.data.length === 0) {
    throw new Error(result.error || 'Failed to deactivate user');
  }
  
  return result.data[0];
}
