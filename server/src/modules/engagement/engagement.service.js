import { db } from '../../db/index.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { isHRAdmin } from '../../utils/roles.js';
import { getAccessScope } from '../../utils/scope.js';
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

export const overview = async (user) => {
  const scope = await getAccessScope(user);
  const isAdminConsole = isHRAdmin(user);
  if (isAdminConsole) {
    const [surveys, feedback, wellness, recognition] = await Promise.all([
      db.select('engagement_surveys', { limit: 500 }),
      db.select('engagement_feedback', { limit: 5000 }),
      db.select('engagement_wellness_checkins', { limit: 5000 }),
      db.select('engagement_recognition', { limit: 5000 }),
    ]);
    const activeSurveys = surveys.filter((s) => s.status === 'Active').length;
    const pendingFeedback = feedback.filter((f) => f.status === 'Submitted').length;
    const avgMood = wellness.length
      ? Math.round((wellness.reduce((sum, w) => sum + w.mood_score, 0) / wellness.length) * 10) / 10
      : 0;
    const totalPoints = recognition.reduce((sum, r) => sum + (r.points || 0), 0);
    return { mode: 'admin', active_surveys: activeSurveys, pending_feedback: pendingFeedback, wellness_checkins: wellness.length, average_mood: avgMood, recognition_points: totalPoints };
  }
  const where = scope.all ? {} : { employee_id: { in: scope.ids } };
  const [assignments, myFeedback, myWellness, myRecognition] = await Promise.all([
    db.select('engagement_survey_assignments', { where: scope.all ? { employee_id: user.id } : where, limit: 500 }),
    db.select('engagement_feedback', { where: { employee_id: user.id }, limit: 200 }),
    db.select('engagement_wellness_checkins', { where: { employee_id: user.id }, order: { column: 'created_at', ascending: false }, limit: 30 }),
    db.select('engagement_recognition', { where: { employee_id: user.id }, limit: 200 }),
  ]);
  const pendingSurveys = assignments.filter((a) => a.status === 'Pending').length;
  const points = myRecognition.reduce((sum, r) => sum + (r.points || 0), 0);
  const latestMood = myWellness[0]?.mood_score ?? null;
  return { mode: 'self', pending_surveys: pendingSurveys, feedback_count: myFeedback.length, recognition_points: points, latest_mood: latestMood };
};

export const listSurveys = async (user, query) => {
  if (isHRAdmin(user)) {
    return db.select('engagement_surveys', {
      where: query.status ? { status: query.status } : {},
      order: { column: 'created_at', ascending: false },
      limit: 200,
    });
  }
  const assignments = await db.select('engagement_survey_assignments', {
    where: { employee_id: user.id },
    limit: 500,
  });
  const surveyIds = [...new Set(assignments.map((a) => a.survey_id))];
  if (!surveyIds.length) return [];
  const surveys = await db.select('engagement_surveys', { where: { id: { in: surveyIds }, status: 'Active' }, limit: surveyIds.length });
  return surveys.map((survey) => {
    const assignment = assignments.find((a) => a.survey_id === survey.id);
    return { ...survey, assignment_status: assignment?.status ?? 'Pending', assignment_id: assignment?.id };
  });
};

