/**
 * Analytics API Routes
 */

import { Router, Request, Response } from 'express';
import { databaseService } from '../services/DatabaseService.js';

const router = Router();

/**
 * GET /api/analytics/metrics
 * Get student metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await databaseService.getStudentMetrics();
    res.json(metrics);
  } catch (error: any) {
    console.error('Error fetching student metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/subject-performance
 * Get subject performance data
 */
router.get('/subject-performance', async (req: Request, res: Response) => {
  try {
    const data = await databaseService.getSubjectPerformance();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching subject performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/student-vs-class-average
 * Get student vs class average data
 */
router.get('/student-vs-class-average', async (req: Request, res: Response) => {
  try {
    const data = await databaseService.getStudentVsClassAverage();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching student vs class average:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/performance-by-program
 * Get performance data by program
 */
router.get('/performance-by-program', async (req: Request, res: Response) => {
  try {
    const data = await databaseService.getPerformanceByProgram();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching performance by program:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/attendance-by-grade
 * Get attendance data by grade level
 */
router.get('/attendance-by-grade', async (req: Request, res: Response) => {
  try {
    const data = await databaseService.getAttendanceByGrade();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching attendance by grade:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/demographics
 * Get student demographics by nationality
 */
router.get('/demographics', async (req: Request, res: Response) => {
  try {
    const data = await databaseService.getStudentDemographics();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching demographics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/performance-trends
 * Get performance trends over time
 */
router.get('/performance-trends', async (req: Request, res: Response) => {
  try {
    const data = await databaseService.getPerformanceTrends();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching performance trends:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/analytics/financial-aid-distribution
 * Get financial aid distribution
 */
router.get('/financial-aid-distribution', async (req: Request, res: Response) => {
  try {
    const data = await databaseService.getFinancialAidDistribution();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching financial aid distribution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

