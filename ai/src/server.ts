import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { logger } from './utils/logger.js';

async function start(): Promise<void> {
  const env = getEnv();
  const app = await createApp();

  app.listen(env.PORT, () => {
    logger.info('AI Matchmaking service started', {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      version: env.APP_VERSION,
      algorithmVersion: env.ALGORITHM_VERSION,
      aiEnabled: env.ENABLE_AI_REPORT,
      databaseEnabled: env.ENABLE_DATABASE,
    });
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
