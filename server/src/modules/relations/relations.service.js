import { db } from '../../db/index.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, canAccessEmployee } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

const nextCaseNo = async () => {
  const rows = await db.select('er_cases', { order: { column: 'created_at', ascending: false }, limit: 1 });
  const year = new Date().getUTCFullYear();
  const last = rows[0]?.case_no;
  let seq = 1;
  if (last && last.startsWith(`ER-${year}-`)) {
    seq = Number(last.split('-').pop()) + 1;
  }
  return `ER-${year}-${String(seq).padStart(4, '0')}`;
};

const employeeMap = async (rows, field = 'employee_id') => {
  const ids = [...new Set(rows.map((row) => row[field]).filter(Boolean))];
  const assigneeIds = [...new Set(rows.map((row) => row.assigned_to).filter(Boolean))];
  const allIds = [...new Set([...ids, ...assigneeIds])];
  const employees = allIds.length ? await db.select('employees', { where: { id: { in: allIds } }, limit: allIds.length }) : [];
  const map = new Map(employees.map((e) => [e.id, e]));
  return rows.map((row) => ({
    ...row,
    employee_name: map.get(row[field])?.full_name ?? 'Unknown',
    employee_code: map.get(row[field])?.employee_code ?? '',
    department: map.get(row[field])?.department ?? '',
    assignee_name: row.assigned_to ? map.get(row.assigned_to)?.full_name ?? 'Unassigned' : null,
  }));
};

export const overview = async (user) => {
  const scope = await getAccessScope(user);
  let rows = await db.select('er_cases', { limit: 10000 });
  if (!scope.all) {
    rows = rows.filter((c) => scope.ids.includes(c.employee_id) || c.assigned_to === user.id);
    if (isManager(user) && !isHRAdmin(user)) {
      rows = rows.filter((c) => scope.ids.includes(c.employee_id) || c.employee_id === user.id);
    }
  }
  const open = rows.filter((c) => !['Closed', 'Resolution'].includes(c.status)).length;
  const urgent = rows.filter((c) => c.priority === 'Urgent' && c.status !== 'Closed').length;
  return {
    total_cases: rows.length,
    open_cases: open,
    urgent_cases: urgent,
    by_status: Object.entries(rows.reduce((acc, c) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {})).map(([status, count]) => ({ status, count })),
    scope: scope.all ? 'organization' : isManager(user) ? 'team' : 'self',
  };
};

export const listCases = async (user, query) => {
  const scope = await getAccessScope(user);
  let rows = await db.select('er_cases', {
    order: { column: 'created_at', ascending: false },
    limit: 2000,
  });
  if (query.status) rows = rows.filter((c) => c.status === query.status);
  if (query.employee_id) {
    if (!await canAccessEmployee(user, query.employee_id)) throw forbidden('You cannot view this employee’s cases');
    rows = rows.filter((c) => c.employee_id === query.employee_id);
  } else if (!isHRAdmin(user)) {
    if (isManager(user)) {
      rows = rows.filter((c) => scope.ids.includes(c.employee_id));
    } else {
      rows = rows.filter((c) => c.employee_id === user.id);
    }
  }
  return employeeMap(rows);
};

export const getCase = async (user, id) => {
  const erCase = await db.findById('er_cases', id);
  if (!erCase) throw notFound('Case not found');
  if (!isHRAdmin(user)) {
    if (erCase.employee_id !== user.id && !(isManager(user) && await canAccessEmployee(user, erCase.employee_id))) {
      throw forbidden('You cannot view this case');
    }
  }
  const [enriched] = await employeeMap([erCase]);
  return enriched;
};

export const createCase = async (user, payload, req) => {
  const employeeId = payload.employee_id ?? user.id;
  if (employeeId !== user.id && !isHRAdmin(user)) throw forbidden('You can only raise concerns for yourself unless you are HR');
  if (employeeId !== user.id) {
    const allowed = await canAccessEmployee(user, employeeId);
    if (!allowed && !isHRAdmin(user)) throw forbidden('Employee not in scope');
  }
  const employee = await db.findById('employees', employeeId);
  if (!employee) throw badRequest('Employee not found');
  const caseNo = await nextCaseNo();
  const erCase = await db.insert('er_cases', {
    case_no: caseNo,
    employee_id: employeeId,
    subject: payload.subject,
    description: payload.description,
    category: payload.category ?? 'Concern',
    status: 'Intake',
    priority: payload.priority ?? 'Medium',
    assigned_to: null,
  });
  await recordAudit({ actorId: user.id, action: 'ER_CASE_CREATED', entityType: 'er_case', entityId: erCase.id, details: { case_no: caseNo }, req });
  return erCase;
};

export const updateCase = async (user, id, payload, req) => {
  const erCase = await db.findById('er_cases', id);
  if (!erCase) throw notFound('Case not found');
  const isOwner = erCase.employee_id === user.id;
  if (!isHRAdmin(user) && !isManager(user)) {
    if (!isOwner) throw forbidden('You cannot update this case');
    const allowed = ['subject', 'description'];
    const keys = Object.keys(payload);
    if (keys.some((k) => !allowed.includes(k))) throw forbidden('You can only update subject and description on your own case');
    if (erCase.status !== 'Intake') throw forbidden('Case can no longer be edited');
  }
  const patch = { ...payload };
  if (patch.status === 'Resolution' || patch.status === 'Closed') {
    if (!isHRAdmin(user) && !isManager(user)) throw forbidden('Only staff can resolve cases');
    patch.resolved_by = user.id;
    patch.resolved_at = new Date().toISOString();
  }
  const [updated] = await db.update('er_cases', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'ER_CASE_UPDATED', entityType: 'er_case', entityId: id, details: patch, req });
  const [enriched] = await employeeMap([updated]);
  return enriched;
};

export const analytics = async (user) => {
  if (!isHRAdmin(user)) throw forbidden('Analytics are for Admin and HR only');
  const cases = await db.select('er_cases', { limit: 10000 });
  const byCategory = Object.entries(cases.reduce((acc, c) => { acc[c.category] = (acc[c.category] ?? 0) + 1; return acc; }, {})).map(([category, count]) => ({ category, count }));
  const byPriority = Object.entries(cases.reduce((acc, c) => { acc[c.priority] = (acc[c.priority] ?? 0) + 1; return acc; }, {})).map(([priority, count]) => ({ priority, count }));
  const openDays = cases.filter((c) => c.status !== 'Closed').map((c) => (Date.now() - new Date(c.created_at).getTime()) / 86400000);
  const avgAge = openDays.length ? Math.round(openDays.reduce((a, b) => a + b, 0) / openDays.length) : 0;
  return { total: cases.length, open: cases.filter((c) => c.status !== 'Closed').length, by_category: byCategory, by_priority: byPriority, average_open_age_days: avgAge };
};
