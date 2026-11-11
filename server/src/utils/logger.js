const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const configured = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
const threshold = LEVELS[configured] ?? LEVELS.debug;

const timestamp = () => new Date().toISOString();

const safeValue = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) return value.map(safeValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/password|secret|token|authorization/i.test(key)) {
        out[key] = '<redacted>';
      } else {
        out[key] = safeValue(item);
      }
    }
    return out;
  }
  return String(value);
};

const formatContext = (context = {}) => {
  const entries = Object.entries(context).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!entries.length) return '';
  return ` ${entries.map(([key, value]) => `${key}=${JSON.stringify(safeValue(value))}`).join(' ')}`;
};

const write = (level, message, context) => {
  if (LEVELS[level] > threshold) return;
  const line = `${timestamp()} [${level.toUpperCase()}] ${message}${formatContext(context)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

export const logger = {
  level: configured,
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  debug: (message, context) => write('debug', message, context),
  error(message, error, context = {}) {
    const root = error?.cause ?? error;
    const errorContext = {
      ...context,
      ...(error
        ? {
          errorName: root?.name,
          errorCode: root?.code ?? error.code,
          status: error.status,
          details: error.details,
        }
        : {}),
    };
    write('error', message, errorContext);
    if (root?.stack) {
      const stack = String(root.stack)
        .split('\n')
        .slice(0, 12)
        .join('\n');
      console.error(stack);
    }
  },
  http(message, context) {
    write('info', message, context);
  },
};

export default logger;
