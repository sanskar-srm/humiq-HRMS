import { db } from '../../db/index.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin, isManager } from '../../utils/roles.js';
import { getAccessScope, canAccessEmployee } from '../../utils/scope.js';
import { recordAudit } from '../../utils/audit.js';

const employeeMap = async (rows, field = 'employee_id') => {
  const ids = [...new Set(rows.map((row) => row[field]).filter(Boolean))];
  const employees = ids.length ? await db.select('employees', { where: { id: { in: ids } }, limit: ids.length }) : [];
  const map = new Map(employees.map((e) => [e.id, e]));
  return rows.map((row) => ({
    ...row,
    employee_name: map.get(row[field])?.full_name ?? 'Unknown',
    employee_code: map.get(row[field])?.employee_code ?? '',
  }));
};

const enrichCourses = async (courses) => {
  const courseIds = courses.map((c) => c.id);
  if (!courseIds.length) return courses;
  const assignments = await db.select('lms_course_assignments', { where: { course_id: { in: courseIds } }, limit: 10000 });
  return courses.map((course) => ({
    ...course,
    assignment_count: assignments.filter((a) => a.course_id === course.id).length,
    completed_count: assignments.filter((a) => a.course_id === course.id && a.status === 'Completed').length,
  }));
};

export const overview = async (user) => {
  const scope = await getAccessScope(user);
  if (isHRAdmin(user)) {
    const [courses, assignments] = await Promise.all([
      db.select('lms_courses', { where: { status: 'Published' }, limit: 500 }),
      db.select('lms_course_assignments', { limit: 10000 }),
    ]);
    const inProgress = assignments.filter((a) => a.status === 'In Progress').length;
    const completed = assignments.filter((a) => a.status === 'Completed').length;
    return { mode: 'admin', published_courses: courses.length, assignments_total: assignments.length, in_progress: inProgress, completed };
  }
  const myAssignments = await db.select('lms_course_assignments', {
    where: { employee_id: user.id },
    limit: 500,
  });
  let teamAssignments = [];
  if (isManager(user) && scope.teamIds?.length) {
    teamAssignments = await db.select('lms_course_assignments', {
      where: { employee_id: { in: scope.teamIds } },
      limit: 2000,
    });
  }
  return {
    mode: isManager(user) ? 'manager' : 'self',
    my_assigned: myAssignments.filter((a) => a.status === 'Assigned').length,
    my_in_progress: myAssignments.filter((a) => a.status === 'In Progress').length,
    my_completed: myAssignments.filter((a) => a.status === 'Completed').length,
    team_open: teamAssignments.filter((a) => a.status !== 'Completed').length,
  };
};

export const listCourses = async (user, query) => {
  const where = {};
  if (isHRAdmin(user)) {
    if (query.status) where.status = query.status;
  } else {
    where.status = 'Published';
  }
  const courses = await db.select('lms_courses', {
    where,
    order: { column: 'title', ascending: true },
    limit: 500,
  });
  return enrichCourses(courses);
};

export const createCourse = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage courses');
  const course = await db.insert('lms_courses', {
    title: payload.title,
    description: payload.description ?? '',
    duration_hours: payload.duration_hours ?? 1,
    category: payload.category ?? '',
    status: payload.status ?? 'Draft',
    content: payload.content ?? '',
    created_by: user.id,
    published_at: payload.status === 'Published' ? new Date().toISOString() : null,
  });
  await recordAudit({ actorId: user.id, action: 'LMS_COURSE_CREATED', entityType: 'lms_course', entityId: course.id, req });
  return course;
};

export const updateCourse = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage courses');
  const course = await db.findById('lms_courses', id);
  if (!course) throw notFound('Course not found');
  const patch = { ...payload };
  if (patch.status === 'Published' && course.status !== 'Published') patch.published_at = new Date().toISOString();
  const [updated] = await db.update('lms_courses', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'LMS_COURSE_UPDATED', entityType: 'lms_course', entityId: id, details: patch, req });
  return updated;
};

export const getCourse = async (user, id) => {
  const course = await db.findById('lms_courses', id);
  if (!course) throw notFound('Course not found');
  if (!isHRAdmin(user) && course.status !== 'Published') throw forbidden('Course not available');
  const assessments = await db.select('lms_assessments', { where: { course_id: id }, limit: 50 });
  return { ...course, assessments };
};

export const listAssignments = async (user, query) => {
  const scope = await getAccessScope(user);
  const where = {};
  if (query.employee_id) {
    if (!await canAccessEmployee(user, query.employee_id) && query.employee_id !== user.id) throw forbidden('Out of scope');
    where.employee_id = query.employee_id;
  } else if (!isHRAdmin(user)) {
    where.employee_id = { in: scope.ids };
  }
  if (query.course_id) where.course_id = query.course_id;
  if (query.status) where.status = query.status;
  const rows = await db.select('lms_course_assignments', {
    where,
    order: { column: 'created_at', ascending: false },
    limit: 2000,
  });
  const courseIds = [...new Set(rows.map((r) => r.course_id))];
  const courses = courseIds.length ? await db.select('lms_courses', { where: { id: { in: courseIds } }, limit: courseIds.length }) : [];
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const enriched = await employeeMap(rows);
  return enriched.map((row) => ({
    ...row,
    course_title: courseMap.get(row.course_id)?.title ?? 'Unknown course',
  }));
};

