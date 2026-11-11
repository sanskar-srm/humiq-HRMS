import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager, isStaffAgent } from '../../utils/roles.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

const agentScope = async (user) => {
  if (isHRAdmin(user)) return { all: true, ids: null };
  if (isManager(user)) {
    const reports = await getDirectReports(user.id);
    return { all: false, ids: [user.id, ...reports.map((report) => report.id)] };
  }
  return { all: false, ids: [user.id] };
};

const employeeMap = async (rows, field = 'employee_id') => {
  const ids = [...new Set(rows.map((row) => row[field]).filter(Boolean))];
  const employees = ids.length ? await db.select('employees', { where: { id: { in: ids } }, limit: ids.length }) : [];
  const map = new Map(employees.map((employee) => [employee.id, employee]));
  return rows.map((row) => ({
    ...row,
    employee_name: map.get(row[field])?.full_name ?? 'Unknown employee',
    employee_code: map.get(row[field])?.employee_code ?? '',
    department: map.get(row[field])?.department ?? '',
  }));
};

const enrichTickets = async (tickets) => {
  const categoryIds = [...new Set(tickets.map((ticket) => ticket.category_id).filter(Boolean))];
  const assigneeIds = [...new Set(tickets.map((ticket) => ticket.assigned_to).filter(Boolean))];
  const [categories, assignees] = await Promise.all([
    categoryIds.length ? db.select('ticket_categories', { where: { id: { in: categoryIds } }, limit: categoryIds.length }) : [],
    assigneeIds.length ? db.select('employees', { where: { id: { in: assigneeIds } }, limit: assigneeIds.length }) : [],
  ]);
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const assigneeMap = new Map(assignees.map((employee) => [employee.id, employee.full_name]));
  const enriched = await employeeMap(tickets);
  return enriched.map((ticket) => ({
    ...ticket,
    category_name: categoryMap.get(ticket.category_id) ?? 'Uncategorized',
    assignee_name: ticket.assigned_to ? assigneeMap.get(ticket.assigned_to) ?? null : null,
    sla_breached: ticket.sla_due_at ? new Date(ticket.sla_due_at) < new Date() && !['Resolved', 'Closed'].includes(ticket.status) : false,
  }));
};

export const overview = async (user) => {
  const scope = await agentScope(user);
  const where = scope.all ? {} : { employee_id: { in: scope.ids } };
  const tickets = await db.select('tickets', { where, limit: 5000 });
  const open = tickets.filter((ticket) => ['Open', 'In Progress', 'Pending', 'Escalated'].includes(ticket.status));
  const breached = open.filter((ticket) => ticket.sla_due_at && new Date(ticket.sla_due_at) < new Date());
  const csat = tickets.map((ticket) => ticket.csat_rating).filter((rating) => Number(rating) > 0);
  return {
    total: tickets.length,
    open: open.length,
    unassigned: open.filter((ticket) => !ticket.assigned_to).length,
    breached: breached.length,
    resolved: tickets.filter((ticket) => ['Resolved', 'Closed'].includes(ticket.status)).length,
    average_csat: csat.length ? Math.round((csat.reduce((sum, rating) => sum + Number(rating), 0) / csat.length) * 10) / 10 : 0,
    scope: isStaffAgent(user) ? (scope.all ? 'organization' : 'team') : 'self',
    is_agent: isStaffAgent(user),
  };
};

export const listTickets = async (user, query) => {
  const scope = await agentScope(user);
  const where = {};
  if (!scope.all) where.employee_id = { in: scope.ids };
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.assigned_to) where.assigned_to = query.assigned_to;
  if (query.category_id) where.category_id = query.category_id;
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s tickets');
    where.employee_id = query.employee_id;
  }
  const rows = await db.select('tickets', { where, order: { column: 'created_at', ascending: false }, limit: 2000 });
  return enrichTickets(rows);
};

const nextTicketNumber = async () => {
  const year = new Date().getUTCFullYear();
  const count = await db.count('tickets');
  return `TKT-${year}-${String(count + 1).padStart(4, '0')}`;
};

