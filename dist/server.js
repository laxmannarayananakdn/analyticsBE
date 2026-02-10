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
import supersetRoutes from './routes/superset';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
// Middleware
app.use(cors({
    origin: CORS_ORIGIN,
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
app.use('/api/superset', supersetRoutes);
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
            superset: '/api/superset'
        }
    });
});
// Error handling middleware
app.use((err, req, res, next) => {
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
// Initialize database connection on startup
async function startServer() {
    try {
        console.log('🚀 Starting server...');
        // Test database connection
        console.log('🔌 Testing database connection...');
        await getConnection();
        console.log('✅ Database connection established');
        // Start server with extended timeout for data sync operations
        const server = app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`📡 CORS enabled for: ${CORS_ORIGIN}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
        // Set server timeout to 10 minutes for long-running data sync operations
        // This is needed for large datasets (students, staff, classes, etc.)
        server.timeout = 600000; // 10 minutes
        server.keepAliveTimeout = 600000;
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
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
//# sourceMappingURL=server.js.map