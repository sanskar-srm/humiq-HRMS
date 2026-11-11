import pg from 'pg';
import { ApiError } from '../utils/errors.js';

// Keep API payloads identical across the Postgres and memory adapters:
// DATE columns become 'YYYY-MM-DD' strings and NUMERIC columns become numbers.
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1700, (value) => (value === null ? null : Number(value)));

const IDENT = /^[a-z][a-z0-9_]*$/;

const assertTable = (name) => {
  if (!IDENT.test(name)) throw new ApiError(400, `Invalid table name: ${name}`, 'INVALID_TABLE');
  return name;
};

const cleanTerm = (term) => String(term).replace(/[,()%]/g, '').trim();

const toJson = (row) => {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map(toJson);
  if (typeof row === 'object') {
    if (typeof row.toNumber === 'function') return row.toNumber();
    if (row instanceof Date) return row.toISOString();
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = toJson(v);
    }
    return out;
  }
  return row;
};

const parseValue = (v) => {
  if (v === undefined) return v;
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
    return JSON.stringify(v);
  }
  return v;
};

const buildWhere = (where = {}, startIdx = 1) => {
  const clauses = [];
  const values = [];
  let i = startIdx;

  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue;
    if (!IDENT.test(key)) throw new ApiError(400, `Invalid column: ${key}`, 'INVALID_COLUMN');

    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('in' in expected) {
        const list = expected.in ?? [];
        if (!list.length) {
          clauses.push('1=0');
          continue;
        }
        const ph = list.map(() => `$${i++}`);
        values.push(...list);
        clauses.push(`"${key}" IN (${ph.join(', ')})`);
      } else if ('nin' in expected) {
        const list = expected.nin ?? [];
        if (!list.length) continue;
        const ph = list.map(() => `$${i++}`);
        values.push(...list);
        clauses.push(`"${key}" NOT IN (${ph.join(', ')})`);
      } else if ('ne' in expected) {
        clauses.push(`"${key}" <> $${i++}`);
        values.push(expected.ne);
      } else if ('gte' in expected) {
        clauses.push(`"${key}" >= $${i++}`);
        values.push(expected.gte);
      } else if ('lte' in expected) {
        clauses.push(`"${key}" <= $${i++}`);
        values.push(expected.lte);
      } else if ('gt' in expected) {
        clauses.push(`"${key}" > $${i++}`);
        values.push(expected.gt);
      } else if ('lt' in expected) {
        clauses.push(`"${key}" < $${i++}`);
        values.push(expected.lt);
      } else if ('ilike' in expected) {
        clauses.push(`"${key}" ILIKE $${i++}`);
        values.push(expected.ilike);
      } else if ('is' in expected) {
        if (expected.is === null) clauses.push(`"${key}" IS NULL`);
        else {
          clauses.push(`"${key}" IS $${i++}`);
          values.push(expected.is);
        }
      }
    } else if (Array.isArray(expected)) {
      if (!expected.length) {
        clauses.push('1=0');
        continue;
      }
      const ph = expected.map(() => `$${i++}`);
      values.push(...expected);
      clauses.push(`"${key}" IN (${ph.join(', ')})`);
    } else if (expected === null) {
      clauses.push(`"${key}" IS NULL`);
    } else {
      clauses.push(`"${key}" = $${i++}`);
      values.push(expected);
    }
  }

  return { sql: clauses.length ? clauses.join(' AND ') : 'TRUE', values, nextIdx: i };
};

