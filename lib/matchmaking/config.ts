import 'server-only';
import { z } from 'zod';

/**
 * Matchmaking configuration.
 *
 * This used to load its own .env through dotenv and call process.exit(1) on a
 * bad value, which suited a standalone service with its own entry point. Inside
 * Next neither holds: the framework has already loaded .env by the time any of
 * this runs, and a server process that exits on import takes the whole site
 * down rather than the one route that needed a key. Invalid values now throw,
 * so the failure lands on the request that caused it.
 *
 * Every key here is optional with a default. The engine is designed to degrade:
 * without NAVAMSHA_API_KEY it cannot draw a chart, and without
 * OPENROUTER_API_KEY it returns deterministic scores and no written report.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().optional().default(''),

  NAVAMSHA_API_KEY: z.string().optional().default(''),
  NAVAMSHA_BASE_URL: z.string().url().default('https://api.navamsha.in'),
  NAVAMSHA_TIMEOUT_MS: z.coerce.number().default(15000),

  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('google/gemma-4-31b-it:free'),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().default(30000),

  APP_NAME: z.string().default('AI-Matchmaking'),
  APP_VERSION: z.string().default('1.0.0'),

  ALGORITHM_VERSION: z.string().default('1.0.0'),
  PROMPT_VERSION: z.string().default('1.0.0'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
  AI_MAX_RETRIES: z.coerce.number().default(2),
  ASTROLOGY_MAX_RETRIES: z.coerce.number().default(2),

  ENABLE_AI_REPORT: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  // Persistence is in-memory only; see lib/matchmaking/store.ts.
  ENABLE_DATABASE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const fields = Object.entries(result.error.flatten().fieldErrors)
      .map(([key, errors]) => `${key}: ${errors?.join(', ')}`)
      .join('; ');
    throw new Error(`Invalid matchmaking environment configuration — ${fields}`);
  }

  cached = result.data;
  return cached;
}

export function resetEnv(): void {
  cached = null;
}
