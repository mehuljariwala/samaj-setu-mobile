import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '../../types/api.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// 60 requests per minute per IP per endpoint
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

function getKey(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  return `${ip}:${req.path}`;
}

export function rateLimit(req: Request, _res: Response, next: NextFunction): void {
  const key = getKey(req);
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    next(
      new AppError(
        ErrorCodes.KUNDLI_PROVIDER_RATE_LIMIT,
        429,
        'Too many requests. Please try again later.',
      ),
    );
    return;
  }

  next();
}
