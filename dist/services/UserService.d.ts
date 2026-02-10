/**
 * User Management Service
 */
import { User, UpdateUserRequest, CreateUserRequest } from '../types/auth.js';
/**
 * Get all users
 */
export declare function getAllUsers(): Promise<User[]>;
/**
 * Get user by email/User_ID
 */
export declare function getUserByEmail(email: string): Promise<User | null>;
/**
 * Create user (wrapper around AuthService.createUser)
 */
export declare function createUser(createRequest: CreateUserRequest): Promise<{
    user: User;
    temporaryPassword?: string;
    error?: string;
}>;
/**
 * Update user
 */
export declare function updateUser(email: string, updateRequest: UpdateUserRequest): Promise<User>;
/**
 * Deactivate user (soft delete)
 */
export declare function deactivateUser(email: string): Promise<User>;
//# sourceMappingURL=UserService.d.ts.map