import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, noContent } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import * as service from './auth.service.js';
import { recordAudit } from '../../utils/audit.js';

const loginSchema = z.object({
  employee_id: z.string().min(1, 'Employee ID is required'),
  password: z.string().min(1, 'Password is required'),
});

const employeeLoginSchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().max(30).optional(),
  department: z.string().min(1),
  designation: z.string().max(120).optional(),
  date_of_joining: z.string().optional(),
  registration_code: z.string().min(1),
});

const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, 'New password must be at least 8 characters'),
});

export const authRouter = Router();

authRouter.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const result = await service.staffLogin(req.body.employee_id, req.body.password, req);
  return ok(res, result, 'Signed in successfully');
}));

authRouter.get('/me', authenticate, asyncHandler(async (req, res) =>
  ok(res, await service.profile(req.user.id), 'Profile retrieved successfully'),
));

authRouter.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await recordAudit({
    actorId: req.user.id,
    action: 'LOGOUT',
    entityType: 'auth',
    entityId: req.user.id,
    req,
  });
  return noContent(res, 'Signed out successfully');
}));

authRouter.post('/change-password', authenticate, validate(passwordSchema), asyncHandler(async (req, res) => {
  await service.changePassword(req.user, req.body.current_password, req.body.new_password, req);
  return noContent(res, 'Password updated successfully');
}));

export const employeeAuthRouter = Router();

employeeAuthRouter.post('/login', authLimiter, validate(employeeLoginSchema), asyncHandler(async (req, res) => {
  const result = await service.employeeLogin(req.body.email, req.body.password, req);
  return ok(res, result, 'Signed in successfully');
}));

employeeAuthRouter.post('/register', authLimiter, validate(registerSchema), asyncHandler(async (req, res) => {
  const result = await service.registerEmployee(req.body, req);
  return ok(res, result, 'Registration submitted. An HR administrator must verify and activate your account.');
}));