export const createTicket = async (user, payload, req) => {
  const employeeId = payload.employee_id ?? user.id;
  if (employeeId !== user.id && !isHRAdmin(user)) throw forbidden('You can only raise tickets for yourself');
  const [employee, category] = await Promise.all([
    db.findById('employees', employeeId),
    db.findById('ticket_categories', payload.category_id),
  ]);
  if (!employee) throw badRequest('Employee not found');
  if (!category || category.active === false) throw badRequest('Ticket category is not available');
  const ticket = await db.insert('tickets', {
    ticket_no: await nextTicketNumber(),
    employee_id: employeeId,
    category_id: category.id,
    subject: payload.subject,
    description: payload.description,
    priority: payload.priority ?? 'Medium',
    status: 'Open',
    assigned_to: category.default_assignee_id ?? null,
    sla_due_at: new Date(Date.now() + Number(category.sla_hours ?? 24) * 3600000).toISOString(),
    csat_rating: null,
    csat_comment: null,
  });
  await recordAudit({ actorId: user.id, action: 'TICKET_CREATED', entityType: 'ticket', entityId: ticket.id, details: { ticket_no: ticket.ticket_no, category: category.name }, req });
  const [enriched] = await enrichTickets([ticket]);
  return enriched;
};

const assertTicketAccess = async (user, ticket) => {
  if (isHRAdmin(user)) return;
  if (isManager(user)) {
    const reports = await getDirectReports(user.id);
    if ([user.id, ...reports.map((report) => report.id)].includes(ticket.employee_id)) return;
  }
  if (ticket.employee_id === user.id) return;
  throw forbidden('You do not have access to this ticket');
};

export const getTicket = async (user, id) => {
  const ticket = await db.findById('tickets', id);
  if (!ticket) throw notFound('Ticket not found');
  await assertTicketAccess(user, ticket);
  const comments = await db.select('ticket_comments', { where: { ticket_id: id }, order: { column: 'created_at', ascending: true }, limit: 1000 });
  const visibleComments = isStaffAgent(user) ? comments : comments.filter((comment) => !comment.is_internal);
  const authorIds = [...new Set(visibleComments.map((comment) => comment.author_id).filter(Boolean))];
  const authors = authorIds.length ? await db.select('employees', { where: { id: { in: authorIds } }, limit: authorIds.length }) : [];
  const authorMap = new Map(authors.map((author) => [author.id, author.full_name]));
  const [enriched] = await enrichTickets([ticket]);
  return {
    ...enriched,
    comments: visibleComments.map((comment) => ({ ...comment, author_name: authorMap.get(comment.author_id) ?? 'Unknown' })),
  };
};

export const updateTicket = async (user, id, payload, req) => {
  if (!isStaffAgent(user)) throw forbidden('Only support agents can manage tickets');
  const ticket = await db.findById('tickets', id);
  if (!ticket) throw notFound('Ticket not found');
  if (isManager(user) && !isHRAdmin(user)) {
    const reports = await getDirectReports(user.id);
    if (![user.id, ...reports.map((report) => report.id)].includes(ticket.employee_id)) {
      throw forbidden('You can only manage tickets for your team');
    }
  }
  if (payload.assigned_to) {
    const assignee = await db.findById('employees', payload.assigned_to);
    if (!assignee) throw badRequest('Assignee not found');
  }
  const patch = { ...payload };
  if (['Resolved', 'Closed'].includes(patch.status) && !ticket.resolved_at) patch.resolved_at = now();
  if (patch.status && ['Open', 'In Progress', 'Pending', 'Escalated'].includes(patch.status)) patch.resolved_at = null;
  const [updated] = await db.update('tickets', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'TICKET_UPDATED', entityType: 'ticket', entityId: id, details: patch, req });
  const [enriched] = await enrichTickets([updated]);
  return enriched;
};

export const closeOwnTicket = async (user, id, req) => {
  const ticket = await db.findById('tickets', id);
  if (!ticket) throw notFound('Ticket not found');
  if (ticket.employee_id !== user.id) throw forbidden('You can only close your own ticket');
  if (['Closed'].includes(ticket.status)) throw conflict('Ticket is already closed');
  const [updated] = await db.update('tickets', { id }, { status: 'Closed', resolved_at: ticket.resolved_at ?? now() });
  await recordAudit({ actorId: user.id, action: 'TICKET_CLOSED_BY_EMPLOYEE', entityType: 'ticket', entityId: id, req });
  const [enriched] = await enrichTickets([updated]);
  return enriched;
};

export const addComment = async (user, id, message, internal, req) => {
  const ticket = await db.findById('tickets', id);
  if (!ticket) throw notFound('Ticket not found');
  await assertTicketAccess(user, ticket);
  const isInternal = Boolean(internal) && isStaffAgent(user);
  const comment = await db.insert('ticket_comments', {
    ticket_id: id,
    author_id: user.id,
    message,
    is_internal: isInternal,
  });
  if (['Resolved', 'Closed'].includes(ticket.status) && ticket.employee_id === user.id) {
    await db.update('tickets', { id }, { status: 'Open', resolved_at: null });
  }
  await recordAudit({ actorId: user.id, action: 'TICKET_COMMENT_ADDED', entityType: 'ticket', entityId: id, details: { internal: isInternal }, req });
  return comment;
};

