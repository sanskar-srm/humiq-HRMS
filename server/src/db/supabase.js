import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../utils/errors.js';

const cleanTerm = (term) => String(term).replace(/[,()%]/g, '').trim();

/**
 * Supabase PostgreSQL adapter. Only ever constructed on the server with the
 * service-role key. Authorization/scoping is enforced in the service layer.
 */
export function createSupabaseAdapter({ url, serviceRoleKey }) {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const applyWhere = (query, where = {}) => {
    let q = query;
    for (const [key, expected] of Object.entries(where)) {
      if (expected === undefined) continue;
      if (expected !== null && typeof expected === 'object' && !Array.isArray(expected)) {
        if ('in' in expected) q = q.in(key, expected.in);
        if ('nin' in expected) q = q.not(key, 'in', `(${expected.nin.join(',')})`);
        if ('ne' in expected) q = q.neq(key, expected.ne);
        if ('gte' in expected) q = q.gte(key, expected.gte);
        if ('lte' in expected) q = q.lte(key, expected.lte);
        if ('gt' in expected) q = q.gt(key, expected.gt);
        if ('lt' in expected) q = q.lt(key, expected.lt);
        if ('ilike' in expected) q = q.ilike(key, expected.ilike);
        if ('is' in expected) q = q.is(key, expected.is);
      } else if (Array.isArray(expected)) {
        q = q.in(key, expected);
      } else if (expected === null) {
        q = q.is(key, null);
      } else {
        q = q.eq(key, expected);
      }
    }
    return q;
  };

  const ensure = ({ data, error }, status = 400) => {
    if (error) {
      throw new ApiError(status, error.message, error.code ?? 'DATABASE_ERROR', error.details);
    }
    return data;
  };

  const adapter = {
    mode: 'supabase',

    async select(name, options = {}) {
      const { where, order, limit, offset = 0, search } = options;
      let query = supabase.from(name).select('*');
      query = applyWhere(query, where);
      if (search?.term) {
        const term = cleanTerm(search.term);
        if (term) {
          query = query.or(search.columns.map((column) => `${column}.ilike.%${term}%`).join(','));
        }
      }
      if (order) query = query.order(order.column, { ascending: order.ascending !== false });
      if (limit) query = query.range(offset, offset + limit - 1);
      return ensure(await query) ?? [];
    },

    async count(name, where = {}, search) {
      let query = supabase.from(name).select('*', { count: 'exact', head: true });
      query = applyWhere(query, where);
      if (search?.term) {
        const term = cleanTerm(search.term);
        if (term) {
          query = query.or(search.columns.map((column) => `${column}.ilike.%${term}%`).join(','));
        }
      }
      const { count, error } = await query;
      if (error) throw new ApiError(400, error.message, error.code ?? 'DATABASE_ERROR');
      return count ?? 0;
    },

    async findById(name, id) {
      const { data, error } = await supabase.from(name).select('*').eq('id', id).maybeSingle();
      if (error) throw new ApiError(400, error.message, error.code ?? 'DATABASE_ERROR');
      return data ?? null;
    },

    async insert(name, row) {
      const { data, error } = await supabase.from(name).insert(row).select().single();
      if (error) throw new ApiError(400, error.message, error.code ?? 'DATABASE_ERROR');
      return data;
    },

    async insertMany(name, rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase.from(name).insert(rows).select();
      if (error) throw new ApiError(400, error.message, error.code ?? 'DATABASE_ERROR');
      return data ?? [];
    },

    async update(name, where, patch) {
      let query = supabase.from(name).update(patch);
      query = applyWhere(query, where);
      const { data, error } = await query.select();
      if (error) throw new ApiError(400, error.message, error.code ?? 'DATABASE_ERROR');
      return data ?? [];
    },

    async remove(name, where) {
      let query = supabase.from(name).delete();
      query = applyWhere(query, where);
      const { data, error } = await query.select();
      if (error) throw new ApiError(400, error.message, error.code ?? 'DATABASE_ERROR');
      return (data ?? []).length;
    },

    async transaction(fn) {
      // supabase-js has no client-side transaction API. Multi-step workflows
      // use compensating actions and are documented in Progress.md.
      return fn(adapter);
    },

    async seedIfEmpty(seedFn) {
      const count = await adapter.count('employees');
      if (count > 0) return false;
      await seedFn(adapter);
      return true;
    },
  };

  return adapter;
}
