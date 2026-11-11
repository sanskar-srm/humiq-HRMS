import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created, noContent } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireStaff } from '../../middleware/authorize.js';
import * as service from './workforce.service.js';

const projectSchema = z.object({
  name: z.string().min(2).max(160),
  department: z.string().max(80).optional(),
  status: z.enum(['Planning', 'Active', 'On Hold', 'Completed']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  budget: z.coerce.number().min(0).optional(),
  description: z.string().max(2000).optional(),
});

const allocationSchema = z.object({
  employee_id: z.string().uuid(),
  project_id: z.string().uuid(),
  allocation_percent: z.coerce.number().min(1).max(100),
  role: z.string().max(120).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const forecastSchema = z.object({
  department: z.string().min(1).max(80),
  period: z.string().min(1).max(40),
  current_headcount: z.coerce.number().int().min(0),
  forecast_headcount: z.coerce.number().int().min(0),
  cost_impact: z.coerce.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

const skillSchema = z.object({
  employee_id: z.string().uuid(),
  skill: z.string().min(1).max(120),
  proficiency: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
  years_experience: z.coerce.number().min(0).max(60).optional(),
});

const successionSchema = z.object({
  position: z.string().min(2).max(160),
  department: z.string().min(1).max(80),
  current_holder_id: z.string().uuid().nullable().optional(),
  successor_id: z.string().uuid(),
  readiness: z.enum(['Ready Now', '1-2 Years', '3+ Years']),
  notes: z.string().max(2000).optional(),
});

export const workforceRouter = Router();
workforceRouter.use(authenticate, requireStaff);

workforceRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));
workforceRouter.get('/projects', asyncHandler(async (req, res) => ok(res, await service.listProjects(req.user))));
workforceRouter.post('/projects', validate(projectSchema), asyncHandler(async (req, res) => created(res, await service.createProject(req.user, req.body, req))));
workforceRouter.patch('/projects/:id', validate(projectSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateProject(req.user, req.params.id, req.body, req))));
workforceRouter.delete('/projects/:id', asyncHandler(async (req, res) => { await service.deleteProject(req.user, req.params.id, req); return noContent(res, 'Project deleted'); }));

workforceRouter.get('/allocations', asyncHandler(async (req, res) => ok(res, await service.listAllocations(req.user))));
workforceRouter.post('/allocations', validate(allocationSchema), asyncHandler(async (req, res) => created(res, await service.createAllocation(req.user, req.body, req))));
workforceRouter.patch('/allocations/:id/end', asyncHandler(async (req, res) => ok(res, await service.endAllocation(req.user, req.params.id, req))));

workforceRouter.get('/forecasts', asyncHandler(async (req, res) => ok(res, await service.listForecasts(req.user))));
workforceRouter.post('/forecasts', validate(forecastSchema), asyncHandler(async (req, res) => created(res, await service.createForecast(req.user, req.body, req))));

workforceRouter.get('/skills', asyncHandler(async (req, res) => ok(res, await service.listSkills(req.user, req.query.employee_id?.toString()))));
workforceRouter.post('/skills', validate(skillSchema), asyncHandler(async (req, res) => created(res, await service.createSkill(req.user, req.body, req))));
workforceRouter.patch('/skills/:id', validate(skillSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateSkill(req.user, req.params.id, req.body, req))));

workforceRouter.get('/succession', asyncHandler(async (req, res) => ok(res, await service.listSuccession(req.user))));
workforceRouter.post('/succession', validate(successionSchema), asyncHandler(async (req, res) => created(res, await service.createSuccession(req.user, req.body, req))));
