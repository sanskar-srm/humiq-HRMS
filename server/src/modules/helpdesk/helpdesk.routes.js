import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created, noContent } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './helpdesk.service.js';

const ticketSchema = z.object({
  employee_id: z.string().uuid().optional(),
  category_id: z.string().uuid(),
  subject: z.string().min(3).max(200),
  description: z.string().min(5).max(5000),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
});

const ticketUpdateSchema = z.object({
  status: z.enum(['Open', 'In Progress', 'Pending', 'Escalated', 'Resolved', 'Closed']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  escalation_reason: z.string().max(1000).optional(),
});

const commentSchema = z.object({
  message: z.string().min(1).max(5000),
  is_internal: z.boolean().optional(),
});

const csatSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

const categorySchema = z.object({
  name: z.string().min(2).max(120),
  department: z.string().min(1).max(80),
  sla_hours: z.coerce.number().int().min(1).max(720),
  default_assignee_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

const articleSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(10).max(50000),
  category_id: z.string().uuid(),
});

const articleUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  content: z.string().min(10).max(50000).optional(),
  category_id: z.string().uuid().optional(),
  status: z.enum(['Draft', 'Awaiting Review', 'Published', 'Archived']).optional(),
});

const voteSchema = z.object({ vote: z.enum(['Helpful', 'Not Helpful']) });

const documentRequestSchema = z.object({
  document_type: z.enum(['Salary Certificate', 'Experience Letter', 'NOC', 'Form 16', 'Other']),
  reason: z.string().max(1000).optional(),
});

const issueDocumentSchema = z.object({
  document_type: z.enum(['Salary Certificate', 'Experience Letter', 'NOC', 'Form 16', 'Other']).optional(),
  note: z.string().max(3000).optional(),
});

export const helpdeskRouter = Router();
helpdeskRouter.use(authenticate);

helpdeskRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));
helpdeskRouter.get('/tickets', asyncHandler(async (req, res) => ok(res, await service.listTickets(req.user, {
  status: req.query.status?.toString(),
  priority: req.query.priority?.toString(),
  assigned_to: req.query.assigned_to?.toString(),
  category_id: req.query.category_id?.toString(),
  employee_id: req.query.employee_id?.toString(),
}))));
helpdeskRouter.post('/tickets', validate(ticketSchema), asyncHandler(async (req, res) => created(res, await service.createTicket(req.user, req.body, req), 'Ticket created')));
helpdeskRouter.get('/tickets/:id', asyncHandler(async (req, res) => ok(res, await service.getTicket(req.user, req.params.id))));
helpdeskRouter.patch('/tickets/:id', validate(ticketUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateTicket(req.user, req.params.id, req.body, req))));
helpdeskRouter.patch('/tickets/:id/close', asyncHandler(async (req, res) => ok(res, await service.closeOwnTicket(req.user, req.params.id, req))));
helpdeskRouter.post('/tickets/:id/comments', validate(commentSchema), asyncHandler(async (req, res) => created(res, await service.addComment(req.user, req.params.id, req.body.message, req.body.is_internal, req))));
helpdeskRouter.post('/tickets/:id/csat', validate(csatSchema), asyncHandler(async (req, res) => ok(res, await service.submitCsat(req.user, req.params.id, req.body.rating, req.body.comment, req))));

helpdeskRouter.get('/categories', asyncHandler(async (req, res) => ok(res, await service.listCategories())));
helpdeskRouter.post('/categories', validate(categorySchema), asyncHandler(async (req, res) => created(res, await service.createCategory(req.user, req.body, req))));
helpdeskRouter.patch('/categories/:id', validate(categorySchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateCategory(req.user, req.params.id, req.body, req))));

helpdeskRouter.get('/kb/articles', asyncHandler(async (req, res) => ok(res, await service.listArticles(req.user, {
  status: req.query.status?.toString(),
  category_id: req.query.category_id?.toString(),
  search: req.query.search?.toString(),
}))));
helpdeskRouter.post('/kb/articles', validate(articleSchema), asyncHandler(async (req, res) => created(res, await service.createArticle(req.user, req.body, req))));
helpdeskRouter.get('/kb/articles/:id', asyncHandler(async (req, res) => ok(res, await service.getArticle(req.user, req.params.id))));
helpdeskRouter.patch('/kb/articles/:id', validate(articleUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateArticle(req.user, req.params.id, req.body, req))));
helpdeskRouter.delete('/kb/articles/:id', asyncHandler(async (req, res) => { await service.deleteArticle(req.user, req.params.id, req); return noContent(res, 'Article deleted'); }));
helpdeskRouter.post('/kb/articles/:id/vote', validate(voteSchema), asyncHandler(async (req, res) => ok(res, await service.voteArticle(req.user, req.params.id, req.body.vote, req))));

helpdeskRouter.get('/documents', asyncHandler(async (req, res) => ok(res, await service.listDocuments(req.user, { employee_id: req.query.employee_id?.toString() }))));
helpdeskRouter.get('/documents/requests', asyncHandler(async (req, res) => ok(res, await service.listDocumentRequests(req.user, {
  status: req.query.status?.toString(),
  employee_id: req.query.employee_id?.toString(),
}))));
helpdeskRouter.post('/documents/requests', validate(documentRequestSchema), asyncHandler(async (req, res) => created(res, await service.createDocumentRequest(req.user, req.body, req), 'Document requested')));
helpdeskRouter.patch('/documents/requests/:id', validate(issueDocumentSchema), asyncHandler(async (req, res) => ok(res, await service.issueDocumentRequest(req.user, req.params.id, req.body, req), 'Document issued')));
helpdeskRouter.get('/documents/:id/download', asyncHandler(async (req, res) => {
  const document = await service.downloadDocument(req.user, req.params.id, req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(document.html);
}));

helpdeskRouter.get('/analytics', asyncHandler(async (req, res) => ok(res, await service.analytics(req.user))));
