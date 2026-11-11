import { db, dbMode } from '../src/db/index.js';
import { seed, syncDemoAccounts, DEMO_ACCOUNTS } from '../src/db/seed.js';
import config from '../src/config/env.js';
import { logger } from '../src/utils/logger.js';

const run = async () => {
  try {
    await db.healthCheck?.();
    logger.info('Database connection verified', { database: dbMode });

    const seeded = await db.seedIfEmpty(seed);
    logger.info(seeded ? 'Seed data created.' : 'Seed skipped: employees already exist.');

    const updated = await syncDemoAccounts(db);
    logger.info('Demo identities synchronised', {
      updated: updated.map((row) => row.employee_code),
      expected: DEMO_ACCOUNTS.map((row) => row.employee_code),
    });

    const rows = await db.select('employees', {
      where: { employee_code: { in: DEMO_ACCOUNTS.map((row) => row.employee_code) } },
      order: { column: 'employee_code', ascending: true },
      limit: 10,
    });

    console.log('\nDemo accounts');
    console.table(rows.map((row) => ({
      employee_id: row.employee_code,
      name: row.full_name,
      role: row.role,
      email: row.email,
      active: row.is_active,
    })));
    console.log(`Password for newly seeded accounts: ${config.seedPassword}`);
    console.log('Existing account passwords are not changed by this script.\n');
  } catch (error) {
    logger.error('Seed failed', error, { database: dbMode });
    process.exitCode = 1;
  } finally {
    if (typeof db.disconnect === 'function') {
      await db.disconnect().catch((error) => logger.error('Database disconnect failed', error));
    }
  }
};

run();
