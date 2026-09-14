import express from 'express';
import cors from 'cors';
import { requestId, requestLogger } from './api/middleware/auth.js';
import { errorHandler } from './api/middleware/errorHandler.js';
import { healthRouter } from './api/routes/health.routes.js';

// Lazy-loaded route modules (populated after all files are created)
let kundliRouter: express.Router | null = null;
let matchRouter: express.Router | null = null;

export async function createApp(): Promise<express.Application> {
  const app = express();

  // Parse JSON with size limit
  app.use(express.json({ limit: '1mb' }));
  app.use(cors({ origin: '*' }));

  // Request ID + logging
  app.use(requestId);
  app.use(requestLogger);

  // Routes
  app.use('/health', healthRouter);

  // Lazy-load kundli and match routes
  if (!kundliRouter) {
    const mod = await import('./api/routes/kundli.routes.js');
    kundliRouter = mod.kundliRouter;
  }
  if (!matchRouter) {
    const mod = await import('./api/routes/match.routes.js');
    matchRouter = mod.matchRouter;
  }

  app.use('/api/v1/kundli', kundliRouter);
  app.use('/api/v1/match', matchRouter);

  // 404
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint not found.' },
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}
