import crypto from 'node:crypto';
import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors.js';
import { isAdmin, isHRAdmin, isManager } from '../../utils/roles.js';
import { recordAudit } from '../../utils/audit.js';

const now = () => new Date().toISOString();

const enrichRequisitions = async (rows) => {
  const requesterIds = [...new Set(rows.map((row) => row.requester_id).filter(Boolean))];
  const requesters = requesterIds.length
    ? await db.select('employees', { where: { id: { in: requesterIds } }, limit: requesterIds.length })
    : [];
  const map = new Map(requesters.map((employee) => [employee.id, employee.full_name]));
  return rows.map((row) => ({ ...row, requester_name: map.get(row.requester_id) ?? 'Unknown' }));
};

export const listRequisitions = async (user, query) => {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.department) where.department = query.department;
  let rows = await db.select('job_requisitions', { where, order: { column: 'created_at', ascending: false }, limit: 1000 });
  if (isManager(user) && !isHRAdmin(user)) {
    rows = rows.filter((row) => row.department === user.department || row.requester_id === user.id);
  }
  return enrichRequisitions(rows);
};

export const getRequisition = async (user, id) => {
  const requisition = await db.findById('job_requisitions', id);
  if (!requisition) throw notFound('Requisition not found');
  if (isManager(user) && !isHRAdmin(user) && requisition.department !== user.department && requisition.requester_id !== user.id) {
    throw forbidden('You do not have access to this requisition');
  }
  const approvals = await db.select('requisition_approvals', {
    where: { requisition_id: id },
    order: { column: 'created_at', ascending: true },
    limit: 50,
  });
  const approverIds = [...new Set(approvals.map((approval) => approval.approver_id).filter(Boolean))];
  const approvers = approverIds.length
    ? await db.select('employees', { where: { id: { in: approverIds } }, limit: approverIds.length })
    : [];
  const approverMap = new Map(approvers.map((employee) => [employee.id, employee.full_name]));
  const [enriched] = await enrichRequisitions([requisition]);
  return {
    ...enriched,
    approvals: approvals.map((approval) => ({ ...approval, approver_name: approverMap.get(approval.approver_id) ?? 'Unknown' })),
  };
};

export const createRequisition = async (user, payload, req) => {
  if (![ 'Admin', 'HR', 'Manager' ].includes(user.role)) throw forbidden('You cannot raise hiring requisitions');
  const requisition = await db.insert('job_requisitions', {
    title: payload.title,
    department: payload.department,
    position_count: payload.position_count,
    employment_type: payload.employment_type ?? 'Full Time',
    budget: payload.budget ?? null,
    description: payload.description ?? '',
    status: 'Pending Manager',
    requester_id: user.id,
  });
  await recordAudit({
    actorId: user.id,
    action: 'REQUISITION_CREATED',
    entityType: 'job_requisition',
    entityId: requisition.id,
    details: { title: requisition.title, department: requisition.department },
    req,
  });
  return enrichRequisitions([requisition]).then(([row]) => row);
};

const eligibleManagers = async (requisition) => {
  const managers = await db.select('employees', {
    where: { department: requisition.department, role: 'Manager', is_active: true },
    limit: 500,
  });
  return managers.filter((manager) => manager.id !== requisition.requester_id);
};

const otherAdmins = async (requesterId) => {
  const admins = await db.select('employees', { where: { role: 'Admin', is_active: true }, limit: 500 });
  return admins.filter((admin) => admin.id !== requesterId);
};

const addApproval = async (requisitionId, payload) => {
  return db.insert('requisition_approvals', {
    requisition_id: requisitionId,
    approver_id: payload.approverId,
    step: payload.step,
    status: payload.status,
    is_escalation: payload.isEscalation ?? false,
    is_self_approval: payload.isSelfApproval ?? false,
    reason: payload.reason ?? null,
  });
};

/**
 * Two-step approval: department manager (or Admin escalation when no eligible
 * manager exists) followed by an Admin/executive. HR can raise but never
 * approve. Requester self-approval is rejected except the documented
 * sole-Admin last-resort case. All checks fail closed.
 */
