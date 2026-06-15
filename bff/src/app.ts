import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import expressWinston from 'express-winston';
import { config } from './config';
import { logger } from './utils/logger';
import { apiKeyMiddleware } from './middleware/apiKey';
import { errorHandler } from './middleware/errorHandler';
import { hierarchyRouter } from './routes/hierarchyRoutes';
import { getHealth } from './controllers/HealthController';

export function createApp(): express.Express {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '10mb' }));

  const corsOrigins = config.CORS_ALLOWED_ORIGINS;
  app.use(cors({
    origin: corsOrigins.length === 0
      ? true
      : (origin, callback) => {
          if (!origin || corsOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`CORS: origin ${origin} not allowed`));
          }
        },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Ado-Org-Url', 'X-Ado-PAT', 'X-Api-Key'],
    credentials: false,
  }));

  app.use(expressWinston.logger({
    winstonInstance: logger,
    meta: true,
    msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
    colorize: process.env.NODE_ENV !== 'production',
    ignoredRoutes: ['/api/health'],
  }));
  app.use(apiKeyMiddleware);

  // Health check (no creds required)
  app.get('/api/health', getHealth);

  app.use('/api', hierarchyRouter);

  app.use(errorHandler);

  return app;
}
