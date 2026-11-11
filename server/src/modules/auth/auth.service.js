import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../../db/index.js';
import { signToken } from '../../middleware/authenticate.js';
import config from '../../config/env.js';
import { badRequest, conflict, forbidden, unauthorized } from '../../utils/errors.js';
import { deriveRole, ROLES } from '../../utils/roles.js';
import { recordAudit } from '../../utils/audit.js';

const SALT_ROUNDS = 12;

export const sanitizeEmployee = (employee) => {
  if (!employee) return null;
  const { password_hash, ...safe } = employee;
  return safe;
};

const directReportCount = async (employeeId) =>
  db.count('employees', { reports_to: employeeId, is_active: true });

export const syncRole = async (employee) => {
  const count = await directReportCount(employee.id);
  const derived = deriveRole(employee, count);
  if (derived !== employee.role) {
    const [updated] = await db.update('employees', { id: employee.id }, { role: derived });
    await recordAudit({
      actorId: employee.id,
      action: 'ROLE_RECALCULATED',
      entityType: 'employee',
      entityId: employee.id,
      details: { from: employee.role, to: derived },
    });
    return updated ?? { ...employee, role: derived };
  }
  return employee;
};

const buildProfile = async (employee) => {
  const manager = employee.reports_to ? await db.findById('employees', employee.reports_to) : null;
  return {
    ...sanitizeEmployee(employee),
    manager_name: manager?.full_name ?? null,
    direct_reports: await directReportCount(employee.id),
  };
};

const verifyPassword = async (password, hash) => {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
};

export const staffLogin = async (employeeCode, password, req) => {
  const [employee] = await db.select('employees', {
    where: { employee_code: employeeCode.trim().toUpperCase() },
    limit: 1,
  });

  if (!employee || !(await verifyPassword(password, employee.password_hash))) {
    await recordAudit({
      actorId: employee?.id ?? null,
      action: 'LOGIN_FAILED',
      entityType: 'auth',
      entityId: employee?.id ?? null,
      details: { employee_code: employeeCode },
      req,
    });
    throw unauthorized('Invalid employee ID or password');
  }
  if (employee.is_active === false) throw forbidden('This account is inactive');

  const synced = await syncRole(employee);
  const token = signToken(synced);
  await recordAudit({
    actorId: synced.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'auth',
    entityId: synced.id,
    details: { portal: 'staff' },
    req,
  });
  return { token, user: await buildProfile(synced) };
};

export const employeeLogin = async (email, password, req) => {
  const [employee] = await db.select('employees', {
    where: { email: email.trim().toLowerCase() },
    limit: 1,
  });
  if (!employee || !(await verifyPassword(password, employee.password_hash))) {
    await recordAudit({
      actorId: employee?.id ?? null,
      action: 'LOGIN_FAILED',
      entityType: 'auth',
      entityId: employee?.id ?? null,
      details: { portal: 'employee', email },
      req,
    });
    throw unauthorized('Invalid email or password');
  }
  if (employee.is_active === false) throw forbidden('This account is inactive');

  const synced = await syncRole(employee);
  const token = signToken(synced);
  await recordAudit({
    actorId: synced.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'auth',
    entityId: synced.id,
    details: { portal: 'employee' },
    req,
  });
  return { token, user: await buildProfile(synced) };
};

const nextEmployeeCode = async () => {
  const employees = await db.select('employees', { limit: 5000 });
  const max = employees.reduce((acc, employee) => {
    const match = /^EMP(\d+)$/.exec(employee.employee_code ?? '');
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `EMP${String(max + 1).padStart(3, '0')}`;
};

export const registerEmployee = async (payload, req) => {
  if (!config.registrationCode) {
    throw forbidden('Employee self-registration is disabled. Contact HR for an invitation.');
  }
  if (payload.registration_code !== config.registrationCode) {
    throw forbidden('Invalid registration code');
  }

  const email = payload.email.trim().toLowerCase();
  const existing = await db.count('employees', { email });
  if (existing) throw conflict('An employee with this email already exists');

  const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);
  const employeeCode = await nextEmployeeCode();
  const base = {
    employee_code: employeeCode,
    full_name: payload.full_name.trim(),
    email,
    phone: payload.phone ?? null,
    department: payload.department,
    designation: payload.designation ?? 'Employee',
    employment_level: 'IC',
    reports_to: null,
    date_of_joining: payload.date_of_joining ?? new Date().toISOString().slice(0, 10),
    employment_status: 'Pending Verification',
    password_hash: passwordHash,
    // Self-registration never grants a trusted role. HR must verify and
    // activate the account; role is derived at that point.
    role: ROLES.EMPLOYEE,
    is_active: false,
  };
  const employee = await db.insert('employees', base);
  await recordAudit({
    actorId: employee.id,
    action: 'EMPLOYEE_SELF_REGISTERED',
    entityType: 'employee',
    entityId: employee.id,
    details: { employee_code: employeeCode, department: payload.department, status: 'Pending Verification' },
    req,
  });
  return { employee: sanitizeEmployee(employee), pending_verification: true };
};

export const changePassword = async (user, currentPassword, newPassword, req) => {
  const employee = await db.findById('employees', user.id);
  if (!employee || !(await verifyPassword(currentPassword, employee.password_hash))) {
    throw badRequest('Current password is incorrect');
  }
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.update('employees', { id: user.id }, { password_hash: passwordHash });
  await recordAudit({
    actorId: user.id,
    action: 'PASSWORD_CHANGED',
    entityType: 'employee',
    entityId: user.id,
    req,
  });
};

export const profile = async (userId) => {
  const employee = await db.findById('employees', userId);
  if (!employee) throw unauthorized('Account no longer exists');
  return buildProfile(employee);
};

export const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);

export const generateTemporaryPassword = () => crypto.randomBytes(9).toString('base64url');