export const decideRequisition = async (user, id, step, decision, reason, req) => {
  const requisition = await db.findById('job_requisitions', id);
  if (!requisition) throw notFound('Requisition not found');
  if (['Approved', 'Rejected', 'Closed'].includes(requisition.status)) {
    throw conflict('This requisition has already been finalized');
  }
  if (step === 'Manager' && requisition.status !== 'Pending Manager') {
    throw conflict('The department manager step is no longer open');
  }
  if (step === 'Admin' && requisition.status !== 'Pending Admin') {
    throw conflict('The Admin approval step is not open yet');
  }
  if (user.role === 'HR') throw forbidden('HR can raise requisitions but cannot approve them');

  const isRequester = user.id === requisition.requester_id;
  const managers = await eligibleManagers(requisition);
  const admins = await otherAdmins(requisition.requester_id);
  const soleAdmin = isAdmin(user) && isRequester && admins.length === 0 && managers.length === 0;

  if (step === 'Manager') {
    if (decision === 'Rejected') {
      const managerApprover = user.role === 'Manager' && managers.some((manager) => manager.id === user.id);
      const escalationReject = user.role === 'Admin' && managers.length === 0 && !isRequester;
      if (!managerApprover && !escalationReject) {
        if (isRequester) throw forbidden('You raised this requisition, so you cannot reject it');
        throw forbidden(`This requisition is for ${requisition.department}. Only a manager of that department can reject it.`);
      }
      await addApproval(id, { approverId: user.id, step, status: 'Rejected', isEscalation: escalationReject, reason });
      await db.update('job_requisitions', { id }, { status: 'Rejected', decision_reason: reason ?? null });
      await recordAudit({ actorId: user.id, action: 'REQUISITION_REJECTED', entityType: 'job_requisition', entityId: id, details: { step, reason }, req });
      return getRequisition(user, id);
    }

    if (managers.length > 0) {
      const isDepartmentManager = user.role === 'Manager' && managers.some((manager) => manager.id === user.id);
      if (!isDepartmentManager) {
        if (user.role === 'Admin') {
          throw forbidden('The requisition cannot be escalated because an eligible department manager exists.');
        }
        throw forbidden(`This requisition is for ${requisition.department}. Only a manager of that department can approve it.`);
      }
      if (isRequester) throw forbidden('You raised this requisition, so you cannot approve it.');
      await addApproval(id, { approverId: user.id, step, status: 'Approved' });
    } else {
      if (user.role !== 'Admin') {
        throw forbidden('Only an Admin can escalate the manager step when the department has no eligible manager.');
      }
      if (isRequester && !soleAdmin) {
        throw forbidden('You raised this requisition, so you cannot approve it.');
      }
      await addApproval(id, {
        approverId: user.id,
        step,
        status: 'Approved',
        isEscalation: true,
        isSelfApproval: isRequester,
        reason: reason ?? (isRequester ? 'Sole Admin self-approval: department has no manager and no other Admin exists' : 'Department has no eligible manager'),
      });
    }
    await db.update('job_requisitions', { id }, { status: 'Pending Admin' });
    await recordAudit({
      actorId: user.id,
      action: 'REQUISITION_MANAGER_APPROVED',
      entityType: 'job_requisition',
      entityId: id,
      details: { escalated: managers.length === 0, self_approved: isRequester },
      req,
    });
    return getRequisition(user, id);
  }

  if (step === 'Admin') {
    if (user.role !== 'Admin') throw forbidden('Only an Admin or executive can approve this step');
    if (isRequester && !soleAdmin) throw forbidden('You raised this requisition, so you cannot approve it.');
    if (decision === 'Rejected') {
      await addApproval(id, { approverId: user.id, step, status: 'Rejected', reason });
      await db.update('job_requisitions', { id }, { status: 'Rejected', decision_reason: reason ?? null });
      await recordAudit({ actorId: user.id, action: 'REQUISITION_REJECTED', entityType: 'job_requisition', entityId: id, details: { step, reason }, req });
      return getRequisition(user, id);
    }
    await addApproval(id, {
      approverId: user.id,
      step,
      status: 'Approved',
      isSelfApproval: isRequester,
      reason: isRequester ? reason ?? 'Sole Admin self-approval: department has no manager and no other Admin exists' : reason,
    });
    await db.update('job_requisitions', { id }, { status: 'Approved', approved_at: now() });
    await recordAudit({
      actorId: user.id,
      action: 'REQUISITION_APPROVED',
      entityType: 'job_requisition',
      entityId: id,
      details: { self_approved: isRequester },
      req,
    });
    return getRequisition(user, id);
  }

  throw badRequest('Approval step must be Manager or Admin');
};

