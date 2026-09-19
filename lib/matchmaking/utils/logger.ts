import { getEnv } from '@/lib/matchmaking/config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  const env = getEnv();
  return LEVELS[level] >= LEVELS[env.LOG_LEVEL];
}

/** Structured JSON logger that never logs secrets. */
function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (meta) {
    // Strip any accidental secret fields
    const { apiKey, api_key, password, secret, token, authorization, ...safe } = meta as Record<
      string,
      unknown
    >;
    void apiKey; void api_key; void password; void secret; void token; void authorization;
    Object.assign(entry, safe);
  }

  const out = JSON.stringify(entry);
  if (level === 'error') {
    console.error(out);
  } else if (level === 'warn') {
    console.warn(out);
  } else {
    console.log(out);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
