import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

const enrichCases = async (rows) => {
  const employeeIds = [...new Set(rows.map((row) => row.employee_id).filter(Boolean))];
  const employees = employeeIds.length ? await db.select('employees', { where: { id: { in: employeeIds } }, limit: employeeIds.length }) : [];
  const map = new Map(employees.map((employee) => [employee.id, employee]));
  const caseIds = rows.map((row) => row.id);
  const clearances = caseIds.length ? await db.select('offboarding_clearances', { where: { case_id: { in: caseIds } }, limit: 5000 }) : [];
  return rows.map((row) => {
    const employee = map.get(row.employee_id);
    const caseClearances = clearances.filter((clearance) => clearance.case_id === row.id);
    return {
      ...row,
      employee_name: employee?.full_name ?? 'Unknown employee',
      employee_code: employee?.employee_code ?? '',
      department: employee?.department ?? '',
      designation: employee?.designation ?? '',
      clearance_total: caseClearances.length,
      clearance_approved: caseClearances.filter((clearance) => clearance.status === 'Approved').length,
    };
  });
};

const visibleWhere = async (user) => {
  if (isHRAdmin(user)) return {};
  const scope = await getAccessScope(user);
  return { employee_id: { in: scope.ids } };
};

export const overview = async (user) => {
  const where = await visibleWhere(user);
  const cases = await db.select('offboarding_cases', { where, limit: 5000 });
  const caseIds = cases.map((row) => row.id);
  const clearances = caseIds.length
    ? await db.select('offboarding_clearances', { where: { case_id: { in: caseIds }, status: 'Pending' }, limit: 5000 })
    : [];
  return {
    total: cases.length,
    in_progress: cases.filter((row) => !['Completed', 'Withdrawn'].includes(row.status)).length,
    completed: cases.filter((row) => row.status === 'Completed').length,
    alumni: cases.filter((row) => row.status === 'Completed').length,
    pending_clearances: clearances.length,
  };
};

export const listCases = async (user, query) => {
  const where = await visibleWhere(user);
  if (query.status) where.status = query.status;
  if (query.employee_id) where.employee_id = query.employee_id;
  const rows = await db.select('offboarding_cases', { where, order: { column: 'created_at', ascending: false }, limit: 2000 });
  return enrichCases(rows);
};

const assertCaseAccess = async (user, item) => {
  if (isHRAdmin(user)) return;
  if (item.employee_id === user.id) return;
  if (isManager(user)) {
    const reports = await getDirectReports(user.id);
    if (reports.some((report) => report.id === item.employee_id)) return;
  }
  throw forbidden('You do not have access to this offboarding case');
};

export const getCase = async (user, id) => {
  const item = await db.findById('offboarding_cases', id);
  if (!item) throw notFound('Offboarding case not found');
  await assertCaseAccess(user, item);
  const [clearances, documents] = await Promise.all([
    db.select('offboarding_clearances', { where: { case_id: id }, order: { column: 'department', ascending: true }, limit: 100 }),
    db.select('exit_documents', { where: { case_id: id }, order: { column: 'issued_at', ascending: false }, limit: 100 }),
  ]);
  const approverIds = [...new Set(clearances.map((clearance) => clearance.approved_by).filter(Boolean))];
  const approvers = approverIds.length ? await db.select('employees', { where: { id: { in: approverIds } }, limit: approverIds.length }) : [];
  const approverMap = new Map(approvers.map((approver) => [approver.id, approver.full_name]));
  const [enriched] = await enrichCases([item]);
  return {
    ...enriched,
    clearances: clearances.map((clearance) => ({ ...clearance, approved_by_name: clearance.approved_by ? approverMap.get(clearance.approved_by) ?? null : null })),
    documents: documents.map(({ content, ...document }) => document),
  };
};

