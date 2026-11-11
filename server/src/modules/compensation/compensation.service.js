import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, getDirectReports } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

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
  const pendingWhere = { status: { in: ['Submitted', 'Manager Approved'] } };
  const pending = await db.count('reimbursements', scope.all ? pendingWhere : { ...pendingWhere, employee_id: { in: scope.ids } });
  const rewards = await db.select('rewards', {
    where: scope.all ? {} : { employee_id: { in: scope.ids } },
    limit: 5000,
  });

  if (isHRAdmin(user)) {
    const [structures, grades, benefits, enrollments] = await Promise.all([
      db.select('employee_compensation', { limit: 5000 }),
      db.select('salary_grades', { limit: 500 }),
      db.select('benefits', { limit: 500 }),
      db.count('benefit_enrollments', { status: 'Active' }),
    ]);
    const totalCost = structures.reduce((sum, row) => sum + Number(row.base_salary ?? 0), 0);
    return {
      salary_cost: totalCost,
      average_salary: structures.length ? Math.round(totalCost / structures.length) : 0,
      structures: structures.length,
      salary_grades: grades.length,
      active_benefits: benefits.filter((benefit) => benefit.active !== false).length,
      enrollments,
      pending_reimbursements: pending,
      rewards_points: rewards.reduce((sum, reward) => sum + Number(reward.points ?? 0), 0),
    };
  }

  if (isManager(user)) {
    const team = await getDirectReports(user.id);
    return {
      team_size: team.length,
      pending_reimbursements: pending,
      rewards_points: rewards.reduce((sum, reward) => sum + Number(reward.points ?? 0), 0),
      team_rewards: rewards.length,
    };
  }

  const [compensation, enrollments] = await Promise.all([
    db.select('employee_compensation', { where: { employee_id: user.id }, limit: 1 }),
    db.select('benefit_enrollments', { where: { employee_id: user.id, status: 'Active' }, limit: 100 }),
  ]);
  return {
    base_salary: compensation[0]?.base_salary ?? null,
    currency: compensation[0]?.currency ?? 'INR',
    active_benefits: enrollments.length,
    pending_reimbursements: pending,
    rewards_points: rewards.reduce((sum, reward) => sum + Number(reward.points ?? 0), 0),
  };
};

export const listSalaryGrades = async (user) => {
  if (!isHRAdmin(user)) throw forbidden('Salary grade administration is restricted to Admin and HR');
  return db.select('salary_grades', { order: { column: 'grade', ascending: true }, limit: 500 });
};

export const createSalaryGrade = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Salary grade administration is restricted to Admin and HR');
  if (Number(payload.max_salary) < Number(payload.min_salary)) throw badRequest('Maximum salary must be greater than or equal to minimum salary');
  const duplicate = await db.select('salary_grades', { where: { grade: payload.grade }, limit: 1 });
  if (duplicate.length) throw conflict('A salary grade with this name already exists');
  const grade = await db.insert('salary_grades', { ...payload, created_by: user.id });
  await recordAudit({ actorId: user.id, action: 'SALARY_GRADE_CREATED', entityType: 'salary_grade', entityId: grade.id, details: payload, req });
  return grade;
};

export const updateSalaryGrade = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Salary grade administration is restricted to Admin and HR');
  const grade = await db.findById('salary_grades', id);
  if (!grade) throw notFound('Salary grade not found');
  const min = payload.min_salary ?? grade.min_salary;
  const max = payload.max_salary ?? grade.max_salary;
  if (Number(max) < Number(min)) throw badRequest('Maximum salary must be greater than or equal to minimum salary');
  const [updated] = await db.update('salary_grades', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'SALARY_GRADE_UPDATED', entityType: 'salary_grade', entityId: id, details: payload, req });
  return updated;
};

export const listStructures = async (user, employeeId) => {
  if (employeeId) {
    if (!isHRAdmin(user) && user.id !== employeeId) throw forbidden('You cannot view another employee’s compensation');
    const [row] = await db.select('employee_compensation', { where: { employee_id: employeeId }, limit: 1 });
    return row ? (await employeeMap([row]))[0] : null;
  }
  if (!isHRAdmin(user)) throw forbidden('Organization-wide compensation is restricted to Admin and HR');
  return employeeMap(await db.select('employee_compensation', { order: { column: 'created_at', ascending: false }, limit: 5000 }));
};

