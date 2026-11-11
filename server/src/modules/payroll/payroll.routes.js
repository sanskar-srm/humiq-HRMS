import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../utils/http.js';
import { ok, created } from '../../utils/response.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as service from './payroll.service.js';

const runSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must use YYYY-MM') });

const taxSchema = z.object({
  employee_id: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  taxable_income: z.coerce.number().min(0),
  tax_amount: z.coerce.number().min(0),
  status: z.enum(['Draft', 'Filed']).optional(),
  filed_at: z.string().optional().nullable(),
});

export const payrollRouter = Router();
payrollRouter.use(authenticate);

payrollRouter.get('/summary', asyncHandler(async (req, res) => ok(res, await service.payrollSummary(req.user))));

payrollRouter.get('/runs', asyncHandler(async (req, res) => ok(res, await service.listRuns(req.user))));
payrollRouter.post('/runs', validate(runSchema), asyncHandler(async (req, res) => created(res, await service.createRun(req.user, req.body.period, req), 'Payroll run created')));
payrollRouter.get('/runs/:id', asyncHandler(async (req, res) => ok(res, await service.getRun(req.user, req.params.id))));
payrollRouter.post('/runs/:id/process', asyncHandler(async (req, res) => ok(res, await service.processRun(req.user, req.params.id, req), 'Payroll processed successfully')));
payrollRouter.post('/runs/:id/disburse', asyncHandler(async (req, res) => ok(res, await service.disburseRun(req.user, req.params.id, req), 'Payroll disbursed successfully')));

payrollRouter.get('/payslips', asyncHandler(async (req, res) => ok(res, await service.listPayslips(req.user, {
  employee_id: req.query.employee_id?.toString(),
  period: req.query.period?.toString(),
  run_id: req.query.run_id?.toString(),
}))));
payrollRouter.get('/payslips/:id/document', asyncHandler(async (req, res) => {
  const document = await service.payslipDocument(req.user, req.params.id, req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${document.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(document.html);
}));
payrollRouter.get('/payslips/:id', asyncHandler(async (req, res) => ok(res, await service.getPayslip(req.user, req.params.id))));

payrollRouter.get('/tax-records', asyncHandler(async (req, res) => ok(res, await service.listTaxRecords(req.user, {
  employee_id: req.query.employee_id?.toString(),
  period: req.query.period?.toString(),
}))));
payrollRouter.post('/tax-records', validate(taxSchema), asyncHandler(async (req, res) => created(res, await service.createTaxRecord(req.user, req.body, req))));
payrollRouter.patch('/tax-records/:id', validate(taxSchema.partial()), asyncHandler(async (req, res) => ok(res, await service.updateTaxRecord(req.user, req.params.id, req.body, req))));

payrollRouter.get('/audit', asyncHandler(async (req, res) => ok(res, await service.payrollAudit(req.user))));