export const createCase = async (user, payload, req) => {
  const employeeId = payload.employee_id ?? user.id;
  if (employeeId !== user.id && !isHRAdmin(user)) throw forbidden('You can only submit your own resignation');
  const employee = await db.findById('employees', employeeId);
  if (!employee) throw badRequest('Employee not found');
  if (employee.employment_status === 'Exited') throw conflict('This employee has already exited');
  if (payload.last_working_date < payload.resignation_date) throw badRequest('Last working date must be on or after the resignation date');
  const existing = await db.select('offboarding_cases', {
    where: { employee_id: employeeId, status: { ne: 'Withdrawn' } },
    limit: 1,
  });
  if (existing.length) throw conflict('An active offboarding case already exists for this employee');

  const item = await db.insert('offboarding_cases', {
    employee_id: employeeId,
    resignation_date: payload.resignation_date,
    last_working_date: payload.last_working_date,
    reason: payload.reason ?? '',
    status: 'Resignation Submitted',
    knowledge_transfer_status: 'Pending',
    exit_interview_date: null,
    exit_interview_notes: null,
    final_settlement_amount: null,
    settlement_status: 'Pending',
    alumni_notes: null,
    created_by: user.id,
  });

  const clearances = [
    { department: 'IT', status: 'Pending' },
    { department: 'Finance', status: 'Pending' },
  ];
  if (employee.reports_to) clearances.push({ department: 'Manager', status: 'Pending' });
  await db.insertMany('offboarding_clearances', clearances.map((clearance) => ({ ...clearance, case_id: item.id })));

  await recordAudit({ actorId: user.id, action: 'OFFBOARDING_CASE_CREATED', entityType: 'offboarding_case', entityId: item.id, details: { employee_id: employeeId }, req });
  const [enriched] = await enrichCases([item]);
  return enriched;
};

export const updateCase = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can update offboarding case details');
  const item = await db.findById('offboarding_cases', id);
  if (!item) throw notFound('Offboarding case not found');
  if (item.status === 'Completed') throw conflict('Completed offboarding cases cannot be modified');
  const allowed = ['last_working_date', 'reason', 'alumni_notes'];
  const patch = {};
  for (const key of allowed) if (payload[key] !== undefined) patch[key] = payload[key];
  const [updated] = await db.update('offboarding_cases', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'OFFBOARDING_CASE_UPDATED', entityType: 'offboarding_case', entityId: id, details: patch, req });
  return enrichCases([updated]).then(([row]) => row);
};

export const updateKnowledgeTransfer = async (user, id, status, req) => {
  const item = await db.findById('offboarding_cases', id);
  if (!item) throw notFound('Offboarding case not found');
  await assertCaseAccess(user, item);
  if (!isHRAdmin(user) && item.employee_id !== user.id) throw forbidden('Only the employee or HR can update knowledge transfer');
  if (item.status === 'Completed') throw conflict('This offboarding case is already completed');
  const [updated] = await db.update('offboarding_cases', { id }, {
    knowledge_transfer_status: status,
    status: status === 'Completed' && item.status === 'Resignation Submitted' ? 'Exit Interview' : item.status,
  });
  await recordAudit({ actorId: user.id, action: 'OFFBOARDING_KNOWLEDGE_TRANSFER', entityType: 'offboarding_case', entityId: id, details: { status }, req });
  return enrichCases([updated]).then(([row]) => row);
};

export const recordExitInterview = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can record exit interviews');
  const item = await db.findById('offboarding_cases', id);
  if (!item) throw notFound('Offboarding case not found');
  if (item.status === 'Completed') throw conflict('This offboarding case is already completed');
  const [updated] = await db.update('offboarding_cases', { id }, {
    exit_interview_date: payload.exit_interview_date ?? today(),
    exit_interview_notes: payload.notes ?? '',
    status: item.status === 'Resignation Submitted' ? 'Exit Interview' : item.status,
  });
  await recordAudit({ actorId: user.id, action: 'EXIT_INTERVIEW_RECORDED', entityType: 'offboarding_case', entityId: id, req });
  return enrichCases([updated]).then(([row]) => row);
};

