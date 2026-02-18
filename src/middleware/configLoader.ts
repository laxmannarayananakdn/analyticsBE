/**
 * Configuration Loader Middleware
 * Loads and caches API configurations from database per request
 */

import { Request, Response, NextFunction } from 'express';
import { executeQuery } from '../config/database.js';

export interface NexquareConfig {
  id: number;
  client_id: string;
  client_secret: string;
  domain_url: string;
  school_name: string;
  school_id?: string | null;
}

export interface ManageBacConfig {
  id: number;
  api_token: string;
  base_url: string;
  school_name: string;
  school_id?: number | null;
}

// Extend Express Request to include configs
declare global {
  namespace Express {
    interface Request {
      nexquareConfig?: NexquareConfig;
      manageBacConfig?: ManageBacConfig;
    }
  }
}

/**
 * Middleware to load Nexquare config from database
 * Looks for config_id in query params or body
 */
export const loadNexquareConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configIdParam = req.query.config_id || req.body.config_id;
    
    if (!configIdParam) {
      // No config_id provided - skip (for backward compatibility or direct API key usage)
      return next();
    }

    const configId = parseInt(String(configIdParam));
    if (isNaN(configId)) {
      return res.status(400).json({ 
        error: 'Invalid config_id. Must be a number.' 
      });
    }

    const query = `
      SELECT 
        id,
        client_id,
        client_secret,
        domain_url,
        school_name,
        school_id
      FROM NEX.nexquare_school_configs
      WHERE id = @configId AND is_active = 1
    `;

    const result = await executeQuery<NexquareConfig>(query, { configId });

    if (result.error) {
      return res.status(500).json({ 
        error: `Failed to load Nexquare config: ${result.error}` 
      });
    }

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ 
        error: `Nexquare configuration with ID ${configId} not found or inactive` 
      });
    }

    // Attach config to request object for use in route handlers
    req.nexquareConfig = result.data[0];
    next();
  } catch (error: any) {
    console.error('Error loading Nexquare config:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
};

/**
 * Middleware to load ManageBac config from database
 * Looks for config_id in query params or body
 */
export const loadManageBacConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configIdParam = req.query.config_id || req.body.config_id;
    
    if (!configIdParam) {
      // No config_id provided - skip (for backward compatibility or direct API key usage)
      return next();
    }

    const configId = parseInt(String(configIdParam));
    if (isNaN(configId)) {
      return res.status(400).json({ 
        error: 'Invalid config_id. Must be a number.' 
      });
    }

    const query = `
      SELECT 
        id,
        api_token,
        base_url,
        school_name,
        school_id
      FROM MB.managebac_school_configs
      WHERE id = @configId AND is_active = 1
    `;

    const result = await executeQuery<ManageBacConfig>(query, { configId });

    if (result.error) {
      return res.status(500).json({ 
        error: `Failed to load ManageBac config: ${result.error}` 
      });
    }

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({ 
        error: `ManageBac configuration with ID ${configId} not found or inactive` 
      });
    }

    // Attach config to request object for use in route handlers
    req.manageBacConfig = result.data[0];
    console.log(`✅ Loaded ManageBac config ID ${configId}: ${req.manageBacConfig.school_name}, base_url: ${req.manageBacConfig.base_url}`);
    next();
  } catch (error: any) {
    console.error('Error loading ManageBac config:', error);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
};
