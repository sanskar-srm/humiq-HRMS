import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

const periodRange = (period) => {
  if (!/^\d{4}-\d{2}$/.test(period)) throw badRequest('Period must use YYYY-MM format');
  const [year, month] = period.split('-').map(Number);
  return {
    start: `${period}-01`,
    end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
};

const enrichPayslips = async (rows) => {
  const ids = [...new Set(rows.map((row) => row.employee_id))];
  const employees = ids.length ? await db.select('employees', { where: { id: { in: ids } }, limit: ids.length }) : [];
  const map = new Map(employees.map((employee) => [employee.id, employee]));
  return rows.map((row) => ({
    ...row,
    employee_name: map.get(row.employee_id)?.full_name ?? 'Unknown employee',
    employee_code: map.get(row.employee_id)?.employee_code ?? '',
    department: map.get(row.employee_id)?.department ?? '',
    designation: map.get(row.employee_id)?.designation ?? '',
  }));
};

export const listRuns = async (user) => {
  if (!isHRAdmin(user)) throw forbidden('Payroll runs are restricted to Admin and HR');
  const runs = await db.select('payroll_runs', { order: { column: 'created_at', ascending: false }, limit: 500 });
  const actorIds = [...new Set(runs.map((run) => run.processed_by).filter(Boolean))];
  const actors = actorIds.length ? await db.select('employees', { where: { id: { in: actorIds } }, limit: actorIds.length }) : [];
  const map = new Map(actors.map((actor) => [actor.id, actor.full_name]));
  return runs.map((run) => ({ ...run, processed_by_name: run.processed_by ? map.get(run.processed_by) ?? null : null }));
};

export const createRun = async (user, period, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can create payroll runs');
  periodRange(period);
  const existing = await db.select('payroll_runs', { where: { period, status: { in: ['Draft', 'Processing', 'Processed', 'Disbursed'] } }, limit: 1 });
  if (existing.length) throw conflict(`A payroll run already exists for ${period}`);
  const run = await db.insert('payroll_runs', {
    period,
    status: 'Draft',
    total_gross: 0,
    total_deductions: 0,
    total_net: 0,
    employee_count: 0,
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'PAYROLL_RUN_CREATED', entityType: 'payroll_run', entityId: run.id, details: { period }, req });
  return run;
};

export const getRun = async (user, id) => {
  if (!isHRAdmin(user)) throw forbidden('Payroll runs are restricted to Admin and HR');
  const run = await db.findById('payroll_runs', id);
  if (!run) throw notFound('Payroll run not found');
  const payslips = await db.select('payslips', { where: { run_id: id }, limit: 5000 });
  return { ...run, payslips: await enrichPayslips(payslips) };
};

export const processRun = async (user, id, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can process payroll');
  const run = await db.findById('payroll_runs', id);
  if (!run) throw notFound('Payroll run not found');
  if (run.status !== 'Draft') throw conflict('Only draft payroll runs can be processed');

  const { start, end } = periodRange(run.period);
  const employees = await db.select('employees', { where: { is_active: true, employment_status: 'Active' }, limit: 5000 });
  const structures = await db.select('employee_compensation', { limit: 5000 });
  const structureMap = new Map(structures.map((structure) => [structure.employee_id, structure]));
  const approvedReimbursements = await db.select('reimbursements', {
    where: { status: 'Approved', payroll_run_id: null },
    limit: 5000,
  });
  const reimbursementsByEmployee = approvedReimbursements.reduce((acc, reimbursement) => {
    acc[reimbursement.employee_id] = (acc[reimbursement.employee_id] ?? 0) + Number(reimbursement.amount ?? 0);
    return acc;
  }, {});
  const unpaidLeaves = await db.select('leave_requests', {
    where: { status: 'Approved', leave_type: 'Unpaid', start_date: { lte: end }, end_date: { gte: start } },
    limit: 5000,
  });
  const unpaidByEmployee = unpaidLeaves.reduce((acc, leave) => {
    acc[leave.employee_id] = (acc[leave.employee_id] ?? 0) + Number(leave.days ?? 0);
    return acc;
  }, {});

  const prepared = [];
  const skipped = [];
  for (const employee of employees) {
    const structure = structureMap.get(employee.id);
    if (!structure) {
      skipped.push({ employee_id: employee.id, employee_code: employee.employee_code, reason: 'No compensation structure' });
      continue;
    }
    const basic = Number(structure.base_salary ?? 0);
    const allowances = Number(structure.allowances ?? 0);
    const fixedDeductions = Number(structure.deductions ?? 0);
    const taxPercent = Number(structure.tax_percent ?? 0);
    const reimbursements = Number(reimbursementsByEmployee[employee.id] ?? 0);
    const unpaidDays = Number(unpaidByEmployee[employee.id] ?? 0);
    const perDay = basic / 30;
    const attendanceDeduction = Math.round(perDay * unpaidDays * 100) / 100;
    const gross = Math.round((basic + allowances + reimbursements) * 100) / 100;
    const tax = Math.round(gross * (taxPercent / 100) * 100) / 100;
    const deductions = Math.round((fixedDeductions + attendanceDeduction) * 100) / 100;
    const net = Math.round((gross - tax - deductions) * 100) / 100;
    if (net < 0) {
      skipped.push({ employee_id: employee.id, employee_code: employee.employee_code, reason: 'Net pay would be negative' });
      continue;
    }
    prepared.push({
      run_id: run.id,
      employee_id: employee.id,
      period: run.period,
      basic,
      allowances,
      reimbursements,
      gross_pay: gross,
      deductions,
      attendance_deduction: attendanceDeduction,
      unpaid_leave_days: unpaidDays,
      tax,
      net_pay: net,
      currency: structure.currency ?? 'INR',
      status: 'Processed',
    });
  }

  if (!prepared.length) throw badRequest('No employees have a compensation structure. Configure salary structures before processing payroll.');

  const totals = prepared.reduce(
    (acc, payslip) => ({
      gross: acc.gross + payslip.gross_pay,
      deductions: acc.deductions + payslip.deductions + payslip.tax,
      net: acc.net + payslip.net_pay,
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

  // Compensating workflow: if any write fails, payslips and reimbursement links
  // created for this run are removed and the run returns to Draft.
  const createdIds = [];
  const linkedReimbursements = [];
  try {
    for (const payslip of prepared) {
      const inserted = await db.insert('payslips', payslip);
      createdIds.push(inserted.id);
    }
    for (const reimbursement of approvedReimbursements) {
      if (prepared.some((payslip) => payslip.employee_id === reimbursement.employee_id)) {
        await db.update('reimbursements', { id: reimbursement.id }, { payroll_run_id: run.id, paid_at: new Date().toISOString() });
        linkedReimbursements.push(reimbursement.id);
      }
    }
    const [updated] = await db.update('payroll_runs', { id }, {
      status: 'Processed',
      processed_by: user.id,
      processed_at: new Date().toISOString(),
      total_gross: Math.round(totals.gross * 100) / 100,
      total_deductions: Math.round(totals.deductions * 100) / 100,
      total_net: Math.round(totals.net * 100) / 100,
      employee_count: prepared.length,
      skipped,
    });
    await recordAudit({
      actorId: user.id,
      action: 'PAYROLL_PROCESSED',
      entityType: 'payroll_run',
      entityId: id,
      details: { period: run.period, employee_count: prepared.length, total_net: updated.total_net, skipped: skipped.length },
      req,
    });
    return { run: updated, processed: prepared.length, skipped };
  } catch (error) {
    for (const payslipId of createdIds) await db.remove('payslips', { id: payslipId });
    for (const reimbursementId of linkedReimbursements) {
      await db.update('reimbursements', { id: reimbursementId }, { payroll_run_id: null, paid_at: null });
    }
    await db.update('payroll_runs', { id }, { status: 'Draft' });
    throw error;
  }
};

export const disburseRun = async (user, id, req) => {
  if (!isHRAdmin(user)) throw forbidden('Salary disbursement is restricted to Admin and HR');
  const run = await db.findById('payroll_runs', id);
  if (!run) throw notFound('Payroll run not found');
  if (run.status !== 'Processed') throw conflict('Only processed payroll runs can be disbursed');
  const [updated] = await db.update('payroll_runs', { id }, {
    status: 'Disbursed',
    disbursed_by: user.id,
    disbursed_at: new Date().toISOString(),
  });
  await db.update('payslips', { run_id: id }, { status: 'Paid' });
  await recordAudit({ actorId: user.id, action: 'PAYROLL_DISBURSED', entityType: 'payroll_run', entityId: id, details: { period: run.period, total_net: run.total_net }, req });
  return updated;
};

export const listPayslips = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s payslips');
    where.employee_id = query.employee_id;
  } else if (!scope.all) {
    where.employee_id = { in: scope.ids };
  }
  if (query.period) where.period = query.period;
  if (query.run_id) where.run_id = query.run_id;
  const rows = await db.select('payslips', { where, order: { column: 'created_at', ascending: false }, limit: 2000 });
  return enrichPayslips(rows);
};

export const getPayslip = async (user, id) => {
  const payslip = await db.findById('payslips', id);
  if (!payslip) throw notFound('Payslip not found');
  const scope = await getAccessScope(user);
  if (!scope.all && !scope.ids.includes(payslip.employee_id)) throw forbidden('You cannot access this payslip');
  const [enriched] = await enrichPayslips([payslip]);
  return enriched;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export const payslipDocument = async (user, id, req) => {
  const payslip = await getPayslip(user, id);
  const company = 'HRMS Enterprise';
  const rows = [
    ['Basic salary', payslip.basic],
    ['Allowances', payslip.allowances],
    ['Reimbursements', payslip.reimbursements],
    ['Gross pay', payslip.gross_pay],
    ['Fixed deductions', payslip.deductions],
    ['Unpaid leave deduction', payslip.attendance_deduction],
    ['Tax', payslip.tax],
    ['Net pay', payslip.net_pay],
  ];
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Payslip ${escapeHtml(payslip.period)} - ${escapeHtml(payslip.employee_code)}</title>
<style>body{font-family:Arial,sans-serif;color:#0f172a;padding:32px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border:1px solid #cbd5e1;padding:10px;text-align:left}th{background:#f1f5f9}h1{font-size:20px}p{margin:4px 0}</style></head>
<body><h1>${company} — Payslip</h1>
<p><strong>Employee:</strong> ${escapeHtml(payslip.employee_name)} (${escapeHtml(payslip.employee_code)})</p>
<p><strong>Department:</strong> ${escapeHtml(payslip.department)} · <strong>Designation:</strong> ${escapeHtml(payslip.designation)}</p>
<p><strong>Pay period:</strong> ${escapeHtml(payslip.period)} · <strong>Status:</strong> ${escapeHtml(payslip.status)}</p>
<table><thead><tr><th>Component</th><th>Amount (${escapeHtml(payslip.currency)})</th></tr></thead><tbody>
${rows.map(([label, value]) => `<tr><td>${label}</td><td>${Number(value ?? 0).toFixed(2)}</td></tr>`).join('')}
</tbody></table>
<p style="margin-top:24px;font-size:12px;color:#64748b">Generated by HRMS. This document contains confidential payroll information.</p>
</body></html>`;
  await recordAudit({ actorId: user.id, action: 'PAYSLIP_DOWNLOADED', entityType: 'payslip', entityId: id, details: { employee_id: payslip.employee_id, period: payslip.period }, req });
  return { filename: `payslip-${payslip.employee_code}-${payslip.period}.html`, html };
};

export const listTaxRecords = async (user, query) => {
  const scope = await getAccessScope(user);
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s tax records');
  }
  const where = query.employee_id ? { employee_id: query.employee_id } : scope.all ? {} : { employee_id: { in: scope.ids } };
  if (query.period) where.period = query.period;
  const rows = await db.select('tax_records', { where, order: { column: 'period', ascending: false }, limit: 1000 });
  return enrichPayslips(rows);
};

export const createTaxRecord = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Tax administration is restricted to Admin and HR');
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  const record = await db.insert('tax_records', { ...payload, created_by: user.id });
  await recordAudit({ actorId: user.id, action: 'TAX_RECORD_CREATED', entityType: 'tax_record', entityId: record.id, details: payload, req });
  return record;
};

export const updateTaxRecord = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Tax administration is restricted to Admin and HR');
  const record = await db.findById('tax_records', id);
  if (!record) throw notFound('Tax record not found');
  const [updated] = await db.update('tax_records', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'TAX_RECORD_UPDATED', entityType: 'tax_record', entityId: id, details: payload, req });
  return updated;
};

export const payrollAudit = async (user) => {
  if (!isHRAdmin(user)) throw forbidden('Payroll audit is restricted to Admin and HR');
  return db.select('audit_logs', {
    where: { entity_type: { in: ['payroll_run', 'payslip', 'tax_record', 'reimbursement'] } },
    order: { column: 'created_at', ascending: false },
    limit: 500,
  });
};

export const payrollSummary = async (user) => {
  if (isHRAdmin(user)) {
    const runs = await db.select('payroll_runs', { order: { column: 'created_at', ascending: false }, limit: 1 });
    const latest = runs[0];
    const [payslipCount, totalNet] = await Promise.all([
      db.count('payslips'),
      db.select('payslips', { limit: 10000 }),
    ]);
    return {
      scope: 'organization',
      latest_run: latest ?? null,
      payslips: payslipCount,
      total_net_paid: totalNet.reduce((sum, payslip) => sum + Number(payslip.net_pay ?? 0), 0),
    };
  }
  if (isManager(user)) {
    const team = await getDirectReports(user.id);
    const ids = team.map((member) => member.id);
    const payslips = ids.length ? await db.select('payslips', { where: { employee_id: { in: ids } }, limit: 5000 }) : [];
    return {
      scope: 'team',
      team_size: team.length,
      payslips: payslips.length,
      total_net: payslips.reduce((sum, payslip) => sum + Number(payslip.net_pay ?? 0), 0),
    };
  }
  const payslips = await db.select('payslips', { where: { employee_id: user.id }, order: { column: 'created_at', ascending: false }, limit: 50 });
  return {
    scope: 'self',
    payslips: payslips.length,
    latest_net: payslips[0]?.net_pay ?? null,
    ytd_net: payslips.reduce((sum, payslip) => sum + Number(payslip.net_pay ?? 0), 0),
  };
};
