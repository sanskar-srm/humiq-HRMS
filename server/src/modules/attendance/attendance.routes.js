import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created, noContent } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './attendance.service.js';

const recordSchema = z.object({
  employee_id: z.string().uuid(),
  date: z.string().min(10).max(10),
  clock_in: z.string().max(5).nullable().optional(),
  clock_out: z.string().max(5).nullable().optional(),
  status: z.enum(['Present', 'Late', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Work From Home']),
  overtime_hours: z.coerce.number().min(0).max(24).optional(),
  notes: z.string().max(1000).optional(),
});

const leaveSchema = z.object({
  employee_id: z.string().uuid().optional(),
  leave_type: z.enum(['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Paternity']),
  start_date: z.string().min(10).max(10),
  end_date: z.string().min(10).max(10),
  reason: z.string().min(3).max(1000),
});

const decisionSchema = z.object({
  decision: z.enum(['Approved', 'Rejected']),
  note: z.string().max(1000).optional(),
});

const shiftSchema = z.object({
  employee_id: z.string().uuid(),
  date: z.string().min(10).max(10),
  shift_name: z.string().min(1).max(80),
  start_time: z.string().max(5),
  end_time: z.string().max(5),
});

const holidaySchema = z.object({
  name: z.string().min(2).max(120),
  date: z.string().min(10).max(10),
  description: z.string().max(500).optional(),
});

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

attendanceRouter.get('/today', asyncHandler(async (req, res) => ok(res, await service.todayRecord(req.user))));
attendanceRouter.post('/clock-in', asyncHandler(async (req, res) => ok(res, await service.clockIn(req.user, req), 'Clocked in successfully')));
attendanceRouter.post('/clock-out', asyncHandler(async (req, res) => ok(res, await service.clockOut(req.user, req), 'Clocked out successfully')));

attendanceRouter.get('/summary', asyncHandler(async (req, res) => ok(res, await service.summary(req.user, req.query.month?.toString()))));
attendanceRouter.get('/calendar', asyncHandler(async (req, res) => ok(res, await service.calendar(req.user, req.query.month?.toString()))));

attendanceRouter.get('/records', asyncHandler(async (req, res) => ok(res, await service.listRecords(req.user, {
  month: req.query.month?.toString(),
  from: req.query.from?.toString(),
  to: req.query.to?.toString(),
  employee_id: req.query.employee_id?.toString(),
}))));
attendanceRouter.post('/records', validate(recordSchema), asyncHandler(async (req, res) => created(res, await service.createRecord(req.user, req.body, req))));
attendanceRouter.patch('/records/:id', validate(recordSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateRecord(req.user, req.params.id, req.body, req))));

attendanceRouter.get('/leaves', asyncHandler(async (req, res) => ok(res, await service.listLeaves(req.user, {
  employee_id: req.query.employee_id?.toString(),
  status: req.query.status?.toString(),
  leave_type: req.query.leave_type?.toString(),
}))));
attendanceRouter.post('/leaves', validate(leaveSchema), asyncHandler(async (req, res) => created(res, await service.createLeave(req.user, req.body, req), 'Leave request submitted')));
attendanceRouter.patch('/leaves/:id/decision', validate(decisionSchema), asyncHandler(async (req, res) => ok(res, await service.decideLeave(req.user, req.params.id, req.body.decision, req.body.note, req), `Leave ${req.body.decision.toLowerCase()}`)));
attendanceRouter.patch('/leaves/:id/cancel', asyncHandler(async (req, res) => { await service.cancelLeave(req.user, req.params.id, req); return noContent(res, 'Leave request cancelled'); }));
attendanceRouter.get('/team-leaves', asyncHandler(async (req, res) => ok(res, await service.teamLeaveRequests(req.user))));

attendanceRouter.get('/shifts', asyncHandler(async (req, res) => ok(res, await service.listShifts(req.user, {
  employee_id: req.query.employee_id?.toString(),
}))));
attendanceRouter.post('/shifts', validate(shiftSchema), asyncHandler(async (req, res) => created(res, await service.createShift(req.user, req.body, req))));
attendanceRouter.delete('/shifts/:id', asyncHandler(async (req, res) => { await service.deleteShift(req.user, req.params.id, req); return noContent(res, 'Shift deleted'); }));

attendanceRouter.get('/holidays', asyncHandler(async (_req, res) => ok(res, await service.listHolidays())));
attendanceRouter.post('/holidays', validate(holidaySchema), asyncHandler(async (req, res) => created(res, await service.createHoliday(req.user, req.body, req))));
attendanceRouter.delete('/holidays/:id', asyncHandler(async (req, res) => { await service.deleteHoliday(req.user, req.params.id, req); return noContent(res, 'Holiday deleted'); }));
