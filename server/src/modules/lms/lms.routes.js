import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './lms.service.js';

const courseSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(10000).optional(),
  duration_hours: z.coerce.number().min(0.1).max(500).optional(),
  category: z.string().max(80).optional(),
  status: z.enum(['Draft', 'Published', 'Archived']).optional(),
  content: z.string().max(50000).optional(),
});

const assignSchema = z.object({
  course_id: z.string().uuid(),
  employee_ids: z.array(z.string().uuid()).min(1),
  due_date: z.string().optional().nullable(),
});

const assignmentUpdateSchema = z.object({
  progress: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(['Assigned', 'In Progress', 'Completed']).optional(),
});

const announcementSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(3).max(10000),
  status: z.enum(['Draft', 'Published', 'Archived']).optional(),
});

const assessmentAnswerSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.string().min(1).max(2000),
});

const submitAssessmentSchema = z.object({ answers: z.array(assessmentAnswerSchema).min(1) });

export const lmsRouter = Router();
lmsRouter.use(authenticate);

lmsRouter.get('/overview', asyncHandler(async (req, res) => ok(res, await service.overview(req.user))));
lmsRouter.get('/courses', asyncHandler(async (req, res) => ok(res, await service.listCourses(req.user, { status: req.query.status?.toString() }))));
lmsRouter.post('/courses', validate(courseSchema), asyncHandler(async (req, res) => created(res, await service.createCourse(req.user, req.body, req))));
lmsRouter.patch('/courses/:id', validate(courseSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateCourse(req.user, req.params.id, req.body, req))));
lmsRouter.get('/courses/:id', asyncHandler(async (req, res) => ok(res, await service.getCourse(req.user, req.params.id))));

lmsRouter.get('/assignments', asyncHandler(async (req, res) => ok(res, await service.listAssignments(req.user, {
  employee_id: req.query.employee_id?.toString(),
  course_id: req.query.course_id?.toString(),
  status: req.query.status?.toString(),
}))));
lmsRouter.post('/assignments', validate(assignSchema), asyncHandler(async (req, res) => created(res, await service.assignCourse(req.user, req.body, req), 'Training assigned')));
lmsRouter.patch('/assignments/:id', validate(assignmentUpdateSchema), asyncHandler(async (req, res) => ok(res, await service.updateAssignment(req.user, req.params.id, req.body, req))));

lmsRouter.get('/announcements', asyncHandler(async (req, res) => ok(res, await service.listAnnouncements(req.user))));
lmsRouter.post('/announcements', validate(announcementSchema), asyncHandler(async (req, res) => created(res, await service.createAnnouncement(req.user, req.body, req))));

lmsRouter.post('/assessments/:id/submit', validate(submitAssessmentSchema), asyncHandler(async (req, res) => ok(res, await service.submitAssessment(req.user, req.params.id, req.body.answers, req))));

lmsRouter.get('/certificates', asyncHandler(async (req, res) => ok(res, await service.listCertificates(req.user, { employee_id: req.query.employee_id?.toString() }))));
