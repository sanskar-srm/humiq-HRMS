import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';
import * as workforce from '../workforce/workforce.service.js';

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

export const overview = async (user) => {
  const scope = await getAccessScope(user);
  const scopeWhere = scope.all ? {} : { employee_id: { in: scope.ids } };
  const [goals, reviews, feedback, cycles] = await Promise.all([
    db.select('goals', { where: scopeWhere, limit: 5000 }),
    db.select('performance_reviews', { where: scopeWhere, limit: 5000 }),
    db.select('feedback', { where: scopeWhere, limit: 5000 }),
    db.select('review_cycles', { where: { status: 'Active' }, limit: 100 }),
  ]);
  const completedGoals = goals.filter((goal) => goal.status === 'Completed').length;
  const submittedReviews = reviews.filter((review) => ['Submitted', 'Acknowledged', 'Completed'].includes(review.status));
  const ratings = submittedReviews.map((review) => Number(review.rating)).filter((rating) => rating > 0);
  return {
    active_cycles: cycles.length,
    total_goals: goals.length,
    completed_goals: completedGoals,
    goal_completion: goals.length ? Math.round((completedGoals / goals.length) * 100) : 0,
    open_reviews: reviews.filter((review) => ['Draft', 'In Progress'].includes(review.status)).length,
    submitted_reviews: submittedReviews.length,
    average_rating: ratings.length ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10 : 0,
    feedback_count: feedback.length,
    scope: scope.all ? 'organization' : isManager(user) ? 'team' : 'self',
  };
};

export const listCycles = async () =>
  db.select('review_cycles', { order: { column: 'period_end', ascending: false }, limit: 200 });

export const createCycle = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage review cycles');
  if (payload.period_end < payload.period_start) throw badRequest('Cycle end date must be after the start date');
  const cycle = await db.insert('review_cycles', {
    name: payload.name,
    period_start: payload.period_start,
    period_end: payload.period_end,
    status: payload.status ?? 'Active',
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'REVIEW_CYCLE_CREATED', entityType: 'review_cycle', entityId: cycle.id, details: payload, req });
  return cycle;
};

export const updateCycle = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage review cycles');
  const cycle = await db.findById('review_cycles', id);
  if (!cycle) throw notFound('Review cycle not found');
  const [updated] = await db.update('review_cycles', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'REVIEW_CYCLE_UPDATED', entityType: 'review_cycle', entityId: id, details: payload, req });
  return updated;
};

export const listGoals = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s goals');
    where.employee_id = query.employee_id;
  } else if (!scope.all) {
    where.employee_id = { in: scope.ids };
  }
  if (query.cycle_id) where.cycle_id = query.cycle_id;
  if (query.status) where.status = query.status;
  return employeeMap(await db.select('goals', { where, order: { column: 'created_at', ascending: false }, limit: 2000 }));
};

export const createGoal = async (user, payload, req) => {
  const scope = await getAccessScope(user);
  const employeeId = payload.employee_id ?? user.id;
  if (!scope.all && !scope.ids.includes(employeeId)) throw forbidden('You can only create goals within your scope');
  const employee = await db.findById('employees', employeeId);
  if (!employee) throw badRequest('Employee not found');
  if (payload.cycle_id) {
    const cycle = await db.findById('review_cycles', payload.cycle_id);
    if (!cycle) throw badRequest('Review cycle not found');
  }
  const goal = await db.insert('goals', {
    employee_id: employeeId,
    cycle_id: payload.cycle_id ?? null,
    title: payload.title,
    description: payload.description ?? '',
    target: payload.target ?? '',
    progress: 0,
    weightage: payload.weightage ?? 0,
    status: 'Not Started',
    manager_id: employee.reports_to ?? null,
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'GOAL_CREATED', entityType: 'goal', entityId: goal.id, details: { employee_id: employeeId, title: goal.title }, req });
  return goal;
};

