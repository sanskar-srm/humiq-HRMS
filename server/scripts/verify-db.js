/**
 * Checks DATABASE_URL without printing secrets.
 * Run: npm run db:verify
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const url = process.env.DATABASE_URL ?? '';
const direct = process.env.DIRECT_URL ?? '';

const maskUrl = (connectionString) => {
  try {
    const u = new URL(connectionString);
    const user = u.username || '(empty)';
    const host = u.hostname || '?';
    const port = u.port || '5432';
    const db = u.pathname?.replace(/^\//, '') || 'postgres';
    const hasPgbouncer = u.searchParams.get('pgbouncer') === 'true';
    return { user, host, port, db, hasPgbouncer, ok: true };
  } catch {
    return { ok: false, reason: 'DATABASE_URL is not a valid URL (quotes, spaces, or broken format).' };
  }
};

const hints = [
  'Supabase → Project Settings → Database → copy the **URI** under Connection string (Pooler).',
  'User must be `postgres.<project-ref>` (e.g. postgres.iefbrpvshejhdititgnu), not plain `postgres`, when using the pooler host.',
  'Password is the **database password** from that page (reset if unsure). It is NOT the anon or service_role API key.',
  'Replace `[YOUR-PASSWORD]` in .env with the real password — no brackets.',
  'If the password contains @ # % / ? & = encode it (PowerShell: [uri]::EscapeDataString("your-password")).',
  'Runtime: port **6543** with `?pgbouncer=true`. Migrations/DIRECT_URL: session pooler port **5432**.',
];

const run = async () => {
  if (!url) {
    console.error('[db:verify] DATABASE_URL is missing. Copy server/.env.example → .env');
    process.exit(1);
  }

  const masked = maskUrl(url);
  if (!masked.ok) {
    console.error(`[db:verify] ${masked.reason}`);
    process.exit(1);
  }

  console.log('[db:verify] Parsed connection (no password shown):');
  console.log(`  user:     ${masked.user}`);
  console.log(`  host:     ${masked.host}:${masked.port}`);
  console.log(`  database: ${masked.db}`);
  console.log(`  pgbouncer param: ${masked.hasPgbouncer ? 'yes' : 'no'}`);

  if (
    url.includes('[YOUR-PASSWORD]')
    || url.includes('YOUR_PASSWORD')
    || url.includes('YOUR_DATABASE_PASSWORD')
  ) {
    console.error('\n[db:verify] DATABASE_URL still contains a placeholder password.');
    hints.forEach((h) => console.error(`  • ${h}`));
    process.exit(1);
  }

  if (masked.host.includes('pooler.supabase.com') && !masked.user.includes('.')) {
    console.warn('\n[db:verify] Warning: pooler host but username looks like plain "postgres". Expected postgres.<project-ref>.');
  }

  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15_000 });
  try {
    const client = await pool.connect();
    const { rows } = await client.query('SELECT current_user AS user, current_database() AS db');
    client.release();
    console.log(`\n[db:verify] OK — connected as ${rows[0].user} on database ${rows[0].db}`);
    if (!direct) {
      console.warn('[db:verify] DIRECT_URL is empty (needed for some Prisma CLI tasks).');
    }
    process.exit(0);
  } catch (error) {
    const code = error.code ?? '';
    console.error(`\n[db:verify] Failed: ${error.message}`);
    if (code === '28P01' || /password authentication failed/i.test(error.message)) {
      console.error('\n[db:verify] PostgreSQL 28P01 = wrong database password or pooler username.');
      hints.forEach((h) => console.error(`  • ${h}`));
    }
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
};

run();
