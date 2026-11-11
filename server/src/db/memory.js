import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const clone = (value) => JSON.parse(JSON.stringify(value));

const matches = (row, where = {}) => {
  for (const [key, expected] of Object.entries(where)) {
    if (expected === undefined) continue;
    const actual = row[key];
    if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('in' in expected && !expected.in.includes(actual)) return false;
      if ('nin' in expected && expected.nin.includes(actual)) return false;
      if ('ne' in expected && actual === expected.ne) return false;
      if ('gte' in expected && !(actual >= expected.gte)) return false;
      if ('lte' in expected && !(actual <= expected.lte)) return false;
      if ('gt' in expected && !(actual > expected.gt)) return false;
      if ('lt' in expected && !(actual < expected.lt)) return false;
      if ('ilike' in expected) {
        const needle = String(expected.ilike).replaceAll('%', '').toLowerCase();
        if (!String(actual ?? '').toLowerCase().includes(needle)) return false;
      }
      if ('is' in expected) {
        if (expected.is === null ? actual !== null && actual !== undefined : actual !== expected.is) return false;
      }
    } else if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
};

const sortRows = (rows, order) => {
  if (!order) return rows;
  const { column, ascending = true } = order;
  return [...rows].sort((a, b) => {
    const av = a[column] ?? '';
    const bv = b[column] ?? '';
    if (av === bv) return 0;
    return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
  });
};

/**
 * Dev-only persistent adapter. It implements the same small data-access
 * contract as the Supabase adapter so business logic is shared. It is never
 * selected in production (config/env.js enforces Supabase credentials).
 */
export function createMemoryAdapter(filePath) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });

  let data = {};
  if (fs.existsSync(absolute)) {
    try {
      data = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    } catch {
      data = {};
    }
  }

  const persist = () => {
    const tmp = `${absolute}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, absolute);
  };

  const table = (name) => {
    if (!data[name]) data[name] = [];
    return data[name];
  };

  const adapter = {
    mode: 'memory',

    async healthCheck() {
      return true;
    },

    async select(name, options = {}) {
      const { where, order, limit, offset = 0, search } = options;
      let rows = table(name).filter((row) => matches(row, where));
      if (search?.term) {
        const term = String(search.term).toLowerCase();
        rows = rows.filter((row) =>
          search.columns.some((column) => String(row[column] ?? '').toLowerCase().includes(term)),
        );
      }
      rows = sortRows(rows, order ?? { column: 'created_at', ascending: false });
      const total = rows.length;
      const sliced = rows.slice(offset, limit ? offset + limit : undefined);
      return clone(sliced);
    },

    async count(name, where = {}, search) {
      let rows = table(name).filter((row) => matches(row, where));
      if (search?.term) {
        const term = String(search.term).toLowerCase();
        rows = rows.filter((row) =>
          search.columns.some((column) => String(row[column] ?? '').toLowerCase().includes(term)),
        );
      }
      return rows.length;
    },

    async findById(name, id) {
      const row = table(name).find((item) => item.id === id);
      return row ? clone(row) : null;
    },

    async insert(name, row) {
      const record = {
        id: row.id ?? crypto.randomUUID(),
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? new Date().toISOString(),
        ...clone(row),
      };
      table(name).push(record);
      persist();
      return clone(record);
    },

    async insertMany(name, rows) {
      const inserted = rows.map((row) => ({
        id: row.id ?? crypto.randomUUID(),
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: row.updated_at ?? new Date().toISOString(),
        ...clone(row),
      }));
      table(name).push(...inserted);
      persist();
      return clone(inserted);
    },

    async update(name, where, patch) {
      const updated = [];
      for (const row of table(name)) {
        if (matches(row, where)) {
          Object.assign(row, clone(patch), { updated_at: new Date().toISOString() });
          updated.push(clone(row));
        }
      }
      if (updated.length) persist();
      return updated;
    },

    async remove(name, where) {
      const before = table(name).length;
      data[name] = table(name).filter((row) => !matches(row, where));
      const removed = before - data[name].length;
      if (removed) persist();
      return removed;
    },

    async transaction(fn) {
      const snapshot = clone(data);
      try {
        const result = await fn(adapter);
        persist();
        return result;
      } catch (error) {
        data = snapshot;
        persist();
        throw error;
      }
    },

    async seedIfEmpty(seedFn) {
      const hasEmployees = table('employees').length > 0;
      if (hasEmployees) return false;
      await seedFn(adapter);
      persist();
      return true;
    },
  };

  return adapter;
}
