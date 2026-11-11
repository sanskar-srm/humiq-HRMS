import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { deriveRole, isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';
import { hashPassword, generateTemporaryPassword, sanitizeEmployee, syncRole } from '../auth/auth.service.js';

const enrich = async (employees) => {
  const managerIds = [...new Set(employees.map((employee) => employee.reports_to).filter(Boolean))];
  const managers = managerIds.length
    ? await db.select('employees', { where: { id: { in: managerIds } }, limit: managerIds.length })
    : [];
  const managerMap = new Map(managers.map((manager) => [manager.id, manager.full_name]));
  return employees.map((employee) => ({
    ...sanitizeEmployee(employee),
    manager_name: employee.reports_to ? managerMap.get(employee.reports_to) ?? null : null,
  }));
};

const searchConfig = (term) =>
  term ? { term, columns: ['full_name', 'employee_code', 'email', 'department', 'designation'] } : undefined;

export const listEmployees = async (user, query) => {
  const { page, limit, offset } = query.pagination;
  const scope = await getAccessScope(user);
  const where = {};
  if (!scope.all) where.id = { in: scope.ids };
  if (query.department) where.department = query.department;
  if (query.status) where.employment_status = query.status;
  if (query.role) where.role = query.role;

  const search = searchConfig(query.search);
  const orderColumn = ['full_name', 'employee_code', 'department', 'date_of_joining', 'created_at'].includes(query.sort)
    ? query.sort
    : 'full_name';
  const rows = await db.select('employees', {
    where,
    search,
    order: { column: orderColumn, ascending: query.order !== 'desc' },
    limit,
    offset,
  });
  const total = await db.count('employees', where, search);
  return { rows: await enrich(rows), total, page, limit };
};

export const options = async (user) => {
  const scope = await getAccessScope(user);
  const where = { is_active: true };
  if (!scope.all) where.id = { in: scope.ids };
  const rows = await db.select('employees', {
    where,
    order: { column: 'full_name', ascending: true },
    limit: 1000,
  });
  return rows.map((employee) => ({
    id: employee.id,
    employee_code: employee.employee_code,
    full_name: employee.full_name,
    department: employee.department,
    designation: employee.designation,
    role: employee.role,
  }));
};

export const departments = async () => {
  const rows = await db.select('employees', { limit: 5000 });
  return [...new Set(rows.map((employee) => employee.department).filter(Boolean))].sort();
};

export const getEmployee = async (user, id) => {
  const employee = await db.findById('employees', id);
  if (!employee) throw notFound('Employee not found');
  if (!isHRAdmin(user) && user.id !== id) {
    if (!isManager(user) || employee.reports_to !== user.id) {
      throw forbidden('You do not have access to this employee record');
    }
  }
  const [enriched] = await enrich([employee]);
  const reports = await getDirectReports(id);
  return { ...enriched, reports: reports.map(sanitizeEmployee) };
};

export const createEmployee = async (user, payload, req) => {
  const email = payload.email.trim().toLowerCase();
  if (await db.count('employees', { email })) throw conflict('An employee with this email already exists');
  if (payload.employee_code && (await db.count('employees', { employee_code: payload.employee_code.toUpperCase() }))) {
    throw conflict('An employee with this employee code already exists');
  }

  const password = payload.password ?? generateTemporaryPassword();
  const employeeCode = payload.employee_code?.toUpperCase() ?? (await nextCode());
  const base = {
    employee_code: employeeCode,
    full_name: payload.full_name.trim(),
    email,
    phone: payload.phone ?? null,
    department: payload.department,
    designation: payload.designation,
    employment_level: payload.employment_level ?? 'IC',
    reports_to: payload.reports_to ?? null,
    date_of_joining: payload.date_of_joining ?? new Date().toISOString().slice(0, 10),
    employment_status: payload.employment_status ?? 'Active',
    password_hash: await hashPassword(password),
    role: deriveRole({ department: payload.department, employment_level: payload.employment_level ?? 'IC' }, 0),
    is_active: payload.is_active ?? true,
  };

  if (base.reports_to) {
    const manager = await db.findById('employees', base.reports_to);
    if (!manager) throw badRequest('The selected manager does not exist');
  }

  const employee = await db.insert('employees', base);
  if (base.reports_to) {
    const manager = await db.findById('employees', base.reports_to);
    if (manager) await syncRole(manager);
  }
  await recordAudit({
    actorId: user.id,
    action: 'EMPLOYEE_CREATED',
    entityType: 'employee',
    entityId: employee.id,
    details: { employee_code: employee.employee_code, department: employee.department, role: employee.role },
    req,
  });
  return {
    employee: sanitizeEmployee(employee),
    // Temporary password is returned exactly once so HR can hand it over.
    temporary_password: payload.password ? undefined : password,
  };
};

const nextCode = async () => {
  const rows = await db.select('employees', { limit: 5000 });
  const max = rows.reduce((acc, employee) => {
    const match = /^EMP(\d+)$/.exec(employee.employee_code ?? '');
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `EMP${String(max + 1).padStart(3, '0')}`;
};

const UPDATABLE = [
  'full_name',
  'email',
  'phone',
  'department',
  'designation',
  'employment_level',
  'reports_to',
  'date_of_joining',
  'employment_status',
  'is_active',
];

export const updateEmployee = async (user, id, payload, req) => {
  const employee = await db.findById('employees', id);
  if (!employee) throw notFound('Employee not found');

  const patch = {};
  for (const key of UPDATABLE) {
    if (payload[key] !== undefined) patch[key] = payload[key];
  }
  if (patch.email) {
    patch.email = patch.email.trim().toLowerCase();
    const duplicate = await db.select('employees', { where: { email: patch.email }, limit: 2 });
    if (duplicate.some((row) => row.id !== id)) throw conflict('An employee with this email already exists');
  }
  if (patch.reports_to) {
    if (patch.reports_to === id) throw badRequest('An employee cannot report to themselves');
    const manager = await db.findById('employees', patch.reports_to);
    if (!manager) throw badRequest('The selected manager does not exist');
  }

  const previousManager = employee.reports_to;
  const [updated] = await db.update('employees', { id }, patch);
  if (!updated) throw notFound('Employee not found');

  // Reporting-line and organizational changes can change derived roles.
  if (patch.department || patch.employment_level) await syncRole(updated);
  if (patch.reports_to !== undefined) {
    if (previousManager) {
      const oldManager = await db.findById('employees', previousManager);
      if (oldManager) await syncRole(oldManager);
    }
    if (updated.reports_to) {
      const newManager = await db.findById('employees', updated.reports_to);
      if (newManager) await syncRole(newManager);
    }
  }
  await syncRole(updated);

  await recordAudit({
    actorId: user.id,
    action: patch.is_active !== undefined ? 'EMPLOYEE_ACTIVATION_CHANGED' : 'EMPLOYEE_UPDATED',
    entityType: 'employee',
    entityId: id,
    details: { fields: Object.keys(patch) },
    req,
  });
  const fresh = await db.findById('employees', id);
  const [enriched] = await enrich([fresh]);
  return enriched;
};

export const resetPassword = async (user, id, newPassword, req) => {
  const employee = await db.findById('employees', id);
  if (!employee) throw notFound('Employee not found');
  const password = newPassword ?? generateTemporaryPassword();
  await db.update('employees', { id }, { password_hash: await hashPassword(password) });
  await recordAudit({
    actorId: user.id,
    action: 'PASSWORD_RESET',
    entityType: 'employee',
    entityId: id,
    req,
  });
  return { temporary_password: password };
};

export const listAuditLogs = async (query) => {
  const { page, limit, offset } = query.pagination;
  const where = {};
  if (query.action) where.action = query.action;
  if (query.entity_type) where.entity_type = query.entity_type;
  const rows = await db.select('audit_logs', {
    where,
    order: { column: 'created_at', ascending: false },
    limit,
    offset,
  });
  const total = await db.count('audit_logs', where);
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))];
  const actors = actorIds.length
    ? await db.select('employees', { where: { id: { in: actorIds } }, limit: actorIds.length })
    : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor.full_name]));
  return {
    rows: rows.map((row) => ({ ...row, actor_name: row.actor_id ? actorMap.get(row.actor_id) ?? null : 'System' })),
    total,
    page,
    limit,
  };
};