export const upsertStructure = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage salary structures');
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  if (payload.grade_id) {
    const grade = await db.findById('salary_grades', payload.grade_id);
    if (!grade) throw badRequest('Salary grade not found');
    if (Number(payload.base_salary) < Number(grade.min_salary) || Number(payload.base_salary) > Number(grade.max_salary)) {
      throw badRequest(`Base salary must fall within the ${grade.grade} range`);
    }
  }
  const [existing] = await db.select('employee_compensation', { where: { employee_id: payload.employee_id }, limit: 1 });
  let row;
  if (existing) {
    [row] = await db.update('employee_compensation', { id: existing.id }, { ...payload, updated_by: user.id });
  } else {
    row = await db.insert('employee_compensation', { ...payload, updated_by: user.id });
  }
  await recordAudit({ actorId: user.id, action: 'COMPENSATION_STRUCTURE_UPDATED', entityType: 'employee_compensation', entityId: row.id, details: { employee_id: payload.employee_id, base_salary: payload.base_salary }, req });
  return row;
};

export const listBenefits = async () =>
  db.select('benefits', { order: { column: 'name', ascending: true }, limit: 500 });

export const createBenefit = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage benefits');
  const benefit = await db.insert('benefits', { ...payload, created_by: user.id });
  await recordAudit({ actorId: user.id, action: 'BENEFIT_CREATED', entityType: 'benefit', entityId: benefit.id, details: payload, req });
  return benefit;
};

export const updateBenefit = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage benefits');
  const benefit = await db.findById('benefits', id);
  if (!benefit) throw notFound('Benefit not found');
  const [updated] = await db.update('benefits', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'BENEFIT_UPDATED', entityType: 'benefit', entityId: id, details: payload, req });
  return updated;
};

export const listEnrollments = async (user, employeeId) => {
  if (employeeId) {
    if (!isHRAdmin(user) && user.id !== employeeId) throw forbidden('You cannot view another employee’s benefit enrollments');
    return employeeMap(await db.select('benefit_enrollments', { where: { employee_id: employeeId }, limit: 500 }));
  }
  if (!isHRAdmin(user)) {
    return employeeMap(await db.select('benefit_enrollments', { where: { employee_id: user.id }, limit: 500 }));
  }
  return employeeMap(await db.select('benefit_enrollments', { order: { column: 'created_at', ascending: false }, limit: 5000 }));
};

export const enrollBenefit = async (user, payload, req) => {
  const employeeId = payload.employee_id ?? user.id;
  if (employeeId !== user.id && !isHRAdmin(user)) throw forbidden('You can only enroll yourself in benefits');
  const [benefit, employee] = await Promise.all([
    db.findById('benefits', payload.benefit_id),
    db.findById('employees', employeeId),
  ]);
  if (!benefit || benefit.active === false) throw badRequest('Benefit is not available');
  if (!employee) throw badRequest('Employee not found');
  const existing = await db.select('benefit_enrollments', { where: { employee_id: employeeId, benefit_id: payload.benefit_id, status: 'Active' }, limit: 1 });
  if (existing.length) throw conflict('You are already enrolled in this benefit');
  const enrollment = await db.insert('benefit_enrollments', {
    employee_id: employeeId,
    benefit_id: payload.benefit_id,
    status: 'Active',
    enrolled_at: new Date().toISOString(),
    enrolled_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'BENEFIT_ENROLLED', entityType: 'benefit_enrollment', entityId: enrollment.id, details: { benefit_id: payload.benefit_id }, req });
  return enrollment;
};

export const updateEnrollment = async (user, id, status, req) => {
  const enrollment = await db.findById('benefit_enrollments', id);
  if (!enrollment) throw notFound('Enrollment not found');
  if (!isHRAdmin(user) && enrollment.employee_id !== user.id) throw forbidden('You cannot update this enrollment');
  if (!isHRAdmin(user) && status !== 'Cancelled') throw forbidden('Only Admin or HR can change enrollment status');
  const [updated] = await db.update('benefit_enrollments', { id }, { status, updated_at: new Date().toISOString() });
  await recordAudit({ actorId: user.id, action: 'BENEFIT_ENROLLMENT_UPDATED', entityType: 'benefit_enrollment', entityId: id, details: { status }, req });
  return updated;
};

export const listRewards = async (user) => {
  const scope = await getAccessScope(user);
  const where = scope.all ? {} : { employee_id: { in: scope.ids } };
  return employeeMap(await db.select('rewards', { where, order: { column: 'awarded_at', ascending: false }, limit: 1000 }));
};

