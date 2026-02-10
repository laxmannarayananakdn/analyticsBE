/**
 * Express Server Setup
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getConnection, closeConnection } from './config/database';

// Import routes
import healthRoutes from './routes/health';
import schoolsRoutes from './routes/schools';
import studentsRoutes from './routes/students';
import termGradesRoutes from './routes/termGrades';
import analyticsRoutes from './routes/analytics';
import manageBacRoutes from './routes/managebac';
import manageBacConfigRoutes from './routes/managebacConfig';
import efRoutes from './routes/ef';
import nexquareRoutes from './routes/nexquare';
import nexquareConfigRoutes from './routes/nexquareConfig';
import rpConfigRoutes from './routes/rpConfig';
import supersetRoutes from './routes/superset';
// Auth and access control routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import departmentRoutes from './routes/departments';
import nodeRoutes from './routes/nodes';
import nodeSchoolRoutes from './routes/nodeSchools';
import schoolNodeRoutes from './routes/schoolNode';
import userAccessRoutes from './routes/userAccess';
import userMeRoutes from './routes/userMe';
import adminSchoolsRoutes from './routes/adminSchools';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
// Comma-separated list of allowed origins, or single origin (e.g. https://your-app.azurestaticapps.net)
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const corsOrigins = CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);

// Middleware
app.use(cors({
  origin: corsOrigins.length > 1 ? corsOrigins : (corsOrigins[0] || 'http://localhost:5173'),
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/users', userRoutes);
app.use('/api/users', userMeRoutes); // User query endpoints (/users/me/*)
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
    console.log(`📡 CORS enabled for: ${CORS_ORIGIN}`);
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

