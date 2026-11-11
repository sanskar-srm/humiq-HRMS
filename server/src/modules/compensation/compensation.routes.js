import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './compensation.service.js';

const gradeSchema = z.object({
  grade: z.string().min(1).max(40),
  min_salary: z.coerce.number().min(0),
  max_salary: z.coerce.number().min(0),
  currency: z.string().max(3).optional(),
  description: z.string().max(1000).optional(),
});

const structureSchema = z.object({
  employee_id: z.string().uuid(),
  grade_id: z.string().uuid().nullable().optional(),
  base_salary: z.coerce.number().min(0),
  allowances: z.coerce.number().min(0).optional(),
  deductions: z.coerce.number().min(0).optional(),
  tax_percent: z.coerce.number().min(0).max(60).optional(),
  currency: z.string().max(3).optional(),
  effective_date: z.string().optional(),
});

const benefitSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  provider: z.string().max(120).optional(),
  cost: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(),
});

const enrollmentSchema = z.object({
  benefit_id: z.string().uuid(),
  employee_id: z.string().uuid().optional(),
});

const enrollmentStatusSchema = z.object({ status: z.enum(['Active', 'Cancelled']) });

const rewardSchema = z.object({
  employee_id: z.string().uuid(),
  title: z.string().min(2).max(160),
  points: z.coerce.number().int().min(1),
  note: z.string().max(1000).optional(),
});

const reimbursementSchema = z.object({
  employee_id: z.string().uuid().optional(),
  category: z.enum(['Travel', 'Medical', 'Meals', 'Equipment', 'Training', 'Other']),
  amount: z.coerce.number().positive(),
  description: z.string().min(3).max(2000),
  receipt_url: z.string().max(1000).optional(),
});

const decisionSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  note: z.string().max(1000).optional(),
});

export const compensationRouter = Router();
compensationRouter.use(authenticate);

compensationRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));

compensationRouter.get('/salary-grades', asyncHandler(async (req, res) => ok(res, await service.listSalaryGrades(req.user))));
compensationRouter.post('/salary-grades', validate(gradeSchema), asyncHandler(async (req, res) => created(res, await service.createSalaryGrade(req.user, req.body, req))));
compensationRouter.patch('/salary-grades/:id', validate(gradeSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateSalaryGrade(req.user, req.params.id, req.body, req))));

compensationRouter.get('/salary-structures', asyncHandler(async (req, res) => ok(res, await service.listStructures(req.user, req.query.employee_id?.toString()))));
compensationRouter.post('/salary-structures', validate(structureSchema), asyncHandler(async (req, res) => ok(res, await service.upsertStructure(req.user, req.body, req), 'Compensation structure saved')));

compensationRouter.get('/benefits', asyncHandler(async (req, res) => ok(res, await service.listBenefits())));
compensationRouter.post('/benefits', validate(benefitSchema), asyncHandler(async (req, res) => created(res, await service.createBenefit(req.user, req.body, req))));
compensationRouter.patch('/benefits/:id', validate(benefitSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateBenefit(req.user, req.params.id, req.body, req))));

compensationRouter.get('/enrollments', asyncHandler(async (req, res) => ok(res, await service.listEnrollments(req.user, req.query.employee_id?.toString()))));
compensationRouter.post('/enrollments', validate(enrollmentSchema), asyncHandler(async (req, res) => created(res, await service.enrollBenefit(req.user, req.body, req), 'Enrolled successfully')));
compensationRouter.patch('/enrollments/:id', validate(enrollmentStatusSchema), asyncHandler(async (req, res) => ok(res, await service.updateEnrollment(req.user, req.params.id, req.body.status, req))));

compensationRouter.get('/rewards', asyncHandler(async (req, res) => ok(res, await service.listRewards(req.user))));
compensationRouter.post('/rewards', validate(rewardSchema), asyncHandler(async (req, res) => created(res, await service.createReward(req.user, req.body, req))));

compensationRouter.get('/reimbursements', asyncHandler(async (req, res) => ok(res, await service.listReimbursements(req.user, {
  employee_id: req.query.employee_id?.toString(),
  status: req.query.status?.toString(),
}))));
compensationRouter.post('/reimbursements', validate(reimbursementSchema), asyncHandler(async (req, res) => created(res, await service.createReimbursement(req.user, req.body, req), 'Reimbursement submitted')));
compensationRouter.patch('/reimbursements/:id/decision', validate(decisionSchema), asyncHandler(async (req, res) => ok(res, await service.decideReimbursement(req.user, req.params.id, req.body.decision, req.body.note, req))));