export const accessibleRequisitionIds = async (user) => {
  if (isHRAdmin(user)) return null;
  const rows = await db.select('job_requisitions', { limit: 5000 });
  return rows
    .filter((row) => row.department === user.department || row.requester_id === user.id)
    .map((row) => row.id);
};

const assertRequisitionAccess = async (user, requisitionId) => {
  const ids = await accessibleRequisitionIds(user);
  if (ids && !ids.includes(requisitionId)) throw forbidden('You do not have access to this requisition');
};

export const listCandidates = async (user, query) => {
  const ids = await accessibleRequisitionIds(user);
  const where = {};
  if (query.requisition_id) {
    await assertRequisitionAccess(user, query.requisition_id);
    where.requisition_id = query.requisition_id;
  } else if (ids) {
    where.requisition_id = { in: ids };
  }
  if (query.stage) where.stage = query.stage;
  const candidates = await db.select('candidates', { where, order: { column: 'created_at', ascending: false }, limit: 2000 });
  const reqIds = [...new Set(candidates.map((candidate) => candidate.requisition_id))];
  const requisitions = reqIds.length ? await db.select('job_requisitions', { where: { id: { in: reqIds } }, limit: reqIds.length }) : [];
  const reqMap = new Map(requisitions.map((row) => [row.id, row.title]));
  return candidates.map((candidate) => ({ ...candidate, requisition_title: reqMap.get(candidate.requisition_id) ?? 'Unknown' }));
};

export const createCandidate = async (user, payload, req) => {
  const requisition = await db.findById('job_requisitions', payload.requisition_id);
  if (!requisition) throw badRequest('Requisition not found');
  await assertRequisitionAccess(user, requisition.id);
  if (requisition.status !== 'Approved') throw forbidden('Candidates can only be added to approved requisitions');
  const duplicate = await db.select('candidates', {
    where: { requisition_id: requisition.id, email: payload.email.trim().toLowerCase() },
    limit: 1,
  });
  if (duplicate.length) throw conflict('A candidate with this email already exists for the requisition');
  const candidate = await db.insert('candidates', {
    requisition_id: requisition.id,
    full_name: payload.full_name,
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone ?? null,
    resume_url: payload.resume_url ?? null,
    stage: 'Applied',
    status: 'Active',
    source: payload.source ?? 'Direct',
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'CANDIDATE_CREATED', entityType: 'candidate', entityId: candidate.id, details: { requisition_id: requisition.id }, req });
  return candidate;
};

export const updateCandidate = async (user, id, payload, req) => {
  const candidate = await db.findById('candidates', id);
  if (!candidate) throw notFound('Candidate not found');
  await assertRequisitionAccess(user, candidate.requisition_id);
  if (payload.stage === 'Hired') {
    if (!isHRAdmin(user)) throw forbidden('Only Admin or HR can mark a candidate as hired');
  }
  const [updated] = await db.update('candidates', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'CANDIDATE_UPDATED', entityType: 'candidate', entityId: id, details: payload, req });
  return updated;
};

export const listInterviews = async (user, query) => {
  const ids = await accessibleRequisitionIds(user);
  const candidates = ids
    ? await db.select('candidates', { where: { requisition_id: { in: ids } }, limit: 5000 })
    : await db.select('candidates', { limit: 5000 });
  const candidateIds = candidates.map((candidate) => candidate.id);
  const where = candidateIds.length ? { candidate_id: { in: candidateIds } } : { candidate_id: '__none__' };
  if (query.candidate_id) {
    if (!candidateIds.includes(query.candidate_id)) throw forbidden('You do not have access to this candidate');
    where.candidate_id = query.candidate_id;
  }
  const interviews = await db.select('interviews', { where, order: { column: 'scheduled_at', ascending: true }, limit: 2000 });
  const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate.full_name]));
  const interviewerIds = [...new Set(interviews.map((interview) => interview.interviewer_id).filter(Boolean))];
  const interviewers = interviewerIds.length ? await db.select('employees', { where: { id: { in: interviewerIds } }, limit: interviewerIds.length }) : [];
  const interviewerMap = new Map(interviewers.map((employee) => [employee.id, employee.full_name]));
  return interviews.map((interview) => ({
    ...interview,
    candidate_name: candidateMap.get(interview.candidate_id) ?? 'Unknown candidate',
    interviewer_name: interview.interviewer_id ? interviewerMap.get(interview.interviewer_id) ?? null : null,
  }));
};

