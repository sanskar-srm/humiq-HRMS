export const ROLES = Object.freeze({
  ADMIN: 'Admin',
  HR: 'HR',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
});

const ADMIN_LEVELS = ['CEO', 'President', 'AVP'];

/**
 * Central role derivation. Admin > HR > Manager > Employee.
 * Kept in one place so reporting-line changes are handled consistently.
 */
export const deriveRole = (employee, directReportCount = 0) => {
  if (!employee) return ROLES.EMPLOYEE;
  if (ADMIN_LEVELS.includes(employee.employment_level) || employee.department === 'Executive') {
    return ROLES.ADMIN;
  }
  if (employee.department === 'HR') return ROLES.HR;
  if (directReportCount > 0) return ROLES.MANAGER;
  return ROLES.EMPLOYEE;
};

export const isAdmin = (user) => user?.role === ROLES.ADMIN;
export const isHR = (user) => user?.role === ROLES.HR;
export const isManager = (user) => user?.role === ROLES.MANAGER;
export const isEmployee = (user) => user?.role === ROLES.EMPLOYEE;
export const isHRAdmin = (user) => isAdmin(user) || isHR(user);
export const isStaffAgent = (user) => isAdmin(user) || isHR(user) || isManager(user);

export const canAccessModule = (user, module) => {
  const role = user?.role;
  if (!role) return false;
  const matrix = {
    workforce: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER],
    offboarding: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    attendance: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    compensation: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    payroll: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    onboarding: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    recruitment: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER],
    performance: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    helpdesk: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    engagement: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    relations: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
    lms: [ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE],
  };
  return Boolean(matrix[module]?.includes(role));
};
