import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './onboarding.service.js';

const caseSchema = z.object({
  employee_id: z.string().uuid().nullable().optional(),
  candidate_name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  department: z.string().min(1).max(80),
  designation: z.string().min(1).max(120),
  joining_date: z.string().min(10).max(10),
  manager_id: z.string().uuid().nullable().optional(),
}).refine((value) => value.employee_id || value.candidate_name, {
  message: 'Provide an employee or candidate name',
  path: ['candidate_name'],
});

const caseUpdateSchema = z.object({
  candidate_name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  department: z.string().min(1).max(80).optional(),
  designation: z.string().min(1).max(120).optional(),
  joining_date: z.string().min(10).max(10).optional(),
  manager_id: z.string().uuid().nullable().optional(),
  status: z.enum(['Not Started', 'In Progress', 'Completed', 'Cancelled']).optional(),
});

const taskSchema = z.object({
  title: z.string().min(2).max(200),
  category: z.enum(['Paperwork', 'Induction', 'Training', 'IT Provisioning', 'Other']),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string().optional().nullable(),
});

const taskUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  category: z.enum(['Paperwork', 'Induction', 'Training', 'IT Provisioning', 'Other']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: z.enum(['Pending', 'In Progress', 'Completed']).optional(),
});

const documentSchema = z.object({
  document_type: z.enum(['Handbook', 'NDA', 'Policy', 'Tax Form', 'Other']),
  file_name: z.string().max(255).optional(),
});

const documentUpdateSchema = z.object({
  status: z.enum(['Pending', 'Acknowledged', 'Signed']),
  file_name: z.string().max(255).optional(),
});

export const onboardingRouter = Router();
onboardingRouter.use(authenticate);

onboardingRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));
onboardingRouter.get('/cases', asyncHandler(async (req, res) => ok(res, await service.listCases(req.user, {
  status: req.query.status?.toString(),
  department: req.query.department?.toString(),
  employee_id: req.query.employee_id?.toString(),
}))));
onboardingRouter.post('/cases', validate(caseSchema), asyncHandler(async (req, res) => created(res, await service.createCase(req.user, req.body, req), 'Onboarding case created')));
onboardingRouter.get('/cases/:id', asyncHandler(async (req, res) => ok(res, await service.getCase(req.user, req.params.id))));
onboardingRouter.patch('/cases/:id', validate(caseUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateCase(req.user, req.params.id, req.body, req))));
onboardingRouter.post('/cases/:id/tasks', validate(taskSchema), asyncHandler(async (req, res) => created(res, await service.addTask(req.user, req.params.id, req.body, req))));
onboardingRouter.post('/cases/:id/documents', validate(documentSchema), asyncHandler(async (req, res) => created(res, await service.addDocument(req.user, req.params.id, req.body, req))));
onboardingRouter.patch('/tasks/:id', validate(taskUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateTask(req.user, req.params.id, req.body, req))));
onboardingRouter.patch('/documents/:id', validate(documentUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateDocument(req.user, req.params.id, req.body, req))));