export const decideClearance = async (user, caseId, clearanceId, status, notes, req) => {
  const item = await db.findById('offboarding_cases', caseId);
  if (!item) throw notFound('Offboarding case not found');
  const clearance = await db.findById('offboarding_clearances', clearanceId);
  if (!clearance || clearance.case_id !== caseId) throw notFound('Clearance not found');
  if (clearance.status !== 'Pending') throw conflict('This clearance has already been decided');
  if (item.status === 'Completed') throw conflict('This offboarding case is already completed');

  if (clearance.department === 'Manager') {
    if (!isHRAdmin(user)) {
      const employee = await db.findById('employees', item.employee_id);
      if (!isManager(user) || employee?.reports_to !== user.id) {
        throw forbidden('Only the reporting manager can approve this clearance');
      }
      if (item.employee_id === user.id) throw forbidden('You cannot approve your own clearance');
    }
  } else if (!isHRAdmin(user)) {
    throw forbidden(`Only Admin or HR can decide ${clearance.department} clearance`);
  }

  await db.update('offboarding_clearances', { id: clearanceId }, {
    status,
    notes: notes ?? null,
    approved_by: user.id,
    approved_at: now(),
  });

  const all = await db.select('offboarding_clearances', { where: { case_id: caseId }, limit: 100 });
  const allApproved = all.every((row) => row.status === 'Approved');
  const nextStatus = allApproved ? 'Settlement' : item.status === 'Exit Interview' ? 'Clearance' : item.status;
  const [updated] = await db.update('offboarding_cases', { id: caseId }, { status: nextStatus });
  await recordAudit({ actorId: user.id, action: 'OFFBOARDING_CLEARANCE_DECIDED', entityType: 'offboarding_clearance', entityId: clearanceId, details: { department: clearance.department, status, notes }, req });
  return enrichCases([updated]).then(([row]) => row);
};

export const recordSettlement = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can record final settlements');
  const item = await db.findById('offboarding_cases', id);
  if (!item) throw notFound('Offboarding case not found');
  if (item.status === 'Completed') throw conflict('This offboarding case is already completed');
  const clearances = await db.select('offboarding_clearances', { where: { case_id: id }, limit: 100 });
  if (!clearances.length || clearances.some((clearance) => clearance.status !== 'Approved')) {
    throw forbidden('All IT, Finance and manager clearances must be approved before settlement');
  }
  const [updated] = await db.update('offboarding_cases', { id }, {
    final_settlement_amount: Number(payload.amount),
    settlement_status: payload.status ?? 'Processed',
    status: 'Documents',
  });
  await recordAudit({ actorId: user.id, action: 'FINAL_SETTLEMENT_RECORDED', entityType: 'offboarding_case', entityId: id, details: { amount: payload.amount }, req });
  return enrichCases([updated]).then(([row]) => row);
};

