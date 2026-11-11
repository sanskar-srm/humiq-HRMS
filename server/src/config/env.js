import dotenv from 'dotenv';

dotenv.config();

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') return fallback;
  return value;
};

const nodeEnv = required('NODE_ENV', 'development');
const requestedDbMode = required('DB_MODE', '').toLowerCase();
const dbMode = requestedDbMode || (nodeEnv === 'test' ? 'memory' : 'prisma');

const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(required('PORT', 5000)),
  clientOrigins: required('CLIENT_URL', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: required('JWT_SECRET', ''),
  jwtExpiresIn: required('JWT_EXPIRES_IN', '8h'),
  dbMode,
  databaseUrl: required('DATABASE_URL', ''),
  directUrl: required('DIRECT_URL', ''),
  memoryDataFile: required('MEMORY_DATA_FILE', '.data/db.json'),
  seedPassword: required('SEED_PASSWORD', 'ChangeMe123!'),
  registrationCode: required('EMPLOYEE_REGISTRATION_CODE', ''),
  autoSeed: required('AUTO_SEED', 'false') === 'true',
  logLevel: required('LOG_LEVEL', nodeEnv === 'production' ? 'info' : 'debug').toLowerCase(),
};

if (!['prisma', 'memory'].includes(config.dbMode)) {
  throw new Error(`DB_MODE must be "prisma" or "memory" (received "${config.dbMode}")`);
}
if (config.isProduction && config.dbMode === 'memory') {
  throw new Error('DB_MODE=memory is not allowed in production. Configure Supabase/Postgres.');
}

if (config.isProduction) {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production');
  }
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required in production');
  }
  if (!config.directUrl) {
    throw new Error('DIRECT_URL is required in production (Prisma migrations)');
  }
} else if (!config.jwtSecret) {
  config.jwtSecret = 'dev-only-insecure-jwt-secret-change-me-please';
}

if (config.dbMode === 'prisma' && !config.databaseUrl) {
  throw new Error(
    'DATABASE_URL is required. Set Supabase Postgres URLs in server/.env (see .env.example), or set DB_MODE=memory for local development.',
  );
}

const placeholderPattern = /\[YOUR-PASSWORD\]|YOUR_PASSWORD|YOUR_DATABASE_PASSWORD|replace_me|changeme_db/i;
if (
  config.dbMode === 'prisma'
  && (placeholderPattern.test(config.databaseUrl) || placeholderPattern.test(config.directUrl))
) {
  throw new Error(
    'DATABASE_URL or DIRECT_URL still contains a placeholder password. Copy the pooler URI from Supabase -> Project Settings -> Database, then run: npm run db:verify',
  );
}

export default config;
