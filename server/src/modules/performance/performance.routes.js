import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './performance.service.js';

const cycleSchema = z.object({
  name: z.string().min(2).max(160),
  period_start: z.string().min(10).max(10),
  period_end: z.string().min(10).max(10),
  status: z.enum(['Draft', 'Active', 'Closed']).optional(),
});

const goalSchema = z.object({
  employee_id: z.string().uuid().optional(),
  cycle_id: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(3000).optional(),
  target: z.string().max(1000).optional(),
  weightage: z.coerce.number().min(0).max(100).optional(),
});

const goalUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(3000).optional(),
  target: z.string().max(1000).optional(),
  weightage: z.coerce.number().min(0).max(100).optional(),
  progress: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(['Not Started', 'In Progress', 'Completed', 'At Risk', 'Cancelled']).optional(),
});

const reviewSchema = z.object({
  employee_id: z.string().uuid(),
  cycle_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  strengths: z.string().max(3000).optional(),
  improvements: z.string().max(3000).optional(),
  comments: z.string().max(3000).optional(),
});

const reviewUpdateSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  strengths: z.string().max(3000).optional(),
  improvements: z.string().max(3000).optional(),
  comments: z.string().max(3000).optional(),
  status: z.enum(['Draft', 'In Progress', 'Submitted', 'Acknowledged', 'Completed']).optional(),
});

const feedbackSchema = z.object({
  employee_id: z.string().uuid(),
  type: z.enum(['Praise', 'Constructive', 'Peer', 'Manager']),
  message: z.string().min(3).max(3000),
  visibility: z.enum(['Manager and HR', 'Employee and HR', 'Private']).optional(),
});

const skillSchema = z.object({
  employee_id: z.string().uuid(),
  skill: z.string().min(1).max(120),
  proficiency: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
  years_experience: z.coerce.number().min(0).max(60).optional(),
});

export const performanceRouter = Router();
performanceRouter.use(authenticate);

performanceRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));

performanceRouter.get('/cycles', asyncHandler(async (req, res) => ok(res, await service.listCycles())));
performanceRouter.post('/cycles', validate(cycleSchema), asyncHandler(async (req, res) => created(res, await service.createCycle(req.user, req.body, req))));
performanceRouter.patch('/cycles/:id', validate(cycleSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateCycle(req.user, req.params.id, req.body, req))));

performanceRouter.get('/goals', asyncHandler(async (req, res) => ok(res, await service.listGoals(req.user, {
  employee_id: req.query.employee_id?.toString(),
  cycle_id: req.query.cycle_id?.toString(),
  status: req.query.status?.toString(),
}))));
performanceRouter.post('/goals', validate(goalSchema), asyncHandler(async (req, res) => created(res, await service.createGoal(req.user, req.body, req))));
performanceRouter.patch('/goals/:id', validate(goalUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateGoal(req.user, req.params.id, req.body, req))));

performanceRouter.get('/reviews', asyncHandler(async (req, res) => ok(res, await service.listReviews(req.user, {
  employee_id: req.query.employee_id?.toString(),
  cycle_id: req.query.cycle_id?.toString(),
  status: req.query.status?.toString(),
}))));
performanceRouter.post('/reviews', validate(reviewSchema), asyncHandler(async (req, res) => created(res, await service.createReview(req.user, req.body, req))));
performanceRouter.patch('/reviews/:id', validate(reviewUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateReview(req.user, req.params.id, req.body, req))));

performanceRouter.get('/feedback', asyncHandler(async (req, res) => ok(res, await service.listFeedback(req.user, { employee_id: req.query.employee_id?.toString() }))));
performanceRouter.post('/feedback', validate(feedbackSchema), asyncHandler(async (req, res) => created(res, await service.createFeedback(req.user, req.body, req))));

performanceRouter.get('/skills', asyncHandler(async (req, res) => ok(res, await service.listSkills(req.user, req.query.employee_id?.toString()))));
performanceRouter.post('/skills', validate(skillSchema), asyncHandler(async (req, res) => created(res, await service.createSkill(req.user, req.body, req))));
performanceRouter.patch('/skills/:id', validate(skillSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateSkill(req.user, req.params.id, req.body, req))));

performanceRouter.get('/reports', asyncHandler(async (req, res) => ok(res, await service.reports(req.user))));
