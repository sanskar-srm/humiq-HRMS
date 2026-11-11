import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config/env.js';
import { db, dbMode } from './db/index.js';
import { authRouter, employeeAuthRouter } from './modules/auth/auth.routes.js';
import { employeesRouter } from './modules/employees/employees.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { workforceRouter } from './modules/workforce/workforce.routes.js';
import { offboardingRouter } from './modules/offboarding/offboarding.routes.js';
import { attendanceRouter } from './modules/attendance/attendance.routes.js';
import { compensationRouter } from './modules/compensation/compensation.routes.js';
import { payrollRouter } from './modules/payroll/payroll.routes.js';
import { onboardingRouter } from './modules/onboarding/onboarding.routes.js';
import { recruitmentRouter, publicRecruitmentRouter } from './modules/recruitment/recruitment.routes.js';
import { performanceRouter } from './modules/performance/performance.routes.js';
import { helpdeskRouter } from './modules/helpdesk/helpdesk.routes.js';
import { engagementRouter } from './modules/engagement/engagement.routes.js';
import { relationsRouter } from './modules/relations/relations.routes.js';
import { lmsRouter } from './modules/lms/lms.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { writeLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { logger } from './utils/logger.js';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestLogger);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(writeLimiter);

  app.get('/health', async (_req, res) => {
    try {
      await db.healthCheck?.();
      res.json({
        success: true,
        message: 'HRMS API is healthy',
        data: { status: 'ok', database: dbMode, environment: config.nodeEnv, timestamp: new Date().toISOString() },
      });
    } catch (error) {
      logger.error('Health check failed', error, { database: dbMode });
      res.status(503).json({
        success: false,
        message: 'The API is running but the database is unavailable',
        error: { code: 'DATABASE_UNAVAILABLE', requestId: _req.id },
        data: { status: 'degraded', database: dbMode, environment: config.nodeEnv, timestamp: new Date().toISOString() },
      });
    }
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/employee/auth', employeeAuthRouter);
  app.use('/api/v1/employees', employeesRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/workforce', workforceRouter);
  app.use('/api/v1/offboarding', offboardingRouter);
  app.use('/api/v1/attendance', attendanceRouter);
  app.use('/api/v1/compensation', compensationRouter);
  app.use('/api/v1/payroll', payrollRouter);
  app.use('/api/v1/onboarding', onboardingRouter);
  app.use('/api/v1/recruitment/public', publicRecruitmentRouter);
  app.use('/api/v1/recruitment', recruitmentRouter);
  app.use('/api/v1/performance', performanceRouter);
  app.use('/api/v1/helpdesk', helpdeskRouter);
  app.use('/api/v1/engagement', engagementRouter);
  app.use('/api/v1/relations', relationsRouter);
  app.use('/api/v1/lms', lmsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