export const createSurvey = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can create surveys');
  const survey = await db.insert('engagement_surveys', {
    title: payload.title,
    description: payload.description ?? '',
    status: payload.status ?? 'Draft',
    start_date: payload.start_date ?? null,
    end_date: payload.end_date ?? null,
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_SURVEY_CREATED', entityType: 'engagement_survey', entityId: survey.id, details: { title: survey.title }, req });
  return survey;
};

export const updateSurvey = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage surveys');
  const survey = await db.findById('engagement_surveys', id);
  if (!survey) throw notFound('Survey not found');
  const [updated] = await db.update('engagement_surveys', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_SURVEY_UPDATED', entityType: 'engagement_survey', entityId: id, details: payload, req });
  return updated;
};

export const getSurveyWithQuestions = async (user, id) => {
  const survey = await db.findById('engagement_surveys', id);
  if (!survey) throw notFound('Survey not found');
  if (!isHRAdmin(user)) {
    const assignment = await db.select('engagement_survey_assignments', { where: { survey_id: id, employee_id: user.id }, limit: 1 });
    if (!assignment.length && survey.status !== 'Active') throw forbidden('You are not assigned to this survey');
  }
  const questions = await db.select('engagement_survey_questions', {
    where: { survey_id: id },
    order: { column: 'sort_order', ascending: true },
    limit: 100,
  });
  return { ...survey, questions };
};

export const addSurveyQuestion = async (user, surveyId, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can edit surveys');
  const survey = await db.findById('engagement_surveys', surveyId);
  if (!survey) throw notFound('Survey not found');
  const question = await db.insert('engagement_survey_questions', {
    survey_id: surveyId,
    question_text: payload.question_text,
    question_type: payload.question_type ?? 'Rating',
    options: payload.options ?? [],
    sort_order: payload.sort_order ?? 0,
  });
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_SURVEY_QUESTION_ADDED', entityType: 'engagement_survey', entityId: surveyId, req });
  return question;
};

export const assignSurvey = async (user, surveyId, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can assign surveys');
  const survey = await db.findById('engagement_surveys', surveyId);
  if (!survey) throw notFound('Survey not found');
  const employeeIds = payload.employee_ids ?? [];
  if (!employeeIds.length) throw badRequest('Select at least one employee');
  const rows = [];
  for (const employeeId of employeeIds) {
    const existing = await db.select('engagement_survey_assignments', { where: { survey_id: surveyId, employee_id: employeeId }, limit: 1 });
    if (!existing.length) {
      rows.push(await db.insert('engagement_survey_assignments', { survey_id: surveyId, employee_id: employeeId, status: 'Pending' }));
    }
  }
  if (payload.activate_survey && survey.status === 'Draft') {
    await db.update('engagement_surveys', { id: surveyId }, { status: 'Active' });
  }
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_SURVEY_ASSIGNED', entityType: 'engagement_survey', entityId: surveyId, details: { count: rows.length }, req });
  return rows;
};

export const submitSurveyResponses = async (user, assignmentId, responses, req) => {
  const assignment = await db.findById('engagement_survey_assignments', assignmentId);
  if (!assignment) throw notFound('Assignment not found');
  if (assignment.employee_id !== user.id) throw forbidden('You can only submit your own survey');
  if (assignment.status === 'Completed') throw badRequest('Survey already submitted');
  const questions = await db.select('engagement_survey_questions', { where: { survey_id: assignment.survey_id }, limit: 100 });
  const questionIds = new Set(questions.map((q) => q.id));
  for (const response of responses) {
    if (!questionIds.has(response.question_id)) throw badRequest('Invalid question');
    await db.insert('engagement_survey_responses', {
      assignment_id: assignmentId,
      question_id: response.question_id,
      answer_text: response.answer_text ?? null,
      answer_rating: response.answer_rating ?? null,
    });
  }
  await db.update('engagement_survey_assignments', { id: assignmentId }, { status: 'Completed', completed_at: new Date().toISOString() });
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_SURVEY_SUBMITTED', entityType: 'engagement_survey_assignment', entityId: assignmentId, req });
  return { success: true };
};

export const listFeedback = async (user, query) => {
  const scope = await getAccessScope(user);
  let where = {};
  if (isHRAdmin(user) && query.employee_id) where.employee_id = query.employee_id;
  else if (!isHRAdmin(user)) where.employee_id = user.id;
  else if (!scope.all) where.employee_id = { in: scope.ids };
  if (query.status) where.status = query.status;
  return employeeMap(await db.select('engagement_feedback', { where, order: { column: 'created_at', ascending: false }, limit: 500 }));
};

export const createFeedback = async (user, payload, req) => {
  const feedback = await db.insert('engagement_feedback', {
    employee_id: user.id,
    category: payload.category ?? 'General',
    message: payload.message,
    status: 'Submitted',
  });
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_FEEDBACK_SUBMITTED', entityType: 'engagement_feedback', entityId: feedback.id, req });
  return feedback;
};

export const updateFeedback = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can review feedback');
  const item = await db.findById('engagement_feedback', id);
  if (!item) throw notFound('Feedback not found');
  const patch = { ...payload };
  if (patch.status === 'Reviewed' || patch.status === 'Closed') {
    patch.reviewed_by = user.id;
    patch.reviewed_at = new Date().toISOString();
  }
  const [updated] = await db.update('engagement_feedback', { id }, patch);
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_FEEDBACK_UPDATED', entityType: 'engagement_feedback', entityId: id, details: patch, req });
  return updated;
};