export const assignCourse = async (user, payload, req) => {
  if (!isHRAdmin(user) && !isManager(user)) throw forbidden('Only Admin, HR or managers can assign training');
  const course = await db.findById('lms_courses', payload.course_id);
  if (!course || course.status !== 'Published') throw badRequest('Course must be published');
  const scope = await getAccessScope(user);
  for (const employeeId of payload.employee_ids) {
    if (!isHRAdmin(user) && !scope.ids.includes(employeeId)) throw forbidden(`Cannot assign to employee outside your team`);
    const existing = await db.select('lms_course_assignments', { where: { course_id: course.id, employee_id: employeeId }, limit: 1 });
    if (!existing.length) {
      await db.insert('lms_course_assignments', {
        course_id: course.id,
        employee_id: employeeId,
        status: 'Assigned',
        progress: 0,
        due_date: payload.due_date ?? null,
        assigned_by: user.id,
      });
    }
  }
  await recordAudit({ actorId: user.id, action: 'LMS_COURSE_ASSIGNED', entityType: 'lms_course', entityId: course.id, details: { employees: payload.employee_ids.length }, req });
  return { assigned: payload.employee_ids.length };
};

export const updateAssignment = async (user, id, payload, req) => {
  const assignment = await db.findById('lms_course_assignments', id);
  if (!assignment) throw notFound('Assignment not found');
  const isOwner = assignment.employee_id === user.id;
  if (!isOwner && !isHRAdmin(user) && !(isManager(user) && await canAccessEmployee(user, assignment.employee_id))) {
    throw forbidden('You cannot update this assignment');
  }
  const patch = {};
  if (payload.progress !== undefined) {
    if (!isOwner && !isHRAdmin(user)) throw forbidden('Only the learner or HR can update progress');
    patch.progress = Math.min(100, Math.max(0, payload.progress));
    if (patch.progress > 0 && assignment.status === 'Assigned') patch.status = 'In Progress';
    if (patch.progress >= 100) {
      patch.status = 'Completed';
      patch.completed_at = new Date().toISOString();
    }
  }
  if (payload.status && isHRAdmin(user)) patch.status = payload.status;
  const [updated] = await db.update('lms_course_assignments', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'LMS_ASSIGNMENT_UPDATED', entityType: 'lms_course_assignment', entityId: id, details: patch, req });
  return updated;
};

export const listAnnouncements = async (user) => {
  const where = isHRAdmin(user) ? {} : { status: 'Published' };
  return db.select('lms_announcements', {
    where,
    order: { column: 'published_at', ascending: false },
    limit: 100,
  });
};

export const createAnnouncement = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can post announcements');
  const row = await db.insert('lms_announcements', {
    title: payload.title,
    body: payload.body,
    status: payload.status ?? 'Published',
    published_at: new Date().toISOString(),
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'LMS_ANNOUNCEMENT_CREATED', entityType: 'lms_announcement', entityId: row.id, req });
  return row;
};

export const submitAssessment = async (user, assessmentId, answers, req) => {
  const assessment = await db.findById('lms_assessments', assessmentId);
  if (!assessment) throw notFound('Assessment not found');
  const questions = await db.select('lms_assessment_questions', { where: { assessment_id: assessmentId }, limit: 100 });
  if (!questions.length) throw badRequest('Assessment has no questions');
  let correct = 0;
  for (const question of questions) {
    const answer = answers.find((a) => a.question_id === question.id);
    if (answer && String(answer.answer).trim().toLowerCase() === String(question.correct_answer).trim().toLowerCase()) {
      correct += 1;
    }
  }
  const score = Math.round((correct / questions.length) * 100);
  const passed = score >= assessment.pass_score;
  const result = await db.insert('lms_assessment_results', {
    assessment_id: assessmentId,
    employee_id: user.id,
    score,
    passed,
    submitted_at: new Date().toISOString(),
  });
  if (passed) {
    const certs = await db.select('lms_certificates', { where: { course_id: assessment.course_id }, limit: 1 });
    if (certs.length) {
      const cert = certs[0];
      const expires = cert.valid_months ? new Date(Date.now() + cert.valid_months * 30 * 86400000).toISOString() : null;
      const existing = await db.select('lms_employee_certificates', { where: { certificate_id: cert.id, employee_id: user.id }, limit: 1 });
      if (!existing.length) {
        await db.insert('lms_employee_certificates', { certificate_id: cert.id, employee_id: user.id, expires_at: expires });
      }
    }
  }
  await recordAudit({ actorId: user.id, action: 'LMS_ASSESSMENT_SUBMITTED', entityType: 'lms_assessment', entityId: assessmentId, details: { score, passed }, req });
  return result;
};

export const listCertificates = async (user, query) => {
  const employeeId = query.employee_id ?? user.id;
  if (employeeId !== user.id && !(await canAccessEmployee(user, employeeId)) && !isHRAdmin(user)) {
    throw forbidden('Out of scope');
  }
  const rows = await db.select('lms_employee_certificates', { where: { employee_id: employeeId }, limit: 200 });
  const certIds = [...new Set(rows.map((r) => r.certificate_id))];
  const certs = certIds.length ? await db.select('lms_certificates', { where: { id: { in: certIds } }, limit: certIds.length }) : [];
  const courses = certs.length ? await db.select('lms_courses', { where: { id: { in: certs.map((c) => c.course_id) } }, limit: certs.length }) : [];
  const certMap = new Map(certs.map((c) => [c.id, c]));
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  return rows.map((row) => {
    const cert = certMap.get(row.certificate_id);
    return {
      ...row,
      certificate_name: cert?.name ?? 'Certificate',
      course_title: courseMap.get(cert?.course_id)?.title ?? '',
    };
  });
};
