import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './engagement.service.js';

const surveySchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  status: z.enum(['Draft', 'Active', 'Closed']).optional(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
});

const questionSchema = z.object({
  question_text: z.string().min(2).max(1000),
  question_type: z.enum(['Rating', 'Text', 'Choice']).optional(),
  options: z.array(z.string()).optional(),
  sort_order: z.coerce.number().int().optional(),
});

const assignSchema = z.object({
  employee_ids: z.array(z.string().uuid()).min(1),
  activate_survey: z.boolean().optional(),
});

const responseItemSchema = z.object({
  question_id: z.string().uuid(),
  answer_text: z.string().max(5000).optional().nullable(),
  answer_rating: z.coerce.number().int().min(1).max(5).optional().nullable(),
});

const submitSurveySchema = z.object({ responses: z.array(responseItemSchema).min(1) });

const feedbackSchema = z.object({
  category: z.enum(['General', 'Manager', 'Workplace', 'Suggestion', 'Other']).optional(),
  message: z.string().min(3).max(5000),
});

const feedbackUpdateSchema = z.object({ status: z.enum(['Submitted', 'Reviewed', 'Closed']).optional() });

const wellnessSchema = z.object({
  mood_score: z.coerce.number().int().min(1).max(5),
  stress_level: z.coerce.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().max(2000).optional(),
});

const recognitionSchema = z.object({
  employee_id: z.string().uuid(),
  points: z.coerce.number().int().min(0).optional(),
  badge: z.string().max(120).optional().nullable(),
  reason: z.string().max(2000).optional(),
});

const pulseSchema = z.object({
  question: z.string().min(3).max(500),
  status: z.enum(['Draft', 'Active', 'Closed']).optional(),
  closes_at: z.string().optional().nullable(),
});

const pulseResponseSchema = z.object({ response: z.string().min(1).max(1000) });

export const engagementRouter = Router();
engagementRouter.use(authenticate);

engagementRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));
engagementRouter.get('/analytics', asyncHandler(async (req, res) => ok(res, await service.analytics(req.user))));

engagementRouter.get('/surveys', asyncHandler(async (req, res) => ok(res, await service.listSurveys(req.user, { status: req.query.status?.toString() }))));
engagementRouter.post('/surveys', validate(surveySchema), asyncHandler(async (req, res) => created(res, await service.createSurvey(req.user, req.body, req))));
engagementRouter.patch('/surveys/:id', validate(surveySchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateSurvey(req.user, req.params.id, req.body, req))));
engagementRouter.get('/surveys/:id', asyncHandler(async (req, res) => ok(res, await service.getSurveyWithQuestions(req.user, req.params.id))));
engagementRouter.post('/surveys/:id/questions', validate(questionSchema), asyncHandler(async (req, res) => created(res, await service.addSurveyQuestion(req.user, req.params.id, req.body, req))));
engagementRouter.post('/surveys/:id/assign', validate(assignSchema), asyncHandler(async (req, res) => created(res, await service.assignSurvey(req.user, req.params.id, req.body, req))));
engagementRouter.post('/survey-assignments/:id/submit', validate(submitSurveySchema), asyncHandler(async (req, res) => ok(res, await service.submitSurveyResponses(req.user, req.params.id, req.body.responses, req))));

engagementRouter.get('/feedback', asyncHandler(async (req, res) => ok(res, await service.listFeedback(req.user, {
  employee_id: req.query.employee_id?.toString(),
  status: req.query.status?.toString(),
}))));
engagementRouter.post('/feedback', validate(feedbackSchema), asyncHandler(async (req, res) => created(res, await service.createFeedback(req.user, req.body, req))));
engagementRouter.patch('/feedback/:id', validate(feedbackUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateFeedback(req.user, req.params.id, req.body, req))));

engagementRouter.get('/wellness', asyncHandler(async (req, res) => ok(res, await service.listWellness(req.user, { employee_id: req.query.employee_id?.toString() }))));
engagementRouter.post('/wellness', validate(wellnessSchema), asyncHandler(async (req, res) => created(res, await service.createWellnessCheckin(req.user, req.body, req))));

engagementRouter.get('/recognition', asyncHandler(async (req, res) => ok(res, await service.listRecognition(req.user, { employee_id: req.query.employee_id?.toString() }))));
engagementRouter.post('/recognition', validate(recognitionSchema), asyncHandler(async (req, res) => created(res, await service.awardRecognition(req.user, req.body, req))));

engagementRouter.get('/pulse', asyncHandler(async (req, res) => ok(res, await service.listPulsePolls(req.user))));
engagementRouter.post('/pulse', validate(pulseSchema), asyncHandler(async (req, res) => created(res, await service.createPulsePoll(req.user, req.body, req))));
engagementRouter.post('/pulse/:id/respond', validate(pulseResponseSchema), asyncHandler(async (req, res) => created(res, await service.respondPulse(req.user, req.params.id, req.body.response, req))));
