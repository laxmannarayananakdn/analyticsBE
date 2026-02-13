/**
 * Authentication Service
 * Handles user authentication, password management, and JWT token generation
 */
import { User, LoginRequest, ChangePasswordRequest, CreateUserRequest, JwtPayload } from '../types/auth.js';
/**
 * Generate a secure temporary password
 */
export declare function generateTemporaryPassword(): string;
/**
 * Validate password complexity
 */
export declare function validatePasswordComplexity(password: string): {
    valid: boolean;
    error?: string;
};
/**
 * Hash a password using bcrypt
 */
export declare function hashPassword(password: string): Promise<string>;
/**
 * Compare password with hash
 */
export declare function comparePassword(password: string, hash: string): Promise<boolean>;
/**
 * Generate JWT token for user
 */
export declare function generateToken(user: User): string;
/**
 * Verify JWT token
 */
export declare function verifyToken(token: string): JwtPayload | null;
/**
 * Get user by email
 */
export declare function getUserByEmail(email: string): Promise<User | null>;
/**
 * Get user by User_ID (email)
 */
export declare function getUserById(userId: string): Promise<User | null>;
/**
 * Authenticate user with email and password
 */
export declare function authenticateUser(loginRequest: LoginRequest): Promise<{
    user: User;
    token: string;
} | {
    error: string;
}>;
/**
 * Change user password
 */
export declare function changePassword(email: string, changeRequest: ChangePasswordRequest): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Create a new user
 */
export declare function createUser(createRequest: CreateUserRequest): Promise<{
    user: User;
    temporaryPassword?: string;
    error?: string;
}>;
/**
 * Set password (unauthenticated) - for first login when user has temporary password.
 * Validates current (temporary) password, then sets new password and clears Is_Temporary_Password.
 */
export declare function setPassword(email: string, currentPassword: string, newPassword: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Reset user password (generates new temporary password)
 */
export declare function resetPassword(email: string, resetBy: string): Promise<{
    temporaryPassword: string;
    error?: string;
}>;
//# sourceMappingURL=AuthService.d.ts.map