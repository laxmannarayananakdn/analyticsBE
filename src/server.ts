/**
 * Express Server Setup
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { getConnection, closeConnection } from './config/database.js';

// Import routes
import healthRoutes from './routes/health.js';
import schoolsRoutes from './routes/schools.js';
import studentsRoutes from './routes/students.js';
import termGradesRoutes from './routes/termGrades.js';
import analyticsRoutes from './routes/analytics.js';
import manageBacRoutes from './routes/managebac.js';
import manageBacConfigRoutes from './routes/managebacConfig.js';
import efRoutes from './routes/ef.js';
import nexquareRoutes from './routes/nexquare.js';
import nexquareConfigRoutes from './routes/nexquareConfig.js';
import rpConfigRoutes from './routes/rpConfig.js';
import supersetRoutes from './routes/superset.js';
// Auth and access control routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import departmentRoutes from './routes/departments.js';
import nodeRoutes from './routes/nodes.js';
import nodeSchoolRoutes from './routes/nodeSchools.js';
import schoolNodeRoutes from './routes/schoolNode.js';
import userAccessRoutes from './routes/userAccess.js';
import userMeRoutes from './routes/userMe.js';
import adminSchoolsRoutes from './routes/adminSchools.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration - UPDATED to support Superset embedding
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const corsOrigins = CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);

// Always include these origins for Superset embedding
const defaultOrigins = [
  'http://localhost:5173',                              // Vite dev server
  'http://localhost:3000',                              // React dev server
  'http://localhost:3001',                              // Backend (for same-origin requests)
  'https://superset-edtech-app.azurewebsites.net',      // Superset instance
];

// Combine default origins with environment-configured origins
const allOrigins = [...new Set([...defaultOrigins, ...corsOrigins])];

console.log('🔒 CORS enabled for origins:', allOrigins);

// Middleware
app.use(cors({
  origin: allOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/schools', schoolsRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/term-grades', termGradesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/managebac', manageBacRoutes);
app.use('/api/managebac-config', manageBacConfigRoutes);
app.use('/api/ef', efRoutes);
app.use('/api/nexquare', nexquareRoutes);
app.use('/api/nexquare-config', nexquareConfigRoutes);
app.use('/api/rp-config', rpConfigRoutes);
app.use('/api/superset', supersetRoutes);
// Auth and access control routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userMeRoutes); // Must be before userRoutes so /me doesn't match /:email
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/nodes', nodeSchoolRoutes); // School assignment routes (/nodes/:id/schools)
app.use('/api/schools', schoolNodeRoutes); // Get node for school (/schools/:id/:source/node)
app.use('/api/admin/schools', adminSchoolsRoutes); // Get available schools for assignment
app.use('/api/users', userAccessRoutes); // User access management routes

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Data Analytics API Server',
    version: '1.0.0',
      endpoints: {
        health: '/api/health',
        schools: '/api/schools',
        students: '/api/students',
        termGrades: '/api/term-grades',
        analytics: '/api/analytics',
        managebac: '/api/managebac',
        managebacConfig: '/api/managebac-config',
        ef: '/api/ef',
        nexquare: '/api/nexquare',
        nexquareConfig: '/api/nexquare-config',
        rpConfig: '/api/rp-config',
        superset: '/api/superset',
        auth: '/api/auth',
        users: '/api/users',
        departments: '/api/departments',
        nodes: '/api/nodes'
      }
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start HTTP server first so the app always responds (and sends CORS headers).
// DB connection is attempted in background; /api/health reports DB status.
async function startServer() {
  console.log('🚀 Starting server...');

  const server = app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📡 CORS enabled for: ${allOrigins.join(', ')}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // 10 minutes for long-running data sync operations (large datasets, etc.)
  server.timeout = 600000;
  server.keepAliveTimeout = 600000;

  // Try DB in background so startup is not blocked (CORS and /api/health still work if DB fails)
  try {
    console.log('🔌 Testing database connection...');
    await getConnection();
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('⚠️ Database connection failed at startup (app is up; /api/health will report status):', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await closeConnection();
  process.exit(0);
});

startServer();