export const scheduleInterview = async (user, payload, req) => {
  const candidate = await db.findById('candidates', payload.candidate_id);
  if (!candidate) throw badRequest('Candidate not found');
  await assertRequisitionAccess(user, candidate.requisition_id);
  if (candidate.stage === 'Rejected' || candidate.stage === 'Withdrawn') throw conflict('This candidate is no longer active');
  const interviewer = await db.findById('employees', payload.interviewer_id);
  if (!interviewer) throw badRequest('Interviewer not found');
  const interview = await db.insert('interviews', {
    candidate_id: candidate.id,
    interviewer_id: payload.interviewer_id,
    scheduled_at: payload.scheduled_at,
    mode: payload.mode ?? 'Video',
    location: payload.location ?? null,
    status: 'Scheduled',
    feedback: null,
    rating: null,
    created_by: user.id,
  });
  if (candidate.stage === 'Applied' || candidate.stage === 'Screening') {
    await db.update('candidates', { id: candidate.id }, { stage: 'Interview' });
  }
  await recordAudit({ actorId: user.id, action: 'INTERVIEW_SCHEDULED', entityType: 'interview', entityId: interview.id, details: payload, req });
  return interview;
};

export const updateInterview = async (user, id, payload, req) => {
  const interview = await db.findById('interviews', id);
  if (!interview) throw notFound('Interview not found');
  const candidate = await db.findById('candidates', interview.candidate_id);
  await assertRequisitionAccess(user, candidate.requisition_id);
  if (!isHRAdmin(user) && interview.interviewer_id !== user.id) {
    throw forbidden('Only the assigned interviewer, Admin or HR can update this interview');
  }
  const [updated] = await db.update('interviews', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'INTERVIEW_UPDATED', entityType: 'interview', entityId: id, details: { status: payload.status, rating: payload.rating }, req });
  return updated;
};

export const listOffers = async (user) => {
  if (!isHRAdmin(user)) throw forbidden('Offer management is restricted to Admin and HR');
  const offers = await db.select('offers', { order: { column: 'created_at', ascending: false }, limit: 1000 });
  const candidateIds = [...new Set(offers.map((offer) => offer.candidate_id))];
  const candidates = candidateIds.length ? await db.select('candidates', { where: { id: { in: candidateIds } }, limit: candidateIds.length }) : [];
  const map = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return offers.map(({ token, ...offer }) => ({
    ...offer,
    candidate_name: map.get(offer.candidate_id)?.full_name ?? 'Unknown candidate',
    candidate_email: map.get(offer.candidate_id)?.email ?? '',
  }));
};

export const createOffer = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can create offers');
  const candidate = await db.findById('candidates', payload.candidate_id);
  if (!candidate) throw badRequest('Candidate not found');
  if (['Rejected', 'Withdrawn'].includes(candidate.stage)) throw conflict('This candidate is no longer active');
  const offer = await db.insert('offers', {
    candidate_id: candidate.id,
    designation: payload.designation,
    salary: Number(payload.salary),
    currency: payload.currency ?? 'INR',
    joining_date: payload.joining_date ?? null,
    status: 'Draft',
    token: null,
    expires_at: null,
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'OFFER_CREATED', entityType: 'offer', entityId: offer.id, details: { candidate_id: candidate.id }, req });
  const { token, ...safe } = offer;
  return safe;
};

