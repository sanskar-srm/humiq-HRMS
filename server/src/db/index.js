import config from '../config/env.js';
import { createMemoryAdapter } from './memory.js';
import { createPostgresAdapter } from './prisma.js';
import { logger } from '../utils/logger.js';

export const dbMode = config.dbMode;

export const db = dbMode === 'memory'
  ? createMemoryAdapter(config.memoryDataFile)
  : createPostgresAdapter({ connectionString: config.databaseUrl });

if (dbMode === 'memory') {
  logger.warn('DB_MODE=memory: using the local development adapter. Configure Supabase for live data.');
}
