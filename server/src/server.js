import config from './config/env.js';
import { createApp } from './app.js';
import { db, dbMode } from './db/index.js';
import { seed, syncDemoAccounts } from './db/seed.js';
import { logger } from './utils/logger.js';

const start = async () => {
  logger.info('Starting HRMS API', {
    environment: config.nodeEnv,
    database: dbMode,
    port: config.port,
  });

  try {
    await db.healthCheck?.();
    logger.info('Database connection verified', { database: dbMode });
  } catch (error) {
    logger.error('Database connection failed during startup', error, { database: dbMode });
    if (config.isProduction) throw error;
    logger.warn('Continuing in development. API requests will return database errors until the connection is fixed.');
  }

  if (config.autoSeed) {
    try {
      const seeded = await db.seedIfEmpty(seed);
      if (seeded) {
        logger.info('Empty database: development seed applied.');
        logger.info(`Demo password configured for ${config.seedPassword.length} characters.`);
      }
      const updated = await syncDemoAccounts(db);
      logger.info('Demo identities synchronised', { count: updated.length });
    } catch (error) {
      logger.error('AUTO_SEED failed', error);
      throw error;
    }
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`HRMS API listening on http://localhost:${config.port}`, { database: dbMode });
  });

  server.on('error', (error) => {
    logger.error('HTTP server error', error, { port: config.port });
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    if (typeof db.disconnect === 'function') {
      try {
        await db.disconnect();
      } catch (error) {
        logger.error('Database disconnect failed', error);
      }
    }
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exitCode = 1;
});

start().catch((error) => {
  logger.error('Failed to start the HRMS API', error);
  process.exit(1);
});