/** PostgreSQL adapter via node-pg (Supabase). */
export function createPostgresAdapter({ connectionString }) {
  const pool = new pg.Pool({ connectionString, max: 10 });

  const query = async (sql, params = []) => {
    try {
      const { rows } = await pool.query(sql, params);
      return toJson(rows);
    } catch (error) {
      const msg = error.message ?? 'Database error';
      const code = error.code ?? '';
      const authFailure = code === '28P01' || /28P01|password authentication failed/i.test(msg);
      if (authFailure) {
        throw new ApiError(
          503,
          'Database authentication failed (28P01). In server/.env set DATABASE_URL to Supabase pooler URI with postgres.<project-ref> user and your database password. Run: npm run db:verify',
          'DATABASE_AUTH_FAILED',
        );
      }
      if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'P1000', 'P1001', 'P1002', 'P1017', '57P01', '53300'].includes(code)) {
        throw new ApiError(503, 'The database is unavailable. Check the Supabase connection and server logs.', 'DATABASE_UNAVAILABLE');
      }
      if (code === '42P01') {
        throw new ApiError(503, 'The database schema is not initialised. Run npm run db:push, then npm run seed.', 'DATABASE_SCHEMA_MISSING');
      }
      if (code === '23505') {
        throw new ApiError(409, 'A record with these values already exists', 'CONFLICT');
      }
      if (code === '23503') {
        throw new ApiError(400, 'A related record does not exist', 'INVALID_REFERENCE');
      }
      if (['22P02', '23502', '23514'].includes(code)) {
        throw new ApiError(400, msg, 'DATABASE_VALIDATION_ERROR');
      }
      const apiError = new ApiError(500, msg, 'DATABASE_ERROR');
      apiError.cause = error;
      throw apiError;
    }
  };

  const db = {
    mode: 'prisma',
    pool,

    async healthCheck() {
      await pool.query('SELECT 1 AS ok');
      return true;
    },

    async select(name, options = {}) {
      const table = assertTable(name);
      const { where, order, limit, offset = 0, search } = options;
      let { sql: whereSql, values, nextIdx } = buildWhere(where);

      if (search?.term) {
        const term = cleanTerm(search.term);
        if (term && search.columns?.length) {
          const ors = search.columns
            .filter((c) => IDENT.test(c))
            .map((c) => {
              values.push(`%${term}%`);
              return `"${c}" ILIKE $${nextIdx++}`;
            });
          if (ors.length) whereSql = `(${whereSql}) AND (${ors.join(' OR ')})`;
        }
      }

      let sql = `SELECT * FROM "${table}" WHERE ${whereSql}`;
      if (order?.column && IDENT.test(order.column)) {
        sql += ` ORDER BY "${order.column}" ${order.ascending === false ? 'DESC' : 'ASC'}`;
      }
      if (limit) {
        values.push(limit, offset);
        sql += ` LIMIT $${nextIdx++} OFFSET $${nextIdx++}`;
      }
      return query(sql, values);
    },

    async count(name, where = {}, search) {
      const table = assertTable(name);
      let { sql: whereSql, values, nextIdx } = buildWhere(where);

      if (search?.term) {
        const term = cleanTerm(search.term);
        if (term && search.columns?.length) {
          const ors = search.columns
            .filter((c) => IDENT.test(c))
            .map((c) => {
              values.push(`%${term}%`);
              return `"${c}" ILIKE $${nextIdx++}`;
            });
          if (ors.length) whereSql = `(${whereSql}) AND (${ors.join(' OR ')})`;
        }
      }

      const rows = await query(`SELECT COUNT(*)::int AS c FROM "${table}" WHERE ${whereSql}`, values);
      return rows[0]?.c ?? 0;
    },

    async findById(name, id) {
      const table = assertTable(name);
      const rows = await query(`SELECT * FROM "${table}" WHERE "id" = $1 LIMIT 1`, [id]);
      return rows[0] ?? null;
    },

    async insert(name, row) {
      const table = assertTable(name);
      const keys = Object.keys(row).filter((k) => row[k] !== undefined && IDENT.test(k));
      if (!keys.length) throw new ApiError(400, 'No columns to insert', 'VALIDATION_ERROR');
      const cols = keys.map((k) => `"${k}"`).join(', ');
      const ph = keys.map((_, idx) => `$${idx + 1}`).join(', ');
      const values = keys.map((k) => parseValue(row[k]));
      const rows = await query(`INSERT INTO "${table}" (${cols}) VALUES (${ph}) RETURNING *`, values);
      return rows[0];
    },

    async insertMany(name, rows) {
      if (!rows.length) return [];
      const out = [];
      for (const row of rows) {
        out.push(await db.insert(name, row));
      }
      return out;
    },

    async update(name, where, patch) {
      const table = assertTable(name);
      const patchKeys = Object.keys(patch).filter((k) => patch[k] !== undefined && IDENT.test(k));
      if (!patchKeys.length) return [];

      const setParts = [];
      const values = [];
      let i = 1;
      for (const k of patchKeys) {
        setParts.push(`"${k}" = $${i++}`);
        values.push(parseValue(patch[k]));
      }
      const { sql: whereSql, values: whereVals } = buildWhere(where, i);
      values.push(...whereVals);

      const sql = `UPDATE "${table}" SET ${setParts.join(', ')}, "updated_at" = NOW() WHERE ${whereSql} RETURNING *`;
      return query(sql, values);
    },

    async remove(name, where) {
      const table = assertTable(name);
      const { sql: whereSql, values } = buildWhere(where);
      const rows = await query(`DELETE FROM "${table}" WHERE ${whereSql} RETURNING "id"`, values);
      return rows.length;
    },

    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const txAdapter = {
          ...db,
          async insert(n, row) {
            const table = assertTable(n);
            const keys = Object.keys(row).filter((k) => row[k] !== undefined && IDENT.test(k));
            const cols = keys.map((k) => `"${k}"`).join(', ');
            const ph = keys.map((_, idx) => `$${idx + 1}`).join(', ');
            const values = keys.map((k) => parseValue(row[k]));
            const { rows: result } = await client.query(
              `INSERT INTO "${table}" (${cols}) VALUES (${ph}) RETURNING *`,
              values,
            );
            return toJson(result[0]);
          },
          async update(n, w, patch) {
            const table = assertTable(n);
            const patchKeys = Object.keys(patch).filter((k) => patch[k] !== undefined && IDENT.test(k));
            const setParts = [];
            const values = [];
            let idx = 1;
            for (const k of patchKeys) {
              setParts.push(`"${k}" = $${idx++}`);
              values.push(parseValue(patch[k]));
            }
            const { sql: whereSql, values: whereVals } = buildWhere(w, idx);
            values.push(...whereVals);
            const { rows: result } = await client.query(
              `UPDATE "${table}" SET ${setParts.join(', ')}, "updated_at" = NOW() WHERE ${whereSql} RETURNING *`,
              values,
            );
            return toJson(result);
          },
        };
        const result = await fn(txAdapter);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    async seedIfEmpty(seedFn) {
      const count = await db.count('employees');
      if (count > 0) return false;
      await seedFn(db);
      return true;
    },

    async disconnect() {
      await pool.end();
    },
  };

  return db;
}
