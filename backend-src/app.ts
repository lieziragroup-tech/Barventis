import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { authRouter } from './modules/auth/authRoutes.js';
import { projectRouter } from './modules/projects/projectRoutes.js';
import { workReportRouter } from './modules/workReports/workReportRoutes.js';
import { photoRouter } from './modules/photos/photoRoutes.js';
import { adminRouter } from './modules/admin/adminRoutes.js';
import { locationRouter } from './modules/locations/locationRoutes.js';
import { cronRouter } from './modules/photos/cronRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const DEFAULT_RATE_LIMIT_PER_MIN = 600;

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(express.json({ limit: '1mb' }));

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: DEFAULT_RATE_LIMIT_PER_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: req => req.path === '/health' || req.path.startsWith('/cron/'),
    message: { error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' },
  });
  app.use('/api', apiLimiter);

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'fieldwork-api' }));

  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/work-reports', workReportRouter);
  app.use('/api/photos', photoRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/locations', locationRouter);
  app.use('/api/cron', cronRouter);

  app.use('/api', (req, res) => res.status(404).json({ error: `Rute API tidak ditemukan: ${req.method} ${req.path}` }));
  app.use(errorHandler);

  return app;
}
