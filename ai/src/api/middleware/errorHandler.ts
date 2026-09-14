import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '../../types/api.js';
import { logger } from '../../utils/logger.js';
import { getEnv } from '../../config/env.js';
import { ZodError } from 'zod';

// Standard error response format per spec §67
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const env = getEnv();
  const requestId = req.headers['x-request-id'] as string | undefined;

  if (err instanceof AppError) {
    logger.warn('Application error', {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      requestId,
    });
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? {},
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST,
        message: 'Validation failed.',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // Unknown error — never expose stack traces in production
  const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
  logger.error('Unhandled error', {
    message,
    stack: env.NODE_ENV === 'development' && err instanceof Error ? err.stack : undefined,
    requestId,
  });

  res.status(500).json({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: env.NODE_ENV === 'production' ? 'Internal server error.' : message,
    },
  });
}
