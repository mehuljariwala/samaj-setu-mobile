import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),

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
  ENABLE_DATABASE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
      process.exit(1);
    }
    _env = result.data;
  }
  return _env;
}

export function resetEnv(): void {
  _env = null;
}