export const submitCsat = async (user, id, rating, comment, req) => {
  const ticket = await db.findById('tickets', id);
  if (!ticket) throw notFound('Ticket not found');
  if (ticket.employee_id !== user.id) throw forbidden('Only the ticket owner can submit CSAT feedback');
  if (!['Resolved', 'Closed'].includes(ticket.status)) throw badRequest('CSAT can only be submitted for resolved tickets');
  if (ticket.csat_rating) throw conflict('CSAT feedback has already been submitted for this ticket');
  const [updated] = await db.update('tickets', { id }, { csat_rating: rating, csat_comment: comment ?? null, csat_at: now() });
  await recordAudit({ actorId: user.id, action: 'TICKET_CSAT_SUBMITTED', entityType: 'ticket', entityId: id, details: { rating }, req });
  return updated;
};

export const listCategories = async () =>
  db.select('ticket_categories', { order: { column: 'name', ascending: true }, limit: 500 });

export const createCategory = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage ticket categories');
  const category = await db.insert('ticket_categories', { ...payload, active: payload.active ?? true });
  await recordAudit({ actorId: user.id, action: 'TICKET_CATEGORY_CREATED', entityType: 'ticket_category', entityId: category.id, details: payload, req });
  return category;
};

export const updateCategory = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage ticket categories');
  const category = await db.findById('ticket_categories', id);
  if (!category) throw notFound('Ticket category not found');
  const [updated] = await db.update('ticket_categories', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'TICKET_CATEGORY_UPDATED', entityType: 'ticket_category', entityId: id, details: payload, req });
  return updated;
};

const enrichArticles = async (articles) => {
  const categoryIds = [...new Set(articles.map((article) => article.category_id).filter(Boolean))];
  const authorIds = [...new Set(articles.map((article) => article.author_id).filter(Boolean))];
  const [categories, authors, votes] = await Promise.all([
    categoryIds.length ? db.select('ticket_categories', { where: { id: { in: categoryIds } }, limit: categoryIds.length }) : [],
    authorIds.length ? db.select('employees', { where: { id: { in: authorIds } }, limit: authorIds.length }) : [],
    articles.length ? db.select('kb_votes', { where: { article_id: { in: articles.map((article) => article.id) } }, limit: 10000 }) : [],
  ]);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const authorMap = new Map(authors.map((author) => [author.id, author.full_name]));
  return articles.map((article) => {
    const articleVotes = votes.filter((vote) => vote.article_id === article.id);
    return {
      ...article,
      category_name: categoryMap.get(article.category_id)?.name ?? 'Uncategorized',
      department: categoryMap.get(article.category_id)?.department ?? article.department ?? '',
      author_name: authorMap.get(article.author_id) ?? 'Unknown',
      helpful_votes: articleVotes.filter((vote) => vote.vote === 'Helpful').length,
      not_helpful_votes: articleVotes.filter((vote) => vote.vote === 'Not Helpful').length,
    };
  });
};

export const listArticles = async (user, query) => {
  const where = {};
  if (!isStaffAgent(user)) where.status = 'Published';
  else if (query.status) where.status = query.status;
  if (query.category_id) where.category_id = query.category_id;
  let rows = await db.select('kb_articles', { where, order: { column: 'created_at', ascending: false }, limit: 1000 });
  if (query.search) {
    const term = query.search.toLowerCase();
    rows = rows.filter((article) => `${article.title} ${article.content}`.toLowerCase().includes(term));
  }
  return enrichArticles(rows);
};

export const getArticle = async (user, id) => {
  const article = await db.findById('kb_articles', id);
  if (!article) throw notFound('Article not found');
  if (!isStaffAgent(user) && article.status !== 'Published') throw notFound('Article not found');
  const [enriched] = await enrichArticles([article]);
  return enriched;
};

export const createArticle = async (user, payload, req) => {
  if (!isStaffAgent(user)) throw forbidden('Only staff can write knowledge-base articles');
  const category = await db.findById('ticket_categories', payload.category_id);
  if (!category) throw badRequest('Article category not found');
  const article = await db.insert('kb_articles', {
    title: payload.title,
    content: payload.content,
    category_id: category.id,
    department: category.department,
    status: 'Draft',
    author_id: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'KB_ARTICLE_CREATED', entityType: 'kb_article', entityId: article.id, details: { title: article.title }, req });
  return article;
};

