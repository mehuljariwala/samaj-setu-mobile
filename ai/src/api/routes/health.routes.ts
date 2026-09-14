import { Router } from 'express';
import type { Request, Response } from 'express';
import { getEnv } from '../../config/env.js';

export const healthRouter = Router();

// GET /health — per spec §59
healthRouter.get('/', (_req: Request, res: Response) => {
  const env = getEnv();
  res.json({
    status: 'ok',
    service: env.APP_NAME,
    version: env.APP_VERSION,
  });
});

// GET /health/providers — per spec §59
healthRouter.get('/providers', (_req: Request, res: Response) => {
  const env = getEnv();
  res.json({
    navamsha: env.NAVAMSHA_API_KEY ? 'configured' : 'not_configured',
    openrouter: env.OPENROUTER_API_KEY ? 'configured' : 'not_configured',
    database: env.ENABLE_DATABASE ? 'enabled' : 'in_memory',
  });
});
