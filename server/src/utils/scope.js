import { db } from '../db/index.js';
import { isHRAdmin, isManager } from './roles.js';

export const getDirectReports = async (managerId) =>
  db.select('employees', {
    where: { reports_to: managerId, is_active: true },
    order: { column: 'full_name', ascending: true },
    limit: 500,
  });

/**
 * Returns the set of employees a caller may read. Admin/HR are unscoped.
 * Managers are limited to themselves plus their direct reports.
 * Employees are limited to themselves.
 */
export const getAccessScope = async (user) => {
  if (isHRAdmin(user)) {
    return { all: true, ids: null, teamIds: [], selfId: user.id };
  }
  if (isManager(user)) {
    const reports = await getDirectReports(user.id);
    const teamIds = reports.map((employee) => employee.id);
    return { all: false, ids: [user.id, ...teamIds], teamIds, selfId: user.id };
  }
  return { all: false, ids: [user.id], teamIds: [], selfId: user.id };
};

export const scopeWhere = (scope, column = 'employee_id') =>
  scope.all ? {} : { [column]: { in: scope.ids } };

export const canAccessEmployee = async (user, employeeId) => {
  if (isHRAdmin(user)) return true;
  if (user.id === employeeId) return true;
  if (!isManager(user)) return false;
  const target = await db.findById('employees', employeeId);
  return Boolean(target && target.reports_to === user.id);
};

export const assertEmployeeAccess = async (user, employeeId) => {
  const allowed = await canAccessEmployee(user, employeeId);
  if (!allowed) {
    const { forbidden } = await import('./errors.js');
    throw forbidden('You do not have access to this employee record');
  }
};

export const assertSelfOrHRAdmin = async (user, employeeId) => {
  if (isHRAdmin(user) || user.id === employeeId) return;
  const { forbidden } = await import('./errors.js');
  throw forbidden('You do not have access to this employee record');
};