export const updateArticle = async (user, id, payload, req) => {
  const article = await db.findById('kb_articles', id);
  if (!article) throw notFound('Article not found');
  const isAuthor = article.author_id === user.id;
  const privileged = isHRAdmin(user);
  if (!isAuthor && !privileged) throw forbidden('You cannot edit this article');
  if (!privileged) {
    if (!['Draft', 'Awaiting Review'].includes(article.status)) throw forbidden('Only Draft or review articles can be edited');
    if (payload.status && payload.status !== 'Awaiting Review') throw forbidden('Only Admin or HR can publish or archive articles');
  }
  const patch = { ...payload };
  if (patch.status === 'Published') {
    patch.published_at = now();
    patch.archived_at = null;
  }
  if (patch.status === 'Archived') patch.archived_at = now();
  const [updated] = await db.update('kb_articles', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'KB_ARTICLE_UPDATED', entityType: 'kb_article', entityId: id, details: { status: patch.status ?? article.status }, req });
  return updated;
};

export const deleteArticle = async (user, id, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can delete articles');
  const article = await db.findById('kb_articles', id);
  if (!article) throw notFound('Article not found');
  await db.remove('kb_votes', { article_id: id });
  await db.remove('kb_articles', { id });
  await recordAudit({ actorId: user.id, action: 'KB_ARTICLE_DELETED', entityType: 'kb_article', entityId: id, req });
};

export const voteArticle = async (user, id, vote, req) => {
  const article = await db.findById('kb_articles', id);
  if (!article || article.status !== 'Published') throw notFound('Article not found');
  const [existing] = await db.select('kb_votes', { where: { article_id: id, employee_id: user.id }, limit: 1 });
  let row;
  if (existing) {
    [row] = await db.update('kb_votes', { id: existing.id }, { vote });
  } else {
    row = await db.insert('kb_votes', { article_id: id, employee_id: user.id, vote });
  }
  await recordAudit({ actorId: user.id, action: 'KB_ARTICLE_VOTED', entityType: 'kb_article', entityId: id, details: { vote }, req });
  return row;
};

export const analytics = async (user) => {
  if (!isStaffAgent(user)) throw forbidden('Support analytics are restricted to agents');
  const scope = await agentScope(user);
  const where = scope.all ? {} : { employee_id: { in: scope.ids } };
  const tickets = await db.select('tickets', { where, limit: 5000 });
  const open = tickets.filter((ticket) => !['Resolved', 'Closed'].includes(ticket.status));
  const categories = await listCategories();
  const byCategory = categories.map((category) => {
    const categoryTickets = tickets.filter((ticket) => ticket.category_id === category.id);
    return { category: category.name, total: categoryTickets.length, open: categoryTickets.filter((ticket) => !['Resolved', 'Closed'].includes(ticket.status)).length };
  });
  const assigneeIds = [...new Set(tickets.map((ticket) => ticket.assigned_to).filter(Boolean))];
  const agents = assigneeIds.length ? await db.select('employees', { where: { id: { in: assigneeIds } }, limit: assigneeIds.length }) : [];
  const agentMap = new Map(agents.map((agent) => [agent.id, agent.full_name]));
  const workload = Object.entries(tickets.filter((ticket) => ticket.assigned_to && !['Resolved', 'Closed'].includes(ticket.status)).reduce((acc, ticket) => {
    acc[ticket.assigned_to] = (acc[ticket.assigned_to] ?? 0) + 1;
    return acc;
  }, {})).map(([id, count]) => ({ agent: agentMap.get(id) ?? 'Unknown', open_tickets: count }));
  const csat = tickets.map((ticket) => Number(ticket.csat_rating)).filter((rating) => rating > 0);
  return {
    total: tickets.length,
    open: open.length,
    unassigned: open.filter((ticket) => !ticket.assigned_to).length,
    breached: open.filter((ticket) => ticket.sla_due_at && new Date(ticket.sla_due_at) < new Date()).length,
    resolved_today: tickets.filter((ticket) => ticket.resolved_at?.slice(0, 10) === today()).length,
    average_csat: csat.length ? Math.round((csat.reduce((sum, rating) => sum + rating, 0) / csat.length) * 10) / 10 : 0,
    csat_responses: csat.length,
    by_category: byCategory,
    workload,
  };
};

