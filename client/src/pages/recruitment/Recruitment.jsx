import { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, CalendarClock, Check, Copy, ExternalLink, Plus, Send, X } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api.js';
import useApiResource from '../../hooks/useApiResource.js';
import useEmployees from '../../hooks/useEmployees.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import DetailList from '../../components/ui/DetailList.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { currency, formatDate, formatDateTime, todayISO } from '../../lib/format.js';

const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Internship'];
const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected', 'Withdrawn'];
const INTERVIEW_MODES = ['Video', 'Phone', 'Onsite'];
const INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Cancelled', 'No Show'];

function Actions({ children }) {
  return <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">{children}</div>;
}

function RequisitionForm({ departments, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', department: departments[0] ?? '', position_count: 1, employment_type: 'Full Time', budget: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/recruitment/requisitions', {
        ...form,
        position_count: Number(form.position_count),
        budget: form.budget === '' ? undefined : Number(form.budget),
      });
      toast.success('Requisition submitted for approval');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Role title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </Select>
        <Input label="Positions" type="number" min="1" max="500" required value={form.position_count} onChange={(e) => setForm({ ...form, position_count: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Employment type" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
          {EMPLOYMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </Select>
        <Input label="Budget (INR)" type="number" min="0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
      </div>
      <Textarea label="Description" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Approval is two-step: department manager, then Admin. HR can raise requisitions but cannot approve them.</p>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Submit requisition</Button></Actions>
    </form>
  );
}

function RequisitionDetail({ id, onClose, onDecision, onRefresh, canApprove }) {
  const [requisition, setRequisition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/recruitment/requisitions/${id}`)
      .then((response) => { if (active) setRequisition(response.data); })
      .catch((err) => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, onRefresh]);

  return (
    <Modal open onClose={onClose} title="Requisition detail" size="lg">
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading requisition…</p> : error ? <ErrorState error={error} /> : requisition ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">{requisition.title}</h3>
              <p className="text-xs text-slate-500">{requisition.department} · {requisition.position_count} position(s) · {requisition.employment_type}</p>
            </div>
            <Badge>{requisition.status}</Badge>
          </div>
          <DetailList items={[
            { label: 'Requester', value: requisition.requester_name },
            { label: 'Budget', value: currency(requisition.budget) },
            { label: 'Created', value: formatDateTime(requisition.created_at) },
            { label: 'Approved', value: requisition.approved_at ? formatDateTime(requisition.approved_at) : '—' },
          ]} />
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Description</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{requisition.description || 'No description provided.'}</p>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Approval trail</p>
            {requisition.approvals?.length ? (
              <div className="space-y-2">
                {requisition.approvals.map((approval) => (
                  <div key={approval.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-slate-800">{approval.step} step · {approval.approver_name}</p>
                      <p className="text-[11px] text-slate-500">{formatDateTime(approval.created_at)}{approval.reason ? ` · ${approval.reason}` : ''}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {approval.is_escalation ? <Badge tone="amber">Escalated</Badge> : null}
                      {approval.is_self_approval ? <Badge tone="red">Self-approved</Badge> : null}
                      <Badge>{approval.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">No approval decisions recorded yet.</p>}
          </div>
          <Actions>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {canApprove && requisition.status === 'Pending Manager' ? (
              <>
                <Button variant="danger" icon={X} onClick={() => onDecision(requisition, 'Manager', 'Rejected')}>Reject</Button>
                <Button icon={Check} onClick={() => onDecision(requisition, 'Manager', 'Approved')}>Manager approval</Button>
              </>
            ) : null}
            {canApprove && requisition.status === 'Pending Admin' ? (
              <>
                <Button variant="danger" icon={X} onClick={() => onDecision(requisition, 'Admin', 'Rejected')}>Reject</Button>
                <Button icon={Check} onClick={() => onDecision(requisition, 'Admin', 'Approved')}>Admin approval</Button>
              </>
            ) : null}
          </Actions>
        </div>
      ) : null}
    </Modal>
  );
}

function DecisionForm({ context, onClose, onSaved }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/recruitment/requisitions/${context.requisition.id}/approve`, {
        step: context.step,
        decision: context.decision,
        reason: reason || undefined,
      });
      toast.success(`Requisition ${context.decision.toLowerCase()}`);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{context.requisition.title}</p>
        <p>{context.step} step · {context.decision}</p>
      </div>
      <Textarea label={context.decision === 'Rejected' ? 'Rejection reason' : 'Approval note (optional)'} required={context.decision === 'Rejected'} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      <p className="text-[11px] text-slate-500">The server validates that you are eligible for this step and that you did not raise the requisition. HR approval is not permitted.</p>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant={context.decision === 'Rejected' ? 'danger' : 'primary'} loading={saving}>{context.decision === 'Rejected' ? 'Reject requisition' : 'Approve requisition'}</Button></Actions>
    </form>
  );
}

function CandidateForm({ requisitions, onClose, onSaved }) {
  const toast = useToast();
  const approved = requisitions.filter((requisition) => requisition.status === 'Approved');
  const [form, setForm] = useState({ requisition_id: approved[0]?.id ?? '', full_name: '', email: '', phone: '', resume_url: '', source: 'Direct' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/recruitment/candidates', { ...form, phone: form.phone || undefined, resume_url: form.resume_url || undefined });
      toast.success('Candidate added');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  if (!approved.length) {
    return (
      <div className="space-y-3">
        <EmptyState title="No approved requisitions" description="Candidates can only be added to requisitions that have completed both approval steps." />
        <Actions><Button variant="secondary" onClick={onClose}>Close</Button></Actions>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Requisition" required value={form.requisition_id} onChange={(e) => setForm({ ...form, requisition_id: e.target.value })}>
        {approved.map((requisition) => <option key={requisition.id} value={requisition.id}>{requisition.title} · {requisition.department}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
      </div>
      <Input label="Resume URL" type="url" value={form.resume_url} onChange={(e) => setForm({ ...form, resume_url: e.target.value })} placeholder="https://…" />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Add candidate</Button></Actions>
    </form>
  );
}

function CandidateDetail({ candidate, canManageHiring, onClose, onUpdated, onSchedule, onOffer }) {
  const toast = useToast();
  const [form, setForm] = useState({ stage: candidate.stage, phone: candidate.phone ?? '', resume_url: candidate.resume_url ?? '', notes: candidate.notes ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`/recruitment/candidates/${candidate.id}`, {
        stage: form.stage,
        status: form.stage === 'Hired' ? 'Hired' : form.stage === 'Rejected' ? 'Rejected' : form.stage === 'Withdrawn' ? 'Withdrawn' : 'Active',
        phone: form.phone || undefined,
        resume_url: form.resume_url || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Candidate updated');
      onUpdated();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Candidate detail" size="lg" footer={(
      <>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button variant="secondary" icon={CalendarClock} onClick={() => onSchedule(candidate)}>Schedule interview</Button>
        {canManageHiring ? <Button icon={Send} onClick={() => onOffer(candidate)}>Create offer</Button> : null}
      </>
    )}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{candidate.full_name}</h3>
            <p className="text-xs text-slate-500">{candidate.email} · {candidate.requisition_title}</p>
          </div>
          <Badge>{candidate.stage}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Stage" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
            {STAGES.filter((stage) => canManageHiring || stage !== 'Hired').map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </Select>
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <Input label="Resume URL" type="url" value={form.resume_url} onChange={(e) => setForm({ ...form, resume_url: e.target.value })} />
        <Textarea label="Notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <DetailList items={[
          { label: 'Source', value: candidate.source },
          { label: 'Applied', value: formatDate(candidate.created_at) },
          { label: 'Status', value: candidate.status },
        ]} />
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
        <Actions><Button type="submit" loading={saving}>Save candidate</Button></Actions>
      </form>
    </Modal>
  );
}

function InterviewForm({ candidate, candidates, employees, onClose, onSaved }) {
  const toast = useToast();
  const candidateOptions = candidate ? [candidate] : candidates.filter((item) => !['Rejected', 'Withdrawn'].includes(item.stage));
  const [form, setForm] = useState({
    candidate_id: candidate?.id ?? candidateOptions[0]?.id ?? '',
    interviewer_id: employees[0]?.id ?? '',
    scheduled_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    mode: 'Video',
    location: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/recruitment/interviews', { ...form, location: form.location || undefined });
      toast.success('Interview scheduled');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Candidate" required value={form.candidate_id} onChange={(e) => setForm({ ...form, candidate_id: e.target.value })}>
        <option value="">Select candidate</option>
        {candidateOptions.map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.requisition_title ?? item.email}</option>)}
      </Select>
      <Select label="Interviewer" required value={form.interviewer_id} onChange={(e) => setForm({ ...form, interviewer_id: e.target.value })}>
        <option value="">Select interviewer</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.designation}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Scheduled at" type="datetime-local" required value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
        <Select label="Mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
          {INTERVIEW_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </Select>
      </div>
      <Input label="Location / meeting link" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Schedule interview</Button></Actions>
    </form>
  );
}

function InterviewUpdate({ interview, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ status: interview.status, feedback: interview.feedback ?? '', rating: interview.rating ?? '', location: interview.location ?? '', scheduled_at: interview.scheduled_at?.slice(0, 16) ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`/recruitment/interviews/${interview.id}`, {
        status: form.status,
        feedback: form.feedback || undefined,
        rating: form.rating === '' ? undefined : Number(form.rating),
        location: form.location || undefined,
        scheduled_at: form.scheduled_at || undefined,
      });
      toast.success('Interview updated');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{interview.candidate_name}</p>
        <p>Interviewer: {interview.interviewer_name ?? '—'} · {formatDateTime(interview.scheduled_at)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {INTERVIEW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
        <Input label="Rating (1–5)" type="number" min="1" max="5" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
      </div>
      <Input label="Scheduled at" type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
      <Input label="Location / meeting link" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      <Textarea label="Feedback" rows={4} value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Save interview</Button></Actions>
    </form>
  );
}

function OfferForm({ candidate, candidates, onClose, onSaved }) {
  const toast = useToast();
  const options = candidates.filter((item) => !['Rejected', 'Withdrawn', 'Hired'].includes(item.stage));
  const [form, setForm] = useState({ candidate_id: candidate?.id ?? options[0]?.id ?? '', designation: '', salary: '', currency: 'INR', joining_date: todayISO() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/recruitment/offers', { ...form, salary: Number(form.salary) });
      toast.success('Offer draft created');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  if (!options.length) {
    return <div><EmptyState title="No eligible candidates" description="Add active candidates to an approved requisition first." /><Actions><Button variant="secondary" onClick={onClose}>Close</Button></Actions></div>;
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Candidate" required value={form.candidate_id} onChange={(e) => setForm({ ...form, candidate_id: e.target.value })}>
        {options.map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.requisition_title}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Designation" required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
        <Input label="Annual salary" type="number" min="1" required value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          {['INR', 'USD', 'EUR', 'GBP'].map((code) => <option key={code} value={code}>{code}</option>)}
        </Select>
        <Input label="Joining date" type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Create offer draft</Button></Actions>
    </form>
  );
}

function OpeningForm({ requisitions, onClose, onSaved }) {
  const toast = useToast();
  const approved = requisitions.filter((requisition) => requisition.status === 'Approved');
  const [form, setForm] = useState({ requisition_id: approved[0]?.id ?? '', title: '', location: 'Remote' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/recruitment/openings', { ...form, title: form.title || undefined });
      toast.success('Job opening published');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  if (!approved.length) return <div><EmptyState title="No approved requisitions" description="Publish openings only after both approval steps complete." /><Actions><Button variant="secondary" onClick={onClose}>Close</Button></Actions></div>;

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Approved requisition" required value={form.requisition_id} onChange={(e) => setForm({ ...form, requisition_id: e.target.value })}>
        {approved.map((requisition) => <option key={requisition.id} value={requisition.id}>{requisition.title} · {requisition.department}</option>)}
      </Select>
      <Input label="Opening title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Defaults to requisition title" />
      <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Publish opening</Button></Actions>
    </form>
  );
}

export default function Recruitment() {
  const { user, isHRAdmin, isAdmin, isManager } = useAuth();
  const toast = useToast();
  const { employees } = useEmployees();
  const [tab, setTab] = useState('requisitions');
  const [modal, setModal] = useState(null);
  const [decision, setDecision] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [requisitionFilter, setRequisitionFilter] = useState('');
  const [issuedLinks, setIssuedLinks] = useState({});

  const requisitionsLoader = useCallback(() => api.get('/recruitment/requisitions').then((r) => r.data), []);
  const candidatesLoader = useCallback(() => api.get('/recruitment/candidates', { params: { requisition_id: requisitionFilter || undefined } }).then((r) => r.data), [requisitionFilter]);
  const interviewsLoader = useCallback(() => api.get('/recruitment/interviews').then((r) => r.data), []);
  const offersLoader = useCallback(() => api.get('/recruitment/offers').then((r) => r.data), []);
  const openingsLoader = useCallback(() => api.get('/recruitment/openings').then((r) => r.data), []);

  const requisitions = useApiResource(requisitionsLoader, [requisitionsLoader]);
  const candidates = useApiResource(candidatesLoader, [candidatesLoader], { immediate: tab === 'candidates' || modal?.type === 'interview' || modal?.type === 'offer' });
  const interviews = useApiResource(interviewsLoader, [interviewsLoader], { immediate: tab === 'interviews' });
  const offers = useApiResource(offersLoader, [offersLoader], { immediate: isHRAdmin && tab === 'offers' });
  const openings = useApiResource(openingsLoader, [openingsLoader], { immediate: tab === 'openings' });

  const departments = useMemo(() => [...new Set(employees.map((employee) => employee.department))].sort(), [employees]);
  const requisitionList = requisitions.data ?? [];
  const candidateList = candidates.data ?? [];
  const interviewList = interviews.data ?? [];
  const offerList = offers.data ?? [];

  useEffect(() => {
    if (tab === 'candidates') candidates.reload();
  }, [requisitionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshRequisitions = () => { requisitions.reload(); candidates.reload(); openings.reload(); };

  const issueOffer = async (offer) => {
    setSaving(true);
    try {
      const response = await api.post(`/recruitment/offers/${offer.id}/issue`);
      const link = response.data.offer_link;
      const token = link?.split('/').pop();
      setIssuedLinks((current) => ({ ...current, [offer.id]: token ? `${window.location.origin}/offer/${token}` : link }));
      toast.success('Offer issued to candidate');
      offers.reload();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const revokeOffer = async () => {
    if (!confirm?.offer) return;
    setSaving(true);
    try {
      await api.post(`/recruitment/offers/${confirm.offer.id}/revoke`);
      toast.success('Offer revoked');
      setConfirm(null);
      offers.reload();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const copyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Offer link copied');
    } catch {
      toast.info(link);
    }
  };

  const updateOpening = async (opening, status) => {
    setSaving(true);
    try {
      await api.patch(`/recruitment/openings/${opening.id}`, { status });
      toast.success(`Opening marked ${status.toLowerCase()}`);
      openings.reload();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const requisitionColumns = [
    { key: 'title', header: 'Role', render: (row) => <div><p className="font-medium text-slate-900">{row.title}</p><p className="text-[11px] text-slate-500">{row.department} · {row.employment_type}</p></div> },
    { key: 'position_count', header: 'Positions' },
    { key: 'budget', header: 'Budget', render: (row) => currency(row.budget) },
    { key: 'requester_name', header: 'Raised by' },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    { key: 'created_at', header: 'Created', render: (row) => formatDate(row.created_at) },
  ];

  const candidateColumns = [
    { key: 'full_name', header: 'Candidate', render: (row) => <div><p className="font-medium text-slate-900">{row.full_name}</p><p className="text-[11px] text-slate-500">{row.email}</p></div> },
    { key: 'requisition_title', header: 'Requisition' },
    { key: 'stage', header: 'Stage', render: (row) => <Badge>{row.stage}</Badge> },
    { key: 'source', header: 'Source' },
    { key: 'created_at', header: 'Added', render: (row) => formatDate(row.created_at) },
  ];

  const interviewColumns = [
    { key: 'candidate_name', header: 'Candidate' },
    { key: 'interviewer_name', header: 'Interviewer', render: (row) => row.interviewer_name ?? '—' },
    { key: 'scheduled_at', header: 'Scheduled', render: (row) => formatDateTime(row.scheduled_at) },
    { key: 'mode', header: 'Mode' },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    { key: 'rating', header: 'Rating', render: (row) => row.rating ? `${row.rating} / 5` : '—' },
  ];

  const offerColumns = [
    { key: 'candidate_name', header: 'Candidate', render: (row) => <div><p className="font-medium text-slate-900">{row.candidate_name}</p><p className="text-[11px] text-slate-500">{row.candidate_email}</p></div> },
    { key: 'designation', header: 'Designation' },
    { key: 'salary', header: 'Salary', render: (row) => currency(row.salary, row.currency) },
    { key: 'joining_date', header: 'Joining', render: (row) => formatDate(row.joining_date) },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    { key: 'expires_at', header: 'Expires', render: (row) => formatDateTime(row.expires_at) },
  ];

  const openingColumns = [
    { key: 'title', header: 'Opening', render: (row) => <div><p className="font-medium text-slate-900">{row.title}</p><p className="text-[11px] text-slate-500">{row.department} · {row.location}</p></div> },
    { key: 'employment_type', header: 'Type' },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    { key: 'posted_at', header: 'Posted', render: (row) => formatDate(row.posted_at) },
  ];

  const tabs = [
    { id: 'requisitions', label: 'Requisitions', count: requisitionList.length },
    { id: 'candidates', label: 'Candidates' },
    { id: 'interviews', label: 'Interviews' },
    ...(isHRAdmin ? [{ id: 'offers', label: 'Offers' }] : []),
    { id: 'openings', label: 'Openings' },
  ];

  return (
    <div>
      <PageHeader
        title="Recruitment"
        description="Raise requisitions, run approvals, move candidates through the pipeline and issue offers."
        actions={<Button icon={Plus} onClick={() => setModal({ type: 'requisition' })}>New requisition</Button>}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'requisitions' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Two-step approval: department manager, then Admin. HR can raise but cannot approve.</p>
            <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'requisition' })}>New</Button>
          </div>
          {requisitions.error ? <div className="p-4"><ErrorState error={requisitions.error} onRetry={requisitions.reload} /></div> : <DataTable columns={requisitionColumns} rows={requisitionList} loading={requisitions.loading} onRowClick={(row) => setDetailId(row.id)} emptyTitle="No requisitions" emptyDescription="Raise a hiring requisition to start the approval workflow." />}
        </Card>
      ) : null}

      {tab === 'candidates' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
            <Select value={requisitionFilter} onChange={(e) => setRequisitionFilter(e.target.value)} className="w-full sm:w-72">
              <option value="">All requisitions</option>
              {requisitionList.filter((item) => item.status === 'Approved').map((item) => <option key={item.id} value={item.id}>{item.title} · {item.department}</option>)}
            </Select>
            <Button className="ml-auto" size="sm" icon={Plus} onClick={() => setModal({ type: 'candidate' })}>Add candidate</Button>
          </div>
          {candidates.error ? <div className="p-4"><ErrorState error={candidates.error} onRetry={candidates.reload} /></div> : <DataTable columns={candidateColumns} rows={candidateList} loading={candidates.loading} onRowClick={setSelectedCandidate} emptyTitle="No candidates" emptyDescription="Add candidates to an approved requisition." />}
        </Card>
      ) : null}

      {tab === 'interviews' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Scheduled interviews across requisitions in your scope.</p>
            <Button size="sm" icon={CalendarClock} onClick={() => setModal({ type: 'interview' })}>Schedule interview</Button>
          </div>
          {interviews.error ? <div className="p-4"><ErrorState error={interviews.error} onRetry={interviews.reload} /></div> : <DataTable columns={interviewColumns} rows={interviewList} loading={interviews.loading} onRowClick={(row) => (isHRAdmin || row.interviewer_id === user?.id) ? setModal({ type: 'interview-update', item: row }) : null} emptyTitle="No interviews" emptyDescription="Schedule an interview from a candidate record." />}
        </Card>
      ) : null}

      {isHRAdmin && tab === 'offers' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Offer links are tokenised and expire after seven days. Candidate acceptance is recorded automatically.</p>
            <Button size="sm" icon={Send} onClick={() => setModal({ type: 'offer' })}>Create offer</Button>
          </div>
          {offers.error ? <div className="p-4"><ErrorState error={offers.error} onRetry={offers.reload} /></div> : (
            <>
              <DataTable columns={offerColumns} rows={offerList} loading={offers.loading} emptyTitle="No offers" emptyDescription="Create an offer for a candidate in the pipeline." />
              {offerList.length ? (
                <div className="space-y-2 border-t border-slate-100 p-4">
                  {offerList.map((offer) => (
                    <div key={offer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-slate-800">{offer.candidate_name} · {offer.designation}</p>
                        <p className="text-[11px] text-slate-500">{issuedLinks[offer.id] ? 'Offer link ready' : 'Issue the offer to generate a secure link'}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {issuedLinks[offer.id] ? (
                          <>
                            <Button size="sm" variant="ghost" icon={Copy} onClick={() => copyLink(issuedLinks[offer.id])}>Copy link</Button>
                            <a href={issuedLinks[offer.id]} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"><ExternalLink className="h-3.5 w-3.5" /> Preview</a>
                          </>
                        ) : null}
                        {!['Accepted', 'Revoked'].includes(offer.status) ? <Button size="sm" icon={Send} loading={saving} onClick={() => issueOffer(offer)}>{offer.status === 'Issued' ? 'Reissue' : 'Issue'}</Button> : null}
                        {offer.status !== 'Accepted' && offer.status !== 'Revoked' ? <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setConfirm({ offer })}>Revoke</Button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {tab === 'openings' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Published openings are generated from approved requisitions.</p>
            {isHRAdmin ? <Button size="sm" icon={BriefcaseBusiness} onClick={() => setModal({ type: 'opening' })}>Publish opening</Button> : null}
          </div>
          {openings.error ? <div className="p-4"><ErrorState error={openings.error} onRetry={openings.reload} /></div> : (
            <>
              <DataTable columns={openingColumns} rows={openings.data ?? []} loading={openings.loading} emptyTitle="No job openings" emptyDescription="Publish an approved requisition as a job opening." />
              {isHRAdmin && openings.data?.length ? (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
                  {openings.data.map((opening) => (
                    <div key={opening.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
                      <span className="text-slate-700">{opening.title}</span>
                      <select value={opening.status} onChange={(e) => updateOpening(opening, e.target.value)} className="rounded border border-slate-300 px-1.5 py-1 text-[11px]">
                        {['Open', 'Closed', 'On Hold'].map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      <Modal open={modal?.type === 'requisition'} onClose={() => setModal(null)} title="New hiring requisition" size="lg">
        <RequisitionForm departments={departments} onClose={() => setModal(null)} onSaved={() => { setModal(null); refreshRequisitions(); }} />
      </Modal>
      <Modal open={modal?.type === 'candidate'} onClose={() => setModal(null)} title="Add candidate" size="md">
        <CandidateForm requisitions={requisitionList} onClose={() => setModal(null)} onSaved={() => { setModal(null); candidates.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'interview'} onClose={() => setModal(null)} title="Schedule interview" size="md">
        <InterviewForm candidate={modal?.candidate} candidates={candidateList} employees={employees} onClose={() => setModal(null)} onSaved={() => { setModal(null); interviews.reload(); candidates.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'interview-update'} onClose={() => setModal(null)} title="Update interview" size="md">
        {modal?.item ? <InterviewUpdate interview={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); interviews.reload(); }} /> : null}
      </Modal>
      <Modal open={modal?.type === 'offer'} onClose={() => setModal(null)} title="Create offer" size="md">
        <OfferForm candidate={modal?.candidate} candidates={candidateList} onClose={() => setModal(null)} onSaved={() => { setModal(null); offers.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'opening'} onClose={() => setModal(null)} title="Publish job opening" size="md">
        <OpeningForm requisitions={requisitionList} onClose={() => setModal(null)} onSaved={() => { setModal(null); openings.reload(); }} />
      </Modal>

      {detailId ? (
        <RequisitionDetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onRefresh={requisitions.data}
          canApprove={user?.role !== 'HR'}
          onDecision={(requisition, step, decisionType) => { setDetailId(null); setDecision({ requisition, step, decision: decisionType }); }}
        />
      ) : null}

      <Modal open={Boolean(decision)} onClose={() => setDecision(null)} title="Requisition decision" size="sm">
        {decision ? <DecisionForm context={decision} onClose={() => setDecision(null)} onSaved={() => { setDecision(null); refreshRequisitions(); }} /> : null}
      </Modal>

      {selectedCandidate ? (
        <CandidateDetail
          candidate={selectedCandidate}
          canManageHiring={isHRAdmin}
          onClose={() => setSelectedCandidate(null)}
          onUpdated={() => { setSelectedCandidate(null); candidates.reload(); }}
          onSchedule={(candidate) => { setSelectedCandidate(null); setModal({ type: 'interview', candidate }); }}
          onOffer={(candidate) => { setSelectedCandidate(null); setModal({ type: 'offer', candidate }); }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm?.offer)}
        onClose={() => setConfirm(null)}
        onConfirm={revokeOffer}
        title="Revoke offer"
        message={`Revoke the offer for ${confirm?.offer?.candidate_name}? The candidate's link will stop working immediately.`}
        confirmLabel="Revoke offer"
        loading={saving}
      />

      {isManager && !isAdmin ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Managers see requisitions and candidates for their department only. You cannot approve your own requisition.</p>
      ) : null}
    </div>
  );
}
