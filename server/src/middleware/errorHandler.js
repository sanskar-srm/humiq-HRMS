import config from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const isProduction = () => config.isProduction;

const normalizeError = (error) => {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      message: error.message,
      code: error.code,
      details: error.details,
    };
  }

  if (error?.name === 'ZodError') {
    return {
      status: 400,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    };
  }

  if (error?.type === 'entity.parse.failed') {
    return { status: 400, message: 'Request body contains invalid JSON', code: 'BAD_REQUEST' };
  }

  if (error?.type === 'entity.too.large') {
    return { status: 413, message: 'Request body is too large', code: 'PAYLOAD_TOO_LARGE' };
  }

  if (/Origin is not allowed by CORS/i.test(error?.message ?? '')) {
    return {
      status: 403,
      message: 'This origin is not allowed to access the API',
      code: 'CORS_ORIGIN_DENIED',
    };
  }

  if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
    return { status: 401, message: 'Your session is invalid or has expired', code: 'UNAUTHORIZED' };
  }

  // Prisma / PostgreSQL connection and constraint errors.
  const prismaCode = typeof error?.code === 'string' ? error.code : '';
  if (prismaCode === 'P2002') {
    return { status: 409, message: 'A record with these values already exists', code: 'CONFLICT' };
  }
  if (prismaCode === 'P2025') {
    return { status: 404, message: 'The requested record was not found', code: 'NOT_FOUND' };
  }
  if (prismaCode === 'P2003') {
    return { status: 400, message: 'A related record does not exist', code: 'INVALID_REFERENCE' };
  }
  if (
    ['P1000', 'P1001', 'P1002', 'P1017', '28P01', 'ECONNREFUSED', 'ETIMEDOUT'].includes(prismaCode)
    || /28P01|password authentication failed/i.test(error?.message ?? '')
  ) {
    return {
      status: 503,
      message: 'The database is unavailable. Check the server connection settings and logs.',
      code: 'DATABASE_UNAVAILABLE',
    };
  }

  return {
    status: 500,
    message: isProduction() ? 'An unexpected error occurred' : (error?.message || 'An unexpected error occurred'),
    code: 'INTERNAL_ERROR',
    details: isProduction() ? undefined : error?.stack,
  };
};

const logError = (error, normalized, req) => {
  const context = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    status: normalized.status,
    code: normalized.code,
    userId: req.user?.id,
    ip: req.ip,
  };

  if (normalized.status >= 500) {
    logger.error(`Unhandled ${req.method} ${req.originalUrl}`, error, context);
    return;
  }

  logger.warn(`${req.method} ${req.originalUrl} rejected`, {
    ...context,
    message: normalized.message,
    details: normalized.details,
  });
};

export const notFoundHandler = (req, res) => {
  const normalized = {
    status: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'NOT_FOUND',
  };
  logger.warn('Route not found', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });
  return res.status(404).json({
    success: false,
    message: normalized.message,
    error: { code: normalized.code, requestId: req.id },
  });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (error, req, res, _next) => {
  if (res.headersSent) return _next(error);

  const normalized = normalizeError(error);
  logError(error, normalized, req);

  return res.status(normalized.status).json({
    success: false,
    message: normalized.message,
    error: {
      code: normalized.code,
      requestId: req.id,
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
      ...(normalized.status >= 500 && !isProduction() && error?.stack ? { stack: error.stack } : {}),
    },
  });
};