const documentHtml = (employee, type, note) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${type}</title>
<style>body{font-family:Georgia,serif;color:#0f172a;padding:48px;line-height:1.7}h1{font-size:22px}small{color:#64748b}</style></head>
<body><h1>HRMS Enterprise</h1><h2>${type}</h2>
<p>Date: ${new Date().toISOString().slice(0, 10)}</p>
<p>This is to certify that <strong>${employee.full_name}</strong> (${employee.employee_code}) is employed with HRMS Enterprise as <strong>${employee.designation}</strong> in the <strong>${employee.department}</strong> department, effective from ${employee.date_of_joining}.</p>
${note ? `<p>${note}</p>` : ''}
<p>This document has been issued through the HRMS employee self-service portal. For verification, contact the Human Resources department.</p>
<p><small>Generated document · Employee ID ${employee.employee_code}</small></p>
</body></html>`;

export const listDocuments = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s documents');
    where.employee_id = query.employee_id;
  } else if (!scope.all) {
    where.employee_id = { in: scope.ids };
  }
  const documents = await db.select('employee_documents', { where, order: { column: 'issued_at', ascending: false }, limit: 2000 });
  const payslipWhere = { ...(scope.all ? {} : { employee_id: { in: scope.ids } }) };
  if (query.employee_id) payslipWhere.employee_id = query.employee_id;
  const payslips = await db.select('payslips', { where: payslipWhere, order: { column: 'created_at', ascending: false }, limit: 500 });
  const payslipDocs = payslips.map((payslip) => ({
    id: `payslip-${payslip.id}`,
    employee_id: payslip.employee_id,
    document_type: 'Payslip',
    file_name: `payslip-${payslip.period}.html`,
    source_module: 'Payroll',
    issued_at: payslip.created_at,
    download_path: `/payroll/payslips/${payslip.id}/document`,
  }));
  const enriched = await employeeMap(documents);
  return [...enriched, ...(await employeeMap(payslipDocs))];
};

export const listDocumentRequests = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (!scope.all) where.employee_id = { in: scope.ids };
  if (query.status) where.status = query.status;
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s requests');
    where.employee_id = query.employee_id;
  }
  return employeeMap(await db.select('document_requests', { where, order: { column: 'created_at', ascending: false }, limit: 1000 }));
};

export const createDocumentRequest = async (user, payload, req) => {
  const request = await db.insert('document_requests', {
    employee_id: user.id,
    document_type: payload.document_type,
    reason: payload.reason ?? null,
    status: 'Pending',
  });
  await recordAudit({ actorId: user.id, action: 'DOCUMENT_REQUESTED', entityType: 'document_request', entityId: request.id, details: { document_type: payload.document_type }, req });
  return request;
};

export const issueDocumentRequest = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can issue documents');
  const request = await db.findById('document_requests', id);
  if (!request) throw notFound('Document request not found');
  if (request.status === 'Issued') throw conflict('This document request has already been issued');
  const employee = await db.findById('employees', request.employee_id);
  if (!employee) throw badRequest('Employee not found');
  const documentType = payload.document_type ?? request.document_type;
  const fileName = `${documentType.toLowerCase().replaceAll(' ', '-')}-${employee.employee_code}.html`;
  const content = documentHtml(employee, documentType, payload.note);
  const document = await db.insert('employee_documents', {
    employee_id: employee.id,
    document_type: documentType,
    file_name: fileName,
    source_module: 'Helpdesk',
    content,
    issued_by: user.id,
    issued_at: now(),
    request_id: request.id,
  });
  const [updated] = await db.update('document_requests', { id }, {
    status: 'Issued',
    issued_document_id: document.id,
    issued_by: user.id,
    issued_at: now(),
  });
  await recordAudit({ actorId: user.id, action: 'DOCUMENT_ISSUED', entityType: 'document_request', entityId: id, details: { document_id: document.id, document_type: documentType }, req });
  return { request: updated, document };
};

export const downloadDocument = async (user, id, req) => {
  const document = await db.findById('employee_documents', id);
  if (!document) throw notFound('Document not found');
  const scope = await getAccessScope(user);
  if (!scope.all && !scope.ids.includes(document.employee_id)) throw forbidden('You cannot download this document');
  await recordAudit({ actorId: user.id, action: 'DOCUMENT_DOWNLOADED', entityType: 'employee_document', entityId: id, details: { document_type: document.document_type }, req });
  return { filename: document.file_name, html: document.content ?? '<p>Document content unavailable.</p>' };
};