const exitDocumentHtml = (employee, type, item) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${type}</title>
<style>body{font-family:Georgia,serif;color:#0f172a;padding:48px;line-height:1.7}h1{font-size:22px}</style></head>
<body><h1>HRMS Enterprise</h1><h2>${type}</h2>
<p>Date: ${today()}</p>
<p>This is to certify that <strong>${employee.full_name}</strong> (${employee.employee_code}) was employed with HRMS Enterprise as <strong>${employee.designation}</strong> in the <strong>${employee.department}</strong> department from ${employee.date_of_joining} to ${item.last_working_date}.</p>
<p>All company clearances and final settlement formalities have been recorded. We wish them success in future endeavours.</p>
<p>Authorised by the Human Resources department.</p>
</body></html>`;

export const issueDocument = async (user, id, documentType, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can issue exit documents');
  const item = await db.findById('offboarding_cases', id);
  if (!item) throw notFound('Offboarding case not found');
  if (item.status === 'Completed') throw conflict('This offboarding case is already completed');
  if (!item.final_settlement_amount) throw forbidden('Record the final settlement before issuing exit documents');
  const employee = await db.findById('employees', item.employee_id);
  if (!employee) throw badRequest('Employee not found');
  const content = exitDocumentHtml(employee, documentType, item);
  const fileName = `${documentType.toLowerCase().replaceAll(' ', '-')}-${employee.employee_code}.html`;
  const document = await db.insert('exit_documents', {
    case_id: id,
    employee_id: item.employee_id,
    document_type: documentType,
    file_name: fileName,
    content,
    issued_by: user.id,
    issued_at: now(),
  });
  await db.insert('employee_documents', {
    employee_id: item.employee_id,
    document_type: documentType,
    file_name: fileName,
    source_module: 'Offboarding',
    content,
    issued_by: user.id,
    issued_at: now(),
    case_id: id,
  });
  await db.update('offboarding_cases', { id }, { status: 'Documents' });
  await recordAudit({ actorId: user.id, action: 'EXIT_DOCUMENT_ISSUED', entityType: 'exit_document', entityId: document.id, details: { document_type: documentType }, req });
  return document;
};

export const completeCase = async (user, id, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can complete offboarding');
  const item = await db.findById('offboarding_cases', id);
  if (!item) throw notFound('Offboarding case not found');
  if (item.status === 'Completed') throw conflict('This offboarding case is already completed');
  const [clearances, documents] = await Promise.all([
    db.select('offboarding_clearances', { where: { case_id: id }, limit: 100 }),
    db.select('exit_documents', { where: { case_id: id }, limit: 100 }),
  ]);
  if (!item.final_settlement_amount) throw forbidden('Final settlement must be recorded before completion');
  if (!clearances.length || clearances.some((clearance) => clearance.status !== 'Approved')) {
    throw forbidden('All clearances must be approved before completion');
  }
  if (!documents.length) throw forbidden('At least one exit document must be issued before completion');

  const [updated] = await db.update('offboarding_cases', { id }, { status: 'Completed', completed_at: now() });
  // Preserve the employee record; only deactivate and mark exited.
  await db.update('employees', { id: item.employee_id }, {
    employment_status: 'Exited',
    is_active: false,
    exit_date: item.last_working_date,
  });
  await recordAudit({ actorId: user.id, action: 'OFFBOARDING_COMPLETED', entityType: 'offboarding_case', entityId: id, details: { employee_id: item.employee_id, last_working_date: item.last_working_date }, req });
  return enrichCases([updated]).then(([row]) => row);
};

export const withdrawCase = async (user, id, req) => {
  const item = await db.findById('offboarding_cases', id);
  if (!item) throw notFound('Offboarding case not found');
  if (item.employee_id !== user.id && !isHRAdmin(user)) throw forbidden('You cannot withdraw this offboarding case');
  if (['Completed', 'Withdrawn'].includes(item.status)) throw conflict('This offboarding case cannot be withdrawn');
  const [updated] = await db.update('offboarding_cases', { id }, { status: 'Withdrawn', withdrawn_at: now() });
  await recordAudit({ actorId: user.id, action: 'OFFBOARDING_WITHDRAWN', entityType: 'offboarding_case', entityId: id, req });
  return enrichCases([updated]).then(([row]) => row);
};

export const downloadDocument = async (user, id, req) => {
  const document = await db.findById('exit_documents', id);
  if (!document) throw notFound('Exit document not found');
  await assertCaseAccess(user, { employee_id: document.employee_id });
  await recordAudit({ actorId: user.id, action: 'EXIT_DOCUMENT_DOWNLOADED', entityType: 'exit_document', entityId: id, req });
  return { filename: document.file_name, html: document.content };
};

export const alumni = async (user) => {
  if (!isHRAdmin(user)) throw forbidden('Alumni records are restricted to Admin and HR');
  const cases = await db.select('offboarding_cases', { where: { status: 'Completed' }, order: { column: 'completed_at', ascending: false }, limit: 1000 });
  return enrichCases(cases);
};
