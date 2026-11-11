import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

const SKIP_PATHS = new Set(['/health', '/favicon.ico']);

export const requestLogger = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  res.on('finish', () => {
    if (SKIP_PATHS.has(req.path)) return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const context = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      userId: req.user?.id,
      ip: req.ip,
    };

    if (res.statusCode >= 500) logger.error('HTTP request failed', null, context);
    else if (res.statusCode >= 400) logger.warn('HTTP request rejected', context);
    else logger.http('HTTP request completed', context);
  });

  next();
};

export default requestLogger;