export const createReward = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can award rewards');
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  const reward = await db.insert('rewards', {
    ...payload,
    awarded_by: user.id,
    awarded_at: new Date().toISOString(),
  });
  await recordAudit({ actorId: user.id, action: 'REWARD_AWARDED', entityType: 'reward', entityId: reward.id, details: payload, req });
  return reward;
};

export const listReimbursements = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('You cannot view this employee’s reimbursements');
    where.employee_id = query.employee_id;
  } else if (!scope.all) {
    where.employee_id = { in: scope.ids };
  }
  if (query.status) where.status = query.status;
  const rows = await db.select('reimbursements', { where, order: { column: 'created_at', ascending: false }, limit: 1000 });
  return employeeMap(rows);
};

export const createReimbursement = async (user, payload, req) => {
  const employeeId = payload.employee_id ?? user.id;
  if (employeeId !== user.id && !isHRAdmin(user)) throw forbidden('You can only submit your own reimbursement');
  const employee = await db.findById('employees', employeeId);
  if (!employee) throw badRequest('Employee not found');
  const reimbursement = await db.insert('reimbursements', {
    employee_id: employeeId,
    category: payload.category,
    amount: Number(payload.amount),
    description: payload.description,
    receipt_url: payload.receipt_url ?? null,
    status: 'Submitted',
    manager_id: employee.reports_to ?? null,
    submitted_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'REIMBURSEMENT_SUBMITTED', entityType: 'reimbursement', entityId: reimbursement.id, details: { amount: payload.amount, category: payload.category }, req });
  const [enriched] = await employeeMap([reimbursement]);
  return enriched;
};

export const decideReimbursement = async (user, id, decision, note, req) => {
  const reimbursement = await db.findById('reimbursements', id);
  if (!reimbursement) throw notFound('Reimbursement not found');
  if (['Approved', 'Rejected'].includes(reimbursement.status)) throw conflict('This reimbursement has already been finalized');
  if (reimbursement.employee_id === user.id) throw forbidden('You cannot approve or reject your own reimbursement');

  const employee = await db.findById('employees', reimbursement.employee_id);
  const managerId = reimbursement.manager_id ?? employee?.reports_to ?? null;

  if (decision === 'Rejected') {
    const isManagerApprover = managerId && managerId === user.id;
    if (!isHRAdmin(user) && !isManagerApprover) throw forbidden('You are not authorized to reject this reimbursement');
    const [updated] = await db.update('reimbursements', { id }, {
      status: 'Rejected',
      decision_note: note ?? null,
      rejected_by: user.id,
      rejected_at: new Date().toISOString(),
    });
    await recordAudit({ actorId: user.id, action: 'REIMBURSEMENT_REJECTED', entityType: 'reimbursement', entityId: id, details: { note }, req });
    const [enriched] = await employeeMap([updated]);
    return enriched;
  }

  if (reimbursement.status === 'Submitted') {
    if (managerId && managerId === user.id) {
      const [updated] = await db.update('reimbursements', { id }, {
        status: 'Manager Approved',
        manager_approved_by: user.id,
        manager_approved_at: new Date().toISOString(),
      });
      await recordAudit({ actorId: user.id, action: 'REIMBURSEMENT_MANAGER_APPROVED', entityType: 'reimbursement', entityId: id, req });
      const [enriched] = await employeeMap([updated]);
      return enriched;
    }
    if (!managerId && isHRAdmin(user)) {
      const [updated] = await db.update('reimbursements', { id }, {
        status: 'Approved',
        hr_approved_by: user.id,
        hr_approved_at: new Date().toISOString(),
      });
      await recordAudit({ actorId: user.id, action: 'REIMBURSEMENT_APPROVED', entityType: 'reimbursement', entityId: id, details: { direct: true }, req });
      const [enriched] = await employeeMap([updated]);
      return enriched;
    }
    if (managerId) throw forbidden('This reimbursement must be reviewed by the reporting manager before HR approval');
    throw forbidden('Only Admin or HR can approve this reimbursement');
  }

  if (reimbursement.status === 'Manager Approved') {
    if (!isHRAdmin(user)) throw forbidden('Only Admin or HR can give final approval');
    const [updated] = await db.update('reimbursements', { id }, {
      status: 'Approved',
      hr_approved_by: user.id,
      hr_approved_at: new Date().toISOString(),
    });
    await recordAudit({ actorId: user.id, action: 'REIMBURSEMENT_APPROVED', entityType: 'reimbursement', entityId: id, req });
    const [enriched] = await employeeMap([updated]);
    return enriched;
  }

  throw conflict('Unexpected reimbursement state');
};