export const updateGoal = async (user, id, payload, req) => {
  const goal = await db.findById('goals', id);
  if (!goal) throw notFound('Goal not found');
  const scope = await getAccessScope(user);
  if (!scope.all && !scope.ids.includes(goal.employee_id)) throw forbidden('You cannot update this goal');
  const isOwner = goal.employee_id === user.id;
  const isManagerOfOwner = isManager(user) && goal.manager_id === user.id;
  if (!isOwner && !isManagerOfOwner && !isHRAdmin(user)) throw forbidden('You cannot update this goal');
  if (payload.progress !== undefined && (payload.progress < 0 || payload.progress > 100)) {
    throw badRequest('Progress must be between 0 and 100');
  }
  const patch = { ...payload };
  if (patch.progress === 100) patch.status = 'Completed';
  if (patch.status === 'Completed' && patch.progress === undefined) patch.progress = 100;
  if (patch.status === 'In Progress' && goal.status === 'Not Started' && patch.progress === undefined) patch.progress = 1;
  const [updated] = await db.update('goals', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'GOAL_UPDATED', entityType: 'goal', entityId: id, details: patch, req });
  return updated;
};

export const listReviews = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s reviews');
    where.employee_id = query.employee_id;
  } else if (!scope.all) {
    where.employee_id = { in: scope.ids };
  }
  if (query.cycle_id) where.cycle_id = query.cycle_id;
  if (query.status) where.status = query.status;
  const rows = await db.select('performance_reviews', { where, order: { column: 'created_at', ascending: false }, limit: 2000 });
  return employeeMap(rows);
};

export const createReview = async (user, payload, req) => {
  if (!isHRAdmin(user) && !isManager(user)) throw forbidden('Only Admin, HR or managers can create reviews');
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  if (isManager(user) && !isHRAdmin(user) && employee.reports_to !== user.id) {
    throw forbidden('You can only review your direct reports');
  }
  if (!payload.cycle_id) throw badRequest('A review cycle is required');
  const cycle = await db.findById('review_cycles', payload.cycle_id);
  if (!cycle) throw badRequest('Review cycle not found');
  const duplicate = await db.select('performance_reviews', { where: { employee_id: employee.id, cycle_id: cycle.id }, limit: 1 });
  if (duplicate.length) throw conflict('A review already exists for this employee in the cycle');
  const review = await db.insert('performance_reviews', {
    employee_id: employee.id,
    cycle_id: cycle.id,
    reviewer_id: user.id,
    rating: payload.rating ?? null,
    strengths: payload.strengths ?? '',
    improvements: payload.improvements ?? '',
    comments: payload.comments ?? '',
    status: 'Draft',
  });
  await recordAudit({ actorId: user.id, action: 'PERFORMANCE_REVIEW_CREATED', entityType: 'performance_review', entityId: review.id, details: { employee_id: employee.id }, req });
  return employeeMap([review]).then(([row]) => row);
};

export const updateReview = async (user, id, payload, req) => {
  const review = await db.findById('performance_reviews', id);
  if (!review) throw notFound('Review not found');
  const isReviewer = review.reviewer_id === user.id;
  const isSubject = review.employee_id === user.id;
  if (!isReviewer && !isHRAdmin(user)) {
    if (!isSubject) throw forbidden('You cannot update this review');
    if (!(payload.status === 'Acknowledged' && review.status === 'Submitted')) {
      throw forbidden('You can only acknowledge your own submitted review');
    }
  }
  if (isSubject && !isReviewer && !isHRAdmin(user)) {
    const [updated] = await db.update('performance_reviews', { id }, { status: 'Acknowledged', acknowledged_at: new Date().toISOString() });
    await recordAudit({ actorId: user.id, action: 'PERFORMANCE_REVIEW_ACKNOWLEDGED', entityType: 'performance_review', entityId: id, req });
    return employeeMap([updated]).then(([row]) => row);
  }
  if (payload.rating !== undefined && (payload.rating < 1 || payload.rating > 5)) {
    throw badRequest('Rating must be between 1 and 5');
  }
  const patch = { ...payload };
  if (patch.status === 'Submitted') {
    patch.submitted_at = new Date().toISOString();
    if (!review.rating && !patch.rating) throw badRequest('A rating is required before submitting the review');
  }
  if (patch.status === 'Completed') patch.completed_at = new Date().toISOString();
  const [updated] = await db.update('performance_reviews', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'PERFORMANCE_REVIEW_UPDATED', entityType: 'performance_review', entityId: id, details: patch, req });
  return employeeMap([updated]).then(([row]) => row);
};

