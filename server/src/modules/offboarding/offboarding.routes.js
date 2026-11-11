import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './offboarding.service.js';

const caseSchema = z.object({
  employee_id: z.string().uuid().optional(),
  resignation_date: z.string().min(10).max(10),
  last_working_date: z.string().min(10).max(10),
  reason: z.string().max(2000).optional(),
});

const updateSchema = z.object({
  last_working_date: z.string().min(10).max(10).optional(),
  reason: z.string().max(2000).optional(),
  alumni_notes: z.string().max(2000).optional(),
});

const knowledgeSchema = z.object({ status: z.enum(['Pending', 'In Progress', 'Completed']) });

const interviewSchema = z.object({
  exit_interview_date: z.string().optional(),
  notes: z.string().max(5000).optional(),
});

const clearanceSchema = z.object({
  status: z.enum(['Approved', 'Rejected']),
  notes: z.string().max(2000).optional(),
});

const settlementSchema = z.object({
  amount: z.coerce.number().min(0),
  status: z.enum(['Pending', 'Processed', 'Paid']).optional(),
});

const documentSchema = z.object({
  document_type: z.enum(['Experience Letter', 'Relieving Letter', 'Settlement Statement', 'Other']),
});

export const offboardingRouter = Router();
offboardingRouter.use(authenticate);

offboardingRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));
offboardingRouter.get('/cases', asyncHandler(async (req, res) => ok(res, await service.listCases(req.user, {
  status: req.query.status?.toString(),
  employee_id: req.query.employee_id?.toString(),
}))));
offboardingRouter.post('/cases', validate(caseSchema), asyncHandler(async (req, res) => created(res, await service.createCase(req.user, req.body, req), 'Offboarding case created')));
offboardingRouter.get('/cases/:id', asyncHandler(async (req, res) => ok(res, await service.getCase(req.user, req.params.id))));
offboardingRouter.patch('/cases/:id', validate(updateSchema), asyncHandler(async (req, res) => ok(res, await service.updateCase(req.user, req.params.id, req.body, req))));
offboardingRouter.post('/cases/:id/knowledge-transfer', validate(knowledgeSchema), asyncHandler(async (req, res) => ok(res, await service.updateKnowledgeTransfer(req.user, req.params.id, req.body.status, req))));
offboardingRouter.post('/cases/:id/exit-interview', validate(interviewSchema), asyncHandler(async (req, res) => ok(res, await service.recordExitInterview(req.user, req.params.id, req.body, req))));
offboardingRouter.patch('/cases/:id/clearances/:clearanceId', validate(clearanceSchema), asyncHandler(async (req, res) => ok(res, await service.decideClearance(req.user, req.params.id, req.params.clearanceId, req.body.status, req.body.notes, req))));
offboardingRouter.post('/cases/:id/settlement', validate(settlementSchema), asyncHandler(async (req, res) => ok(res, await service.recordSettlement(req.user, req.params.id, req.body, req))));
offboardingRouter.post('/cases/:id/documents', validate(documentSchema), asyncHandler(async (req, res) => created(res, await service.issueDocument(req.user, req.params.id, req.body.document_type, req))));
offboardingRouter.post('/cases/:id/complete', asyncHandler(async (req, res) => ok(res, await service.completeCase(req.user, req.params.id, req))));
offboardingRouter.post('/cases/:id/withdraw', asyncHandler(async (req, res) => ok(res, await service.withdrawCase(req.user, req.params.id, req))));
offboardingRouter.get('/documents/:id/download', asyncHandler(async (req, res) => {
  const document = await service.downloadDocument(req.user, req.params.id, req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(document.html);
}));
offboardingRouter.get('/alumni', asyncHandler(async (req, res) => ok(res, await service.alumni(req.user))));
