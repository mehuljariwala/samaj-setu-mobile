import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AppError, ErrorCodes } from '@/lib/matchmaking/types/api';
import { logger } from '@/lib/matchmaking/utils/logger';

/**
 * The Express middleware stack, rewritten for route handlers.
 *
 * requestId, requestLogger, rateLimit and errorHandler were four pieces of
 * connect middleware chained by an Express app. There is no app object to
 * chain onto here, so they collapse into one wrapper each route composes
 * itself. The response envelope is unchanged — callers written against the
 * standalone service see the same JSON.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window limiter, per client per route.
 *
 * Carried over from the service as-is, and it keeps that version's limitation:
 * the counter lives in process memory, so it only limits within a single
 * instance. On serverless that means the effective ceiling multiplies by the
 * number of warm instances. It is a guard against one client hammering one
 * instance, not a quota.
 */
function rateLimit(request: Request, route: string): void {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  const key = `${ip}:${route}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    throw new AppError(
      ErrorCodes.KUNDLI_PROVIDER_RATE_LIMIT,
      429,
      'Too many requests. Please try again later.',
    );
  }
}

type Handler = (request: Request, requestId: string) => Promise<NextResponse>;

/** Wraps a route handler with the request id, logging, limiting and the error envelope. */
export function route(
  name: string,
  handler: Handler,
  options: { limit?: boolean } = {},
) {
  return async function handle(request: Request): Promise<NextResponse> {
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    const started = Date.now();

    try {
      if (options.limit) rateLimit(request, name);

      const response = await handler(request, requestId);
      response.headers.set('X-Request-ID', requestId);

      logger.info('Request completed', {
        requestId,
        method: request.method,
        path: name,
        statusCode: response.status,
        durationMs: Date.now() - started,
      });

      return response;
    } catch (caught) {
      return failure(caught, requestId, name, started);
    }
  };
}

function failure(caught: unknown, requestId: string, name: string, started: number): NextResponse {
  const durationMs = Date.now() - started;
  const isProduction = process.env.NODE_ENV === 'production';

  if (caught instanceof AppError) {
    logger.warn('Application error', {
      code: caught.code,
      message: caught.message,
      statusCode: caught.statusCode,
      requestId,
      path: name,
      durationMs,
    });
    return respond(
      { success: false, error: { code: caught.code, message: caught.message, details: caught.details ?? {} } },
      caught.statusCode,
      requestId,
    );
  }

  if (caught instanceof ZodError) {
    return respond(
      {
        success: false,
        error: {
          code: ErrorCodes.INVALID_REQUEST,
          message: 'Validation failed.',
          details: caught.flatten().fieldErrors,
        },
      },
      400,
      requestId,
    );
  }

  // Never expose a stack trace to a caller in production.
  const message = caught instanceof Error ? caught.message : 'An unexpected error occurred.';
  logger.error('Unhandled error', {
    message,
    stack: !isProduction && caught instanceof Error ? caught.stack : undefined,
    requestId,
    path: name,
    durationMs,
  });

  return respond(
    {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: isProduction ? 'Internal server error.' : message,
      },
    },
    500,
    requestId,
  );
}

function respond(body: unknown, status: number, requestId: string): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('X-Request-ID', requestId);
  return response;
}

export { AppError, ErrorCodes };
