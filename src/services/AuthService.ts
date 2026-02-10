/**
 * Authentication Service
 * Handles user authentication, password management, and JWT token generation
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { executeQuery } from '../config/database';
import { User, LoginRequest, ChangePasswordRequest, CreateUserRequest, JwtPayload } from '../types/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Generate a secure temporary password
 */
export function generateTemporaryPassword(): string {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  // Ensure at least one of each required character type
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // Number
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // Special char
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Validate password complexity
 */
export function validatePasswordComplexity(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }
  
  return { valid: true };
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token for user
 */
export function generateToken(user: User): string {
  const payload: JwtPayload = {
    email: user.Email,
    userId: user.User_ID,
    authType: user.Auth_Type,
  };
  
  const secret = JWT_SECRET || 'fallback-secret';
  return jwt.sign(
    payload,
    secret,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await executeQuery<User>(
    `SELECT * FROM admin.[User] WHERE Email = @email`,
    { email }
  );
  
  if (result.error || !result.data || result.data.length === 0) {
    return null;
  }
  
  return result.data[0];
}

/**
 * Get user by User_ID (email)
 */
export async function getUserById(userId: string): Promise<User | null> {
  const result = await executeQuery<User>(
    `SELECT * FROM admin.[User] WHERE User_ID = @userId`,
    { userId }
  );
  
  if (result.error || !result.data || result.data.length === 0) {
    return null;
  }
  
  return result.data[0];
}

/**
 * Authenticate user with email and password
 */
export async function authenticateUser(loginRequest: LoginRequest): Promise<{ user: User; token: string } | { error: string }> {
  const { email, password } = loginRequest;
  
  // Get user
  const user = await getUserByEmail(email);
  if (!user) {
    return { error: 'Invalid email or password' };
  }
  
  // Check if user is active
  if (!user.Is_Active) {
    return { error: 'User account is inactive' };
  }
  
  // Check if temporary password needs to be reset
  if (user.Is_Temporary_Password) {
    return { error: 'PASSWORD_CHANGE_REQUIRED' };
  }
  
  // For password authentication
  if (user.Auth_Type === 'Password') {
    if (!password) {
      return { error: 'Password is required' };
    }
    
    if (!user.Password_Hash) {
      return { error: 'Password not set for user' };
    }
    
    const isValid = await comparePassword(password, user.Password_Hash);
    if (!isValid) {
      return { error: 'Invalid email or password' };
    }
  }
  
  // For OAuth authentication (Microsoft App Registration)
  // In a real implementation, you would verify the OAuth token here
  // For now, we'll assume OAuth users don't need password verification
  
  // Update last login
  await executeQuery(
    `UPDATE admin.[User] SET Last_Login = GETDATE() WHERE User_ID = @userId`,
    { userId: user.User_ID }
  );
  
  // Generate token
  const token = generateToken(user);
  
  return { user, token };
}

/**
 * Change user password
 */
export async function changePassword(
  email: string,
  changeRequest: ChangePasswordRequest
): Promise<{ success: boolean; error?: string }> {
  const { currentPassword, newPassword } = changeRequest;
  
  // Validate new password complexity
  const validation = validatePasswordComplexity(newPassword);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  // Get user
  const user = await getUserByEmail(email);
  if (!user) {
    return { success: false, error: 'User not found' };
  }
  
  if (!user.Is_Active) {
    return { success: false, error: 'User account is inactive' };
  }
  
  // Verify current password (if not temporary password)
  if (!user.Is_Temporary_Password && user.Password_Hash) {
    if (currentPassword === undefined || currentPassword === '') {
      return { success: false, error: 'Current password is required' };
    }
    const isValid = await comparePassword(currentPassword, user.Password_Hash);
    if (!isValid) {
      return { success: false, error: 'Current password is incorrect' };
    }
  }
  
  // Hash new password
  const passwordHash = await hashPassword(newPassword);
  
  // Update password and clear temporary flag
  const result = await executeQuery(
    `UPDATE admin.[User] 
     SET Password_Hash = @passwordHash, 
         Is_Temporary_Password = 0,
         Modified_Date = GETDATE()
     WHERE User_ID = @userId`,
    { passwordHash, userId: user.User_ID }
  );
  
  if (result.error) {
    return { success: false, error: result.error };
  }
  
  return { success: true };
}

/**
 * Create a new user
 */
export async function createUser(createRequest: CreateUserRequest): Promise<{ user: User; temporaryPassword?: string; error?: string }> {
  const { email, displayName, authType, password, createdBy } = createRequest;
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { user: null as any, error: 'Invalid email format' };
  }
  
  // Check if user already exists
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    return { user: null as any, error: 'User with this email already exists' };
  }
  
  let passwordHash: string | null = null;
  let temporaryPassword: string | undefined;
  let isTemporaryPassword = 0;
  
  if (authType === 'Password') {
    if (password) {
      // Validate password complexity
      const validation = validatePasswordComplexity(password);
      if (!validation.valid) {
        return { user: null as any, error: validation.error };
      }
      passwordHash = await hashPassword(password);
    } else {
      // Generate temporary password
      temporaryPassword = generateTemporaryPassword();
      passwordHash = await hashPassword(temporaryPassword);
      isTemporaryPassword = 1;
    }
  }
  
  // Insert user (User_ID = Email enforced by constraint)
  const result = await executeQuery<User>(
    `INSERT INTO admin.[User] 
     (User_ID, Email, Display_Name, Auth_Type, Password_Hash, Is_Temporary_Password, Is_Active, Created_By)
     VALUES (@userId, @email, @displayName, @authType, @passwordHash, @isTemporaryPassword, 1, @createdBy);
     SELECT * FROM admin.[User] WHERE User_ID = @userId`,
    {
      userId: email,
      email,
      displayName: displayName || null,
      authType,
      passwordHash,
      isTemporaryPassword,
      createdBy,
    }
  );
  
  if (result.error || !result.data || result.data.length === 0) {
    return { user: null as any, error: result.error || 'Failed to create user' };
  }
  
  return { user: result.data[0], temporaryPassword };
}

/**
 * Reset user password (generates new temporary password)
 */
export async function resetPassword(email: string, resetBy: string): Promise<{ temporaryPassword: string; error?: string }> {
  const user = await getUserByEmail(email);
  if (!user) {
    return { temporaryPassword: '', error: 'User not found' };
  }
  
  if (user.Auth_Type !== 'Password') {
    return { temporaryPassword: '', error: 'Password reset is only available for password-based authentication' };
  }
  
  // Generate temporary password
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  
  // Update password and set temporary flag
  const result = await executeQuery(
    `UPDATE admin.[User] 
     SET Password_Hash = @passwordHash, 
         Is_Temporary_Password = 1,
         Modified_Date = GETDATE()
     WHERE User_ID = @userId`,
    { passwordHash, userId: user.User_ID }
  );
  
  if (result.error) {
    return { temporaryPassword: '', error: result.error };
  }
  
  return { temporaryPassword };
}
