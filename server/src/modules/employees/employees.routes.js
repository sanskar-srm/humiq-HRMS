import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created, paginated, parsePagination } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, requireAdmin, requireHRAdmin } from '../../middleware/authorize.js';
import { ROLES } from '../../utils/roles.js';
import * as service from './employees.service.js';

const createSchema = z.object({
  employee_code: z.string().min(2).max(20).optional(),
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  department: z.string().min(1).max(80),
  designation: z.string().min(1).max(120),
  employment_level: z.string().max(40).optional(),
  reports_to: z.string().uuid().nullable().optional(),
  date_of_joining: z.string().optional(),
  employment_status: z.string().max(40).optional(),
  password: z.string().min(8).optional(),
  is_active: z.boolean().optional(),
});

const updateSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).nullable().optional(),
  department: z.string().min(1).max(80).optional(),
  designation: z.string().min(1).max(120).optional(),
  employment_level: z.string().max(40).optional(),
  reports_to: z.string().uuid().nullable().optional(),
  date_of_joining: z.string().optional(),
  employment_status: z.string().max(40).optional(),
  is_active: z.boolean().optional(),
});

const resetSchema = z.object({ new_password: z.string().min(8).optional() });

export const employeesRouter = Router();
employeesRouter.use(authenticate);

const listQuery = (req) => ({
  pagination: parsePagination(req.query),
  search: req.query.search?.toString().trim() ?? '',
  department: req.query.department?.toString() ?? '',
  status: req.query.status?.toString() ?? '',
  role: req.query.role?.toString() ?? '',
  sort: req.query.sort?.toString() ?? 'full_name',
  order: req.query.order?.toString() ?? 'asc',
});

employeesRouter.get('/', authorize(ROLES.ADMIN, ROLES.HR, ROLES.MANAGER), asyncHandler(async (req, res) => {
  const { rows, total, page, limit } = await service.listEmployees(req.user, listQuery(req));
  return paginated(res, rows, { page, limit, total }, 'Employees retrieved successfully');
}));

employeesRouter.get('/options', asyncHandler(async (req, res) =>
  ok(res, await service.options(req.user), 'Employee options retrieved successfully'),
));

employeesRouter.get('/departments', asyncHandler(async (_req, res) =>
  ok(res, await service.departments(), 'Departments retrieved successfully'),
));

employeesRouter.get('/me', asyncHandler(async (req, res) =>
  ok(res, await service.getEmployee(req.user, req.user.id), 'Profile retrieved successfully'),
));

employeesRouter.get('/audit-logs', requireAdmin, asyncHandler(async (req, res) => {
  const { rows, total, page, limit } = await service.listAuditLogs({
    pagination: parsePagination(req.query),
    action: req.query.action?.toString() ?? '',
    entity_type: req.query.entity_type?.toString() ?? '',
  });
  return paginated(res, rows, { page, limit, total }, 'Audit logs retrieved successfully');
}));

employeesRouter.get('/:id', asyncHandler(async (req, res) =>
  ok(res, await service.getEmployee(req.user, req.params.id), 'Employee retrieved successfully'),
));

employeesRouter.post('/', requireHRAdmin, validate(createSchema), asyncHandler(async (req, res) => {
  const result = await service.createEmployee(req.user, req.body, req);
  return created(res, result, 'Employee created successfully');
}));

employeesRouter.patch('/:id', requireHRAdmin, validate(updateSchema), asyncHandler(async (req, res) =>
  ok(res, await service.updateEmployee(req.user, req.params.id, req.body, req), 'Employee updated successfully'),
));

employeesRouter.post('/:id/reset-password', requireHRAdmin, validate(resetSchema), asyncHandler(async (req, res) =>
  ok(res, await service.resetPassword(req.user, req.params.id, req.body.new_password, req), 'Password reset successfully'),
));