export const listFeedback = async (user, query) => {
  const scope = await getAccessScope(user);
  let rows = await db.select('feedback', { order: { column: 'created_at', ascending: false }, limit: 2000 });
  if (!scope.all) {
    rows = rows.filter((row) => scope.ids.includes(row.employee_id) || row.from_employee_id === user.id);
  }
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s feedback');
    rows = rows.filter((row) => row.employee_id === query.employee_id);
  }
  const enriched = await employeeMap(rows);
  const senderIds = [...new Set(rows.map((row) => row.from_employee_id).filter(Boolean))];
  const senders = senderIds.length ? await db.select('employees', { where: { id: { in: senderIds } }, limit: senderIds.length }) : [];
  const map = new Map(senders.map((sender) => [sender.id, sender.full_name]));
  return enriched.map((row) => ({ ...row, from_name: map.get(row.from_employee_id) ?? 'Anonymous' }));
};

export const createFeedback = async (user, payload, req) => {
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  if (employee.id === user.id) throw badRequest('You cannot submit feedback about yourself');
  const feedback = await db.insert('feedback', {
    employee_id: payload.employee_id,
    from_employee_id: user.id,
    type: payload.type,
    message: payload.message,
    visibility: payload.visibility ?? 'Manager and HR',
  });
  await recordAudit({ actorId: user.id, action: 'FEEDBACK_SUBMITTED', entityType: 'feedback', entityId: feedback.id, details: { employee_id: payload.employee_id, type: payload.type }, req });
  return feedback;
};

export const listSkills = (user, employeeId) => workforce.listSkills(user, employeeId);
export const createSkill = (user, payload, req) => workforce.createSkill(user, payload, req);
export const updateSkill = (user, id, payload, req) => workforce.updateSkill(user, id, payload, req);

export const reports = async (user) => {
  if (!isHRAdmin(user) && !isManager(user)) throw forbidden('Appraisal reports are management-only');
  const scope = await getAccessScope(user);
  const where = scope.all ? {} : { employee_id: { in: scope.ids } };
  const [goals, reviews, employees] = await Promise.all([
    db.select('goals', { where, limit: 10000 }),
    db.select('performance_reviews', { where, limit: 10000 }),
    db.select('employees', { where: scope.all ? { is_active: true } : { id: { in: scope.ids } }, limit: 5000 }),
  ]);
  const departmentMap = new Map(employees.map((employee) => [employee.id, employee.department]));
  const byDepartment = {};
  for (const review of reviews) {
    const department = departmentMap.get(review.employee_id) ?? 'Unassigned';
    if (!byDepartment[department]) byDepartment[department] = { department, reviews: 0, ratings: [], goals: 0 };
    byDepartment[department].reviews += 1;
    if (review.rating) byDepartment[department].ratings.push(Number(review.rating));
  }
  for (const goal of goals) {
    const department = departmentMap.get(goal.employee_id) ?? 'Unassigned';
    if (!byDepartment[department]) byDepartment[department] = { department, reviews: 0, ratings: [], goals: 0 };
    byDepartment[department].goals += 1;
  }
  return {
    goals_by_status: Object.entries(goals.reduce((acc, goal) => { acc[goal.status] = (acc[goal.status] ?? 0) + 1; return acc; }, {})).map(([status, count]) => ({ status, count })),
    reviews_by_status: Object.entries(reviews.reduce((acc, review) => { acc[review.status] = (acc[review.status] ?? 0) + 1; return acc; }, {})).map(([status, count]) => ({ status, count })),
    departments: Object.values(byDepartment).map((row) => ({
      department: row.department,
      reviews: row.reviews,
      goals: row.goals,
      average_rating: row.ratings.length ? Math.round((row.ratings.reduce((sum, rating) => sum + rating, 0) / row.ratings.length) * 10) / 10 : 0,
    })),
    average_rating: reviews.filter((review) => review.rating).length
      ? Math.round((reviews.filter((review) => review.rating).reduce((sum, review) => sum + Number(review.rating), 0) / reviews.filter((review) => review.rating).length) * 10) / 10
      : 0,
  };
};