export const listWellness = async (user, query) => {
  const scope = await getAccessScope(user);
  const employeeId = query.employee_id ?? user.id;
  if (!isHRAdmin(user) && employeeId !== user.id) throw forbidden('You can only view your own wellness data');
  if (!scope.all && !scope.ids.includes(employeeId)) throw forbidden('Out of scope');
  return db.select('engagement_wellness_checkins', {
    where: { employee_id: employeeId },
    order: { column: 'created_at', ascending: false },
    limit: 100,
  });
};

export const createWellnessCheckin = async (user, payload, req) => {
  const checkin = await db.insert('engagement_wellness_checkins', {
    employee_id: user.id,
    mood_score: payload.mood_score,
    stress_level: payload.stress_level ?? null,
    notes: payload.notes ?? '',
  });
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_WELLNESS_CHECKIN', entityType: 'engagement_wellness', entityId: checkin.id, req });
  return checkin;
};

export const listRecognition = async (user, query) => {
  const scope = await getAccessScope(user);
  let where = {};
  if (query.employee_id) {
    if (!scope.all && !scope.ids.includes(query.employee_id)) throw forbidden('Out of scope');
    where.employee_id = query.employee_id;
  } else if (!isHRAdmin(user)) where.employee_id = user.id;
  return employeeMap(await db.select('engagement_recognition', { where, order: { column: 'awarded_at', ascending: false }, limit: 500 }));
};

export const awardRecognition = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can award recognition');
  const employee = await db.findById('employees', payload.employee_id);
  if (!employee) throw badRequest('Employee not found');
  const row = await db.insert('engagement_recognition', {
    employee_id: payload.employee_id,
    points: payload.points ?? 0,
    badge: payload.badge ?? null,
    reason: payload.reason ?? '',
    awarded_by: user.id,
    awarded_at: new Date().toISOString(),
  });
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_RECOGNITION_AWARDED', entityType: 'engagement_recognition', entityId: row.id, req });
  return row;
};

export const listPulsePolls = async (user) => {
  const polls = await db.select('engagement_pulse_polls', {
    where: { status: 'Active' },
    order: { column: 'created_at', ascending: false },
    limit: 50,
  });
  const responses = await db.select('engagement_pulse_responses', { where: { employee_id: user.id }, limit: 500 });
  const responded = new Set(responses.map((r) => r.poll_id));
  return polls.map((poll) => ({ ...poll, has_responded: responded.has(poll.id) }));
};

export const createPulsePoll = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can create pulse polls');
  const poll = await db.insert('engagement_pulse_polls', {
    question: payload.question,
    status: payload.status ?? 'Active',
    closes_at: payload.closes_at ?? null,
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_PULSE_CREATED', entityType: 'engagement_pulse', entityId: poll.id, req });
  return poll;
};

export const respondPulse = async (user, pollId, response, req) => {
  const poll = await db.findById('engagement_pulse_polls', pollId);
  if (!poll || poll.status !== 'Active') throw notFound('Poll not available');
  const existing = await db.select('engagement_pulse_responses', { where: { poll_id: pollId, employee_id: user.id }, limit: 1 });
  if (existing.length) throw badRequest('You have already responded');
  const row = await db.insert('engagement_pulse_responses', { poll_id: pollId, employee_id: user.id, response });
  await recordAudit({ actorId: user.id, action: 'ENGAGEMENT_PULSE_RESPONSE', entityType: 'engagement_pulse', entityId: pollId, req });
  return row;
};

export const analytics = async (user) => {
  if (!isHRAdmin(user)) throw forbidden('Analytics are for Admin and HR only');
  const [surveys, assignments, feedback, wellness] = await Promise.all([
    db.select('engagement_surveys', { limit: 500 }),
    db.select('engagement_survey_assignments', { limit: 10000 }),
    db.select('engagement_feedback', { limit: 10000 }),
    db.select('engagement_wellness_checkins', { limit: 10000 }),
  ]);
  const completed = assignments.filter((a) => a.status === 'Completed').length;
  const moods = wellness.map((w) => w.mood_score);
  return {
    surveys_total: surveys.length,
    surveys_active: surveys.filter((s) => s.status === 'Active').length,
    survey_completion_rate: assignments.length ? Math.round((completed / assignments.length) * 100) : 0,
    feedback_by_status: Object.entries(feedback.reduce((acc, f) => { acc[f.status] = (acc[f.status] ?? 0) + 1; return acc; }, {})).map(([status, count]) => ({ status, count })),
    average_mood: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : 0,
    wellness_entries: wellness.length,
  };
};
