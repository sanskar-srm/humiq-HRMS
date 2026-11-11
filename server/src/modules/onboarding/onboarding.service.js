import { db } from '../../db/index.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

const caseScopeWhere = async (user) => {
  if (isHRAdmin(user)) return {};
  if (isManager(user)) {
    const reports = await getDirectReports(user.id);
    return {
      $or: true,
      manager_id: user.id,
      employee_id: { in: [user.id, ...reports.map((report) => report.id)] },
    };
  }
  return { employee_id: user.id };
};

// The adapter only supports flat equality filters, so manager visibility is
// applied in JS after fetching scoped rows.
const visibleCases = async (user, where = {}) => {
  const cases = await db.select('onboarding_cases', { where, order: { column: 'created_at', ascending: false }, limit: 2000 });
  if (isHRAdmin(user)) return cases;
  if (isManager(user)) {
    const reports = await getDirectReports(user.id);
    const ids = new Set([user.id, ...reports.map((report) => report.id)]);
    return cases.filter((item) => item.manager_id === user.id || ids.has(item.employee_id));
  }
  return cases.filter((item) => item.employee_id === user.id);
};

const enrichCase = async (item) => {
  const [manager, tasks, documents] = await Promise.all([
    item.manager_id ? db.findById('employees', item.manager_id) : null,
    db.select('onboarding_tasks', { where: { case_id: item.id }, limit: 500 }),
    db.select('onboarding_documents', { where: { case_id: item.id }, limit: 500 }),
  ]);
  const taskCompleted = tasks.filter((task) => task.status === 'Completed').length;
  const docCompleted = documents.filter((doc) => ['Acknowledged', 'Signed'].includes(doc.status)).length;
  const total = tasks.length + documents.length;
  const completed = taskCompleted + docCompleted;
  return {
    ...item,
    manager_name: manager?.full_name ?? null,
    task_total: tasks.length,
    task_completed: taskCompleted,
    document_total: documents.length,
    document_completed: docCompleted,
    progress: total ? Math.round((completed / total) * 100) : 0,
  };
};

const refreshCase = async (caseId) => {
  const item = await db.findById('onboarding_cases', caseId);
  if (!item) return null;
  const enriched = await enrichCase(item);
  const status = enriched.progress === 100 ? 'Completed' : item.status === 'Not Started' && enriched.progress > 0 ? 'In Progress' : item.status;
  const [updated] = await db.update('onboarding_cases', { id: caseId }, {
    progress: enriched.progress,
    status: status === 'Completed' ? 'Completed' : status,
    completed_at: enriched.progress === 100 ? new Date().toISOString() : null,
  });
  return updated;
};

export const overview = async (user) => {
  const cases = await visibleCases(user);
  const ids = cases.map((item) => item.id);
  const documents = ids.length
    ? await db.select('onboarding_documents', { where: { case_id: { in: ids } }, limit: 5000 })
    : [];
  const enriched = await Promise.all(cases.map(enrichCase));
  return {
    total_new_hires: cases.length,
    in_progress: cases.filter((item) => item.status === 'In Progress').length,
    completed: cases.filter((item) => item.status === 'Completed').length,
    pending_handbooks: documents.filter((doc) => doc.document_type === 'Handbook' && doc.status === 'Pending').length,
    pending_ndas: documents.filter((doc) => doc.document_type === 'NDA' && doc.status === 'Pending').length,
    completion_rate: enriched.length ? Math.round(enriched.reduce((sum, item) => sum + item.progress, 0) / enriched.length) : 0,
  };
};

export const listCases = async (user, query) => {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.department) where.department = query.department;
  if (query.employee_id) where.employee_id = query.employee_id;
  const cases = await visibleCases(user, where);
  return Promise.all(cases.map(enrichCase));
};

const assertCaseAccess = async (user, item) => {
  if (isHRAdmin(user)) return;
  if (isManager(user)) {
    const reports = await getDirectReports(user.id);
    if (item.manager_id === user.id || [user.id, ...reports.map((report) => report.id)].includes(item.employee_id)) return;
  }
  if (item.employee_id === user.id) return;
  throw forbidden('You do not have access to this onboarding case');
};

export const getCase = async (user, id) => {
  const item = await db.findById('onboarding_cases', id);
  if (!item) throw notFound('Onboarding case not found');
  await assertCaseAccess(user, item);
  const [tasks, documents] = await Promise.all([
    db.select('onboarding_tasks', { where: { case_id: id }, order: { column: 'due_date', ascending: true }, limit: 500 }),
    db.select('onboarding_documents', { where: { case_id: id }, limit: 500 }),
  ]);
  const enriched = await enrichCase(item);
  return { ...enriched, tasks, documents };
};

