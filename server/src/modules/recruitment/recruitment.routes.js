import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireStaff } from '../../middleware/authorize.js';
import * as service from './recruitment.service.js';

const requisitionSchema = z.object({
  title: z.string().min(2).max(160),
  department: z.string().min(1).max(80),
  position_count: z.coerce.number().int().min(1).max(500),
  employment_type: z.enum(['Full Time', 'Part Time', 'Contract', 'Internship']).optional(),
  budget: z.coerce.number().min(0).optional(),
  description: z.string().max(5000).optional(),
});

const approvalSchema = z.object({
  step: z.enum(['Manager', 'Admin']),
  decision: z.enum(['Approved', 'Rejected']),
  reason: z.string().max(1000).optional(),
});

const candidateSchema = z.object({
  requisition_id: z.string().uuid(),
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  resume_url: z.string().url().max(1000).optional(),
  source: z.string().max(80).optional(),
});

const candidateUpdateSchema = z.object({
  stage: z.enum(['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected', 'Withdrawn']).optional(),
  status: z.enum(['Active', 'Hired', 'Rejected', 'Withdrawn']).optional(),
  phone: z.string().max(30).optional(),
  resume_url: z.string().url().max(1000).optional(),
  notes: z.string().max(2000).optional(),
});

const interviewSchema = z.object({
  candidate_id: z.string().uuid(),
  interviewer_id: z.string().uuid(),
  scheduled_at: z.string().min(10),
  mode: z.enum(['Video', 'Phone', 'Onsite']).optional(),
  location: z.string().max(255).optional(),
});

const interviewUpdateSchema = z.object({
  scheduled_at: z.string().optional(),
  mode: z.enum(['Video', 'Phone', 'Onsite']).optional(),
  location: z.string().max(255).optional(),
  status: z.enum(['Scheduled', 'Completed', 'Cancelled', 'No Show']).optional(),
  feedback: z.string().max(3000).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const offerSchema = z.object({
  candidate_id: z.string().uuid(),
  designation: z.string().min(2).max(160),
  salary: z.coerce.number().positive(),
  currency: z.string().max(3).optional(),
  joining_date: z.string().optional(),
});

const openingSchema = z.object({
  requisition_id: z.string().uuid(),
  title: z.string().min(2).max(160).optional(),
  location: z.string().max(160).optional(),
});

const openingUpdateSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  location: z.string().max(160).optional(),
  status: z.enum(['Open', 'Closed', 'On Hold']).optional(),
});

export const recruitmentRouter = Router();
recruitmentRouter.use(authenticate, requireStaff);

recruitmentRouter.get('/requisitions', asyncHandler(async (req, res) => ok(res, await service.listRequisitions(req.user, {
  status: req.query.status?.toString(),
  department: req.query.department?.toString(),
}))));
recruitmentRouter.post('/requisitions', validate(requisitionSchema), asyncHandler(async (req, res) => created(res, await service.createRequisition(req.user, req.body, req), 'Requisition created')));
recruitmentRouter.get('/requisitions/:id', asyncHandler(async (req, res) => ok(res, await service.getRequisition(req.user, req.params.id))));
recruitmentRouter.get('/requisitions/:id/approvals', asyncHandler(async (req, res) => {
  const requisition = await service.getRequisition(req.user, req.params.id);
  return ok(res, requisition.approvals);
}));
recruitmentRouter.post('/requisitions/:id/approve', validate(approvalSchema), asyncHandler(async (req, res) =>
  ok(res, await service.decideRequisition(req.user, req.params.id, req.body.step, req.body.decision, req.body.reason, req), `Requisition ${req.body.decision.toLowerCase()}`),
));

recruitmentRouter.get('/candidates', asyncHandler(async (req, res) => ok(res, await service.listCandidates(req.user, {
  requisition_id: req.query.requisition_id?.toString(),
  stage: req.query.stage?.toString(),
}))));
recruitmentRouter.post('/candidates', validate(candidateSchema), asyncHandler(async (req, res) => created(res, await service.createCandidate(req.user, req.body, req))));
recruitmentRouter.patch('/candidates/:id', validate(candidateUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateCandidate(req.user, req.params.id, req.body, req))));

recruitmentRouter.get('/interviews', asyncHandler(async (req, res) => ok(res, await service.listInterviews(req.user, { candidate_id: req.query.candidate_id?.toString() }))));
recruitmentRouter.post('/interviews', validate(interviewSchema), asyncHandler(async (req, res) => created(res, await service.scheduleInterview(req.user, req.body, req))));
recruitmentRouter.patch('/interviews/:id', validate(interviewUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateInterview(req.user, req.params.id, req.body, req))));

recruitmentRouter.get('/offers', asyncHandler(async (req, res) => ok(res, await service.listOffers(req.user))));
recruitmentRouter.post('/offers', validate(offerSchema), asyncHandler(async (req, res) => created(res, await service.createOffer(req.user, req.body, req))));
recruitmentRouter.post('/offers/:id/issue', asyncHandler(async (req, res) => ok(res, await service.issueOffer(req.user, req.params.id, req), 'Offer issued')));
recruitmentRouter.post('/offers/:id/revoke', asyncHandler(async (req, res) => ok(res, await service.revokeOffer(req.user, req.params.id, req), 'Offer revoked')));

recruitmentRouter.get('/openings', asyncHandler(async (req, res) => ok(res, await service.listOpenings(req.user))));
recruitmentRouter.post('/openings', validate(openingSchema), asyncHandler(async (req, res) => created(res, await service.createOpening(req.user, req.body, req))));
recruitmentRouter.patch('/openings/:id', validate(openingUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateOpening(req.user, req.params.id, req.body, req))));

export const publicRecruitmentRouter = Router();
publicRecruitmentRouter.get('/offers/:token', asyncHandler(async (req, res) => ok(res, await service.publicOffer(req.params.token))));
publicRecruitmentRouter.post('/offers/:token/accept', asyncHandler(async (req, res) => ok(res, await service.acceptOffer(req.params.token, req), 'Offer accepted')));
