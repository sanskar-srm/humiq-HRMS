import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './relations.service.js';

const caseSchema = z.object({
  employee_id: z.string().uuid().optional(),
  subject: z.string().min(3).max(200),
  description: z.string().min(5).max(10000),
  category: z.enum(['Concern', 'Grievance', 'Policy Deviation', 'Harassment', 'Other']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
});

const caseUpdateSchema = z.object({
  subject: z.string().min(3).max(200).optional(),
  description: z.string().min(5).max(10000).optional(),
  category: z.enum(['Concern', 'Grievance', 'Policy Deviation', 'Harassment', 'Other']).optional(),
  status: z.enum(['Intake', 'Investigation', 'Action', 'Resolution', 'Closed']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  investigation_notes: z.string().max(10000).optional(),
  corrective_action: z.string().max(10000).optional(),
  resolution_summary: z.string().max(10000).optional(),
});

export const relationsRouter = Router();
relationsRouter.use(authenticate);

relationsRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));
relationsRouter.get('/analytics', asyncHandler(async (req, res) => ok(res, await service.analytics(req.user))));
relationsRouter.get('/cases', asyncHandler(async (req, res) => ok(res, await service.listCases(req.user, {
  status: req.query.status?.toString(),
  employee_id: req.query.employee_id?.toString(),
}))));
relationsRouter.post('/cases', validate(caseSchema), asyncHandler(async (req, res) => created(res, await service.createCase(req.user, req.body, req), 'Case created')));
relationsRouter.get('/cases/:id', asyncHandler(async (req, res) => ok(res, await service.getCase(req.user, req.params.id))));
relationsRouter.patch('/cases/:id', validate(caseUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateCase(req.user, req.params.id, req.body, req))));