export const createCase = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can create onboarding cases');
  let employee = null;
  if (payload.employee_id) {
    employee = await db.findById('employees', payload.employee_id);
    if (!employee) throw badRequest('Employee not found');
  }
  const item = await db.insert('onboarding_cases', {
    employee_id: payload.employee_id ?? null,
    candidate_name: employee?.full_name ?? payload.candidate_name,
    email: employee?.email ?? payload.email ?? null,
    department: employee?.department ?? payload.department,
    designation: employee?.designation ?? payload.designation,
    joining_date: payload.joining_date,
    manager_id: payload.manager_id ?? employee?.reports_to ?? null,
    status: 'Not Started',
    progress: 0,
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'ONBOARDING_CASE_CREATED', entityType: 'onboarding_case', entityId: item.id, details: { candidate_name: item.candidate_name }, req });
  return enrichCase(item);
};

export const updateCase = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can update onboarding cases');
  const item = await db.findById('onboarding_cases', id);
  if (!item) throw notFound('Onboarding case not found');
  const [updated] = await db.update('onboarding_cases', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'ONBOARDING_CASE_UPDATED', entityType: 'onboarding_case', entityId: id, details: payload, req });
  return enrichCase(updated);
};

export const addTask = async (user, caseId, payload, req) => {
  const item = await db.findById('onboarding_cases', caseId);
  if (!item) throw notFound('Onboarding case not found');
  await assertCaseAccess(user, item);
  if (!isHRAdmin(user) && item.manager_id !== user.id) {
    throw forbidden('Only Admin, HR or the assigned manager can add onboarding tasks');
  }
  const task = await db.insert('onboarding_tasks', {
    case_id: caseId,
    employee_id: item.employee_id,
    title: payload.title,
    category: payload.category,
    assigned_to: payload.assigned_to ?? item.manager_id ?? null,
    due_date: payload.due_date ?? null,
    status: 'Pending',
  });
  await refreshCase(caseId);
  await recordAudit({ actorId: user.id, action: 'ONBOARDING_TASK_CREATED', entityType: 'onboarding_task', entityId: task.id, details: payload, req });
  return task;
};

export const updateTask = async (user, taskId, payload, req) => {
  const task = await db.findById('onboarding_tasks', taskId);
  if (!task) throw notFound('Onboarding task not found');
  const item = await db.findById('onboarding_cases', task.case_id);
  await assertCaseAccess(user, item);
  const canManage = isHRAdmin(user) || item.manager_id === user.id || task.assigned_to === user.id;
  const isOwnTask = task.employee_id === user.id;
  if (!canManage && !isOwnTask) throw forbidden('You cannot update this onboarding task');
  if (!isHRAdmin(user) && !canManage && Object.keys(payload).some((key) => key !== 'status')) {
    throw forbidden('You can only update the status of your own onboarding task');
  }
  const patch = { ...payload };
  if (patch.status === 'Completed') patch.completed_at = new Date().toISOString();
  const [updated] = await db.update('onboarding_tasks', { id: taskId }, patch);
  await refreshCase(task.case_id);
  await recordAudit({ actorId: user.id, action: 'ONBOARDING_TASK_UPDATED', entityType: 'onboarding_task', entityId: taskId, details: payload, req });
  return updated;
};

export const addDocument = async (user, caseId, payload, req) => {
  const item = await db.findById('onboarding_cases', caseId);
  if (!item) throw notFound('Onboarding case not found');
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can add onboarding documents');
  const document = await db.insert('onboarding_documents', {
    case_id: caseId,
    employee_id: item.employee_id,
    document_type: payload.document_type,
    file_name: payload.file_name ?? null,
    status: 'Pending',
  });
  await refreshCase(caseId);
  await recordAudit({ actorId: user.id, action: 'ONBOARDING_DOCUMENT_ADDED', entityType: 'onboarding_document', entityId: document.id, details: payload, req });
  return document;
};

export const updateDocument = async (user, documentId, payload, req) => {
  const document = await db.findById('onboarding_documents', documentId);
  if (!document) throw notFound('Onboarding document not found');
  const item = await db.findById('onboarding_cases', document.case_id);
  await assertCaseAccess(user, item);
  const isOwn = document.employee_id === user.id;
  if (!isHRAdmin(user) && !isOwn) throw forbidden('You cannot update this document');
  if (!isHRAdmin(user) && !['Acknowledged', 'Signed'].includes(payload.status)) {
    throw forbidden('You can only acknowledge or sign your own onboarding documents');
  }
  const patch = { ...payload };
  if (patch.status === 'Acknowledged') patch.acknowledged_at = new Date().toISOString();
  if (patch.status === 'Signed') {
    patch.signed_at = new Date().toISOString();
    patch.acknowledged_at = document.acknowledged_at ?? new Date().toISOString();
  }
  const [updated] = await db.update('onboarding_documents', { id: documentId }, patch);
  await refreshCase(document.case_id);
  await recordAudit({ actorId: user.id, action: 'ONBOARDING_DOCUMENT_UPDATED', entityType: 'onboarding_document', entityId: documentId, details: patch, req });
  return updated;
};
