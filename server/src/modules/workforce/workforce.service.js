import { db } from '../../db/index.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

const canWrite = (user) => isHRAdmin(user);

const departmentScope = (user) => (isManager(user) && !isHRAdmin(user) ? { department: user.department } : {});

export const overview = async (user) => {
  const employees = await db.select('employees', {
    where: { is_active: true, ...departmentScope(user) },
    limit: 5000,
  });
  const employeeIds = employees.map((employee) => employee.id);
  const allocations = await db.select('workforce_allocations', {
    where: employeeIds.length ? { employee_id: { in: employeeIds } } : { employee_id: '__none__' },
    limit: 5000,
  });
  const activeAllocations = allocations.filter((allocation) => allocation.status !== 'Ended');
  const allocatedIds = new Set(activeAllocations.map((allocation) => allocation.employee_id));
  const forecasts = await db.select('workforce_forecasts', {
    where: departmentScope(user),
    order: { column: 'created_at', ascending: false },
    limit: 100,
  });
  const skills = await db.select('employee_skills', {
    where: employeeIds.length ? { employee_id: { in: employeeIds } } : { employee_id: '__none__' },
    limit: 5000,
  });

  const departmentCounts = Object.entries(
    employees.reduce((acc, employee) => {
      acc[employee.department] = (acc[employee.department] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([department, count]) => ({ department, count }));

  const skillCounts = Object.entries(
    skills.reduce((acc, skill) => {
      acc[skill.skill] = (acc[skill.skill] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const totalAllocation = activeAllocations.reduce((sum, allocation) => sum + Number(allocation.allocation_percent ?? 0), 0);

  return {
    headcount: employees.length,
    allocated: allocatedIds.size,
    bench: Math.max(0, employees.length - allocatedIds.size),
    utilization: employees.length ? Math.round(totalAllocation / employees.length) : 0,
    open_gap: forecasts.reduce((sum, forecast) => sum + Number(forecast.gap ?? 0), 0),
    departments: departmentCounts,
    top_skills: skillCounts,
    active_projects: await db.count('workforce_projects', { status: 'Active', ...departmentScope(user) }),
    succession_plans: await db.count('succession_plans', departmentScope(user)),
  };
};

export const listProjects = async (user) => {
  const projects = await db.select('workforce_projects', {
    where: departmentScope(user),
    order: { column: 'created_at', ascending: false },
    limit: 500,
  });
  const allocations = await db.select('workforce_allocations', {
    where: projects.length ? { project_id: { in: projects.map((project) => project.id) } } : { project_id: '__none__' },
    limit: 5000,
  });
  return projects.map((project) => ({
    ...project,
    allocation_count: allocations.filter((allocation) => allocation.project_id === project.id).length,
    allocated_percent: allocations
      .filter((allocation) => allocation.project_id === project.id && allocation.status !== 'Ended')
      .reduce((sum, allocation) => sum + Number(allocation.allocation_percent ?? 0), 0),
  }));
};

export const createProject = async (user, payload, req) => {
  if (!canWrite(user)) throw forbidden('Only Admin or HR can manage workforce projects');
  const project = await db.insert('workforce_projects', {
    ...payload,
    department: payload.department ?? user.department,
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'WORKFORCE_PROJECT_CREATED', entityType: 'workforce_project', entityId: project.id, details: payload, req });
  return project;
};

export const updateProject = async (user, id, payload, req) => {
  if (!canWrite(user)) throw forbidden('Only Admin or HR can manage workforce projects');
  const project = await db.findById('workforce_projects', id);
  if (!project) throw notFound('Project not found');
  const [updated] = await db.update('workforce_projects', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'WORKFORCE_PROJECT_UPDATED', entityType: 'workforce_project', entityId: id, details: payload, req });
  return updated;
};

export const deleteProject = async (user, id, req) => {
  if (!canWrite(user)) throw forbidden('Only Admin or HR can manage workforce projects');
  const removed = await db.remove('workforce_projects', { id });
  if (!removed) throw notFound('Project not found');
  await db.remove('workforce_allocations', { project_id: id });
  await recordAudit({ actorId: user.id, action: 'WORKFORCE_PROJECT_DELETED', entityType: 'workforce_project', entityId: id, req });
};

export const listAllocations = async (user) => {
  const scope = await getAccessScope(user);
  const where = scope.all ? {} : { employee_id: { in: scope.ids } };
  const allocations = await db.select('workforce_allocations', { where, order: { column: 'created_at', ascending: false }, limit: 2000 });
  return enrichAllocations(allocations);
};

const enrichAllocations = async (allocations) => {
  const employeeIds = [...new Set(allocations.map((allocation) => allocation.employee_id))];
  const projectIds = [...new Set(allocations.map((allocation) => allocation.project_id))];
  const [employees, projects] = await Promise.all([
    employeeIds.length ? db.select('employees', { where: { id: { in: employeeIds } }, limit: employeeIds.length }) : [],
    projectIds.length ? db.select('workforce_projects', { where: { id: { in: projectIds } }, limit: projectIds.length }) : [],
  ]);
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  const projectMap = new Map(projects.map((project) => [project.id, project.name]));
  return allocations.map((allocation) => ({
    ...allocation,
    employee_name: employeeMap.get(allocation.employee_id) ?? 'Unknown employee',
    project_name: projectMap.get(allocation.project_id) ?? 'Unknown project',
  }));
};

export const createAllocation = async (user, payload, req) => {
  if (!canWrite(user)) throw forbidden('Only Admin or HR can manage allocations');
  const [employee, project] = await Promise.all([
    db.findById('employees', payload.employee_id),
    db.findById('workforce_projects', payload.project_id),
  ]);
  if (!employee) throw badRequest('Employee not found');
  if (!project) throw badRequest('Project not found');
  const existing = await db.select('workforce_allocations', {
    where: { employee_id: payload.employee_id, project_id: payload.project_id, status: 'Active' },
    limit: 1,
  });
  if (existing.length) throw badRequest('This employee is already allocated to the project');
  const allocation = await db.insert('workforce_allocations', {
    ...payload,
    status: payload.status ?? 'Active',
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'WORKFORCE_ALLOCATION_CREATED', entityType: 'workforce_allocation', entityId: allocation.id, details: payload, req });
  const [enriched] = await enrichAllocations([allocation]);
  return enriched;
};

export const endAllocation = async (user, id, req) => {
  if (!canWrite(user)) throw forbidden('Only Admin or HR can end allocations');
  const allocation = await db.findById('workforce_allocations', id);
  if (!allocation) throw notFound('Allocation not found');
  const [updated] = await db.update('workforce_allocations', { id }, { status: 'Ended', end_date: new Date().toISOString().slice(0, 10) });
  await recordAudit({ actorId: user.id, action: 'WORKFORCE_ALLOCATION_ENDED', entityType: 'workforce_allocation', entityId: id, req });
  return updated;
};

export const listForecasts = async (user) =>
  db.select('workforce_forecasts', {
    where: departmentScope(user),
    order: { column: 'created_at', ascending: false },
    limit: 500,
  });

export const createForecast = async (user, payload, req) => {
  if (!canWrite(user)) throw forbidden('Only Admin or HR can manage forecasts');
  const current = Number(payload.current_headcount ?? 0);
  const forecast = Number(payload.forecast_headcount ?? 0);
  const record = await db.insert('workforce_forecasts', {
    ...payload,
    current_headcount: current,
    forecast_headcount: forecast,
    gap: forecast - current,
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'WORKFORCE_FORECAST_CREATED', entityType: 'workforce_forecast', entityId: record.id, details: payload, req });
  return record;
};

export const listSkills = async (user, employeeId) => {
  const scope = await getAccessScope(user);
  if (employeeId) {
    if (!scope.all && !scope.ids.includes(employeeId)) throw forbidden('You cannot view this employee’s skills');
    return enrichSkills(await db.select('employee_skills', { where: { employee_id: employeeId }, limit: 500 }));
  }
  const where = scope.all ? {} : { employee_id: { in: scope.ids } };
  return enrichSkills(await db.select('employee_skills', { where, order: { column: 'skill', ascending: true }, limit: 2000 }));
};

const enrichSkills = async (skills) => {
  const ids = [...new Set(skills.map((skill) => skill.employee_id))];
  const employees = ids.length ? await db.select('employees', { where: { id: { in: ids } }, limit: ids.length }) : [];
  const map = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  return skills.map((skill) => ({ ...skill, employee_name: map.get(skill.employee_id) ?? 'Unknown employee' }));
};

export const createSkill = async (user, payload, req) => {
  const scope = await getAccessScope(user);
  if (!scope.all && !scope.ids.includes(payload.employee_id)) {
    throw forbidden('You can only manage skills within your scope');
  }
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  const skill = await db.insert('employee_skills', { ...payload, updated_by: user.id });
  await recordAudit({ actorId: user.id, action: 'EMPLOYEE_SKILL_ADDED', entityType: 'employee_skill', entityId: skill.id, details: payload, req });
  return skill;
};

export const updateSkill = async (user, id, payload, req) => {
  const skill = await db.findById('employee_skills', id);
  if (!skill) throw notFound('Skill not found');
  const scope = await getAccessScope(user);
  if (!scope.all && !scope.ids.includes(skill.employee_id)) throw forbidden('You cannot update this skill');
  const [updated] = await db.update('employee_skills', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'EMPLOYEE_SKILL_UPDATED', entityType: 'employee_skill', entityId: id, details: payload, req });
  return updated;
};

export const listSuccession = async (user) =>
  db.select('succession_plans', { where: departmentScope(user), order: { column: 'created_at', ascending: false }, limit: 200 });

export const createSuccession = async (user, payload, req) => {
  if (!canWrite(user)) throw forbidden('Only Admin or HR can manage succession plans');
  const plan = await db.insert('succession_plans', { ...payload, created_by: user.id });
  await recordAudit({ actorId: user.id, action: 'SUCCESSION_PLAN_CREATED', entityType: 'succession_plan', entityId: plan.id, details: payload, req });
  return plan;
};