export const issueOffer = async (user, id, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can issue offers');
  const offer = await db.findById('offers', id);
  if (!offer) throw notFound('Offer not found');
  if (offer.status === 'Accepted' || offer.status === 'Revoked') throw conflict('This offer can no longer be issued');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const [updated] = await db.update('offers', { id }, {
    status: 'Issued',
    token,
    issued_at: now(),
    expires_at: expiresAt,
  });
  await db.update('candidates', { id: offer.candidate_id }, { stage: 'Offer' });
  await recordAudit({ actorId: user.id, action: 'OFFER_ISSUED', entityType: 'offer', entityId: id, details: { expires_at: expiresAt }, req });
  const { token: _token, ...safe } = updated;
  return { ...safe, offer_link: `/api/v1/recruitment/public/offers/${token}` };
};

export const revokeOffer = async (user, id, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can revoke offers');
  const offer = await db.findById('offers', id);
  if (!offer) throw notFound('Offer not found');
  if (offer.status === 'Accepted') throw conflict('An accepted offer cannot be revoked');
  const [updated] = await db.update('offers', { id }, { status: 'Revoked', token: null, revoked_at: now() });
  await recordAudit({ actorId: user.id, action: 'OFFER_REVOKED', entityType: 'offer', entityId: id, req });
  const { token, ...safe } = updated;
  return safe;
};

export const publicOffer = async (token) => {
  const [offer] = await db.select('offers', { where: { token }, limit: 1 });
  if (!offer) throw notFound('Offer link is invalid');
  if (offer.status === 'Revoked' || offer.status === 'Draft') throw notFound('Offer link is no longer available');
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) throw forbidden('This offer link has expired');
  const candidate = await db.findById('candidates', offer.candidate_id);
  return {
    candidate_name: candidate?.full_name ?? 'Candidate',
    designation: offer.designation,
    salary: offer.salary,
    currency: offer.currency,
    joining_date: offer.joining_date,
    status: offer.status,
    expires_at: offer.expires_at,
  };
};

export const acceptOffer = async (token, req) => {
  const [offer] = await db.select('offers', { where: { token }, limit: 1 });
  if (!offer) throw notFound('Offer link is invalid');
  if (offer.status === 'Revoked') throw conflict('This offer has been revoked');
  if (offer.status === 'Accepted') throw conflict('This offer has already been accepted');
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) throw forbidden('This offer link has expired');
  const [updated] = await db.update('offers', { id: offer.id }, { status: 'Accepted', accepted_at: now() });
  await db.update('candidates', { id: offer.candidate_id }, { stage: 'Hired', status: 'Hired' });
  await recordAudit({
    actorId: null,
    action: 'OFFER_ACCEPTED',
    entityType: 'offer',
    entityId: offer.id,
    details: { candidate_id: offer.candidate_id },
    req,
  });
  return { status: updated.status, accepted_at: updated.accepted_at };
};

export const listOpenings = async (user) => {
  const where = {};
  let openings = await db.select('job_openings', { where, order: { column: 'created_at', ascending: false }, limit: 500 });
  if (isManager(user) && !isHRAdmin(user)) {
    openings = openings.filter((opening) => opening.department === user.department);
  }
  return openings;
};

export const createOpening = async (user, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can publish job openings');
  const requisition = await db.findById('job_requisitions', payload.requisition_id);
  if (!requisition) throw badRequest('Requisition not found');
  if (requisition.status !== 'Approved') throw forbidden('Only approved requisitions can be published');
  const opening = await db.insert('job_openings', {
    requisition_id: requisition.id,
    title: payload.title ?? requisition.title,
    department: requisition.department,
    location: payload.location ?? 'Remote',
    employment_type: requisition.employment_type,
    status: 'Open',
    posted_at: now(),
    created_by: user.id,
  });
  await recordAudit({ actorId: user.id, action: 'JOB_OPENING_CREATED', entityType: 'job_opening', entityId: opening.id, details: payload, req });
  return opening;
};

export const updateOpening = async (user, id, payload, req) => {
  if (!isHRAdmin(user)) throw forbidden('Only Admin and HR can manage job openings');
  const opening = await db.findById('job_openings', id);
  if (!opening) throw notFound('Job opening not found');
  const [updated] = await db.update('job_openings', { id }, payload);
  await recordAudit({ actorId: user.id, action: 'JOB_OPENING_UPDATED', entityType: 'job_opening', entityId: id, details: payload, req });
  return updated;
};
