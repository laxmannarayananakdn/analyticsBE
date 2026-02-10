/**
 * Authentication and Authorization Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, getUserById } from '../services/AuthService';
import { JwtPayload } from '../types/auth';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        email: string;
        userId: string;
        authType: 'AppRegistration' | 'Password';
      };
    }
  }
}

/**
 * Authentication middleware - verifies JWT token
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    
    // Check if user is still active
    const user = await getUserById(payload.userId);
    if (!user || !user.Is_Active) {
      res.status(401).json({ error: 'User account is inactive' });
      return;
    }
    
    // Check if temporary password needs to be reset
    if (user.Is_Temporary_Password) {
      res.status(403).json({ 
        error: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
      return;
    }
    
    // Attach user info to request
    req.user = {
      email: payload.email,
      userId: payload.userId,
      authType: payload.authType,
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      
      if (payload) {
        const user = await getUserById(payload.userId);
        if (user && user.Is_Active && !user.Is_Temporary_Password) {
          req.user = {
            email: payload.email,
            userId: payload.userId,
            authType: payload.authType,
          };
        }
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
}

/**
 * Admin authorization middleware
 * For now, we'll use a simple check - in production, you might want to add an admin flag
 * or check against a specific admin user list
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // For MVP, we'll allow any authenticated user to be admin
  // In production, add Is_Admin flag to User table or check against admin list
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  // TODO: Add proper admin check
  // For now, all authenticated users can perform admin operations
  next();
}
