import { useCallback, useState } from 'react';
import {
  Award, BarChart3, CheckCircle2, MessageSquare, Plus, Target, TrendingUp, Users,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api.js';
import useApiResource from '../../hooks/useApiResource.js';
import useEmployees from '../../hooks/useEmployees.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { formatDate, todayISO } from '../../lib/format.js';

const CYCLE_STATUSES = ['Draft', 'Active', 'Closed'];
const GOAL_STATUSES = ['Not Started', 'In Progress', 'Completed', 'At Risk', 'Cancelled'];
const REVIEW_STATUSES = ['Draft', 'In Progress', 'Submitted', 'Acknowledged', 'Completed'];
const FEEDBACK_TYPES = ['Praise', 'Constructive', 'Peer', 'Manager'];
const VISIBILITY = ['Manager and HR', 'Employee and HR', 'Private'];
const PROFICIENCY = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

function CycleForm({ cycle, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: cycle?.name ?? '',
    period_start: cycle?.period_start?.slice(0, 10) ?? todayISO(),
    period_end: cycle?.period_end?.slice(0, 10) ?? todayISO(),
    status: cycle?.status ?? 'Active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (cycle) await api.patch(`/performance/cycles/${cycle.id}`, form);
      else await api.post('/performance/cycles', form);
      toast.success(cycle ? 'Review cycle updated' : 'Review cycle created');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Cycle name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. FY 2027 Annual Review" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Start date" type="date" required value={form.period_start} onChange={(event) => setForm({ ...form, period_start: event.target.value })} />
        <Input label="End date" type="date" required value={form.period_end} onChange={(event) => setForm({ ...form, period_end: event.target.value })} />
      </div>
      <Select label="Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
        {CYCLE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </Select>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{cycle ? 'Save cycle' : 'Create cycle'}</Button>
      </div>
    </form>
  );
}

function GoalForm({ cycles, canChooseEmployee, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const activeCycles = cycles.filter((cycle) => cycle.status === 'Active');
  const [form, setForm] = useState({
    employee_id: '',
    cycle_id: activeCycles[0]?.id ?? cycles[0]?.id ?? '',
    title: '',
    description: '',
    target: '',
    weightage: 20,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/performance/goals', {
        ...form,
        employee_id: form.employee_id || undefined,
        cycle_id: form.cycle_id || null,
        weightage: Number(form.weightage),
      });
      toast.success('Goal created');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {canChooseEmployee ? (
        <Select label="Employee" value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
          <option value="">Myself</option>
          {employees.filter((employee) => employee.id).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.department}</option>)}
        </Select>
      ) : <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">This goal will be created for you.</p>}
      <Select label="Review cycle" value={form.cycle_id} onChange={(event) => setForm({ ...form, cycle_id: event.target.value })}>
        <option value="">No cycle</option>
        {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name} · {cycle.status}</option>)}
      </Select>
      <Input label="Goal title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Improve release reliability" />
      <Textarea label="Description" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Target" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} placeholder="Measurable outcome" />
        <Input label="Weightage (%)" type="number" min="0" max="100" value={form.weightage} onChange={(event) => setForm({ ...form, weightage: event.target.value })} />
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Create goal</Button>
      </div>
    </form>
  );
}

function GoalUpdateForm({ goal, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ progress: goal.progress ?? 0, status: goal.status ?? 'Not Started' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/performance/goals/${goal.id}`, { progress: Number(form.progress), status: form.status });
      toast.success('Goal updated');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{goal.title}</p>
        <p>{goal.employee_name} · {goal.target || 'No target set'}</p>
      </div>
      <div>
        <Input label="Progress (%)" type="number" min="0" max="100" required value={form.progress} onChange={(event) => setForm({ ...form, progress: event.target.value })} />
        <div className="mt-2"><ProgressBar value={form.progress} /></div>
      </div>
      <Select label="Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
        {GOAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </Select>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Save progress</Button>
      </div>
    </form>
  );
}

function ReviewForm({ cycles, employees, currentUserId, onClose, onSaved }) {
  const toast = useToast();
  const activeCycles = cycles.filter((cycle) => cycle.status === 'Active');
  const [form, setForm] = useState({
    employee_id: '',
    cycle_id: activeCycles[0]?.id ?? cycles[0]?.id ?? '',
    rating: '',
    strengths: '',
    improvements: '',
    comments: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/performance/reviews', {
        ...form,
        rating: form.rating === '' ? undefined : Number(form.rating),
      });
      toast.success('Performance review created');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const choices = employees.filter((employee) => employee.id !== currentUserId);

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Employee" required value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
        <option value="">Select employee</option>
        {choices.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.department}</option>)}
      </Select>
      <Select label="Review cycle" required value={form.cycle_id} onChange={(event) => setForm({ ...form, cycle_id: event.target.value })}>
        <option value="">Select cycle</option>
        {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name} · {cycle.status}</option>)}
      </Select>
      <Input label="Rating (1–5, optional while drafting)" type="number" min="1" max="5" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} />
      <Textarea label="Strengths" rows={3} value={form.strengths} onChange={(event) => setForm({ ...form, strengths: event.target.value })} />
      <Textarea label="Areas for improvement" rows={3} value={form.improvements} onChange={(event) => setForm({ ...form, improvements: event.target.value })} />
      <Textarea label="Comments" rows={3} value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Create draft</Button>
      </div>
    </form>
  );
}

function ReviewUpdateForm({ review, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    rating: review.rating ?? '',
    strengths: review.strengths ?? '',
    improvements: review.improvements ?? '',
    comments: review.comments ?? '',
    status: review.status ?? 'Draft',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/performance/reviews/${review.id}`, {
        ...form,
        rating: form.rating === '' ? undefined : Number(form.rating),
      });
      toast.success('Performance review updated');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{review.employee_name} · {review.employee_code}</p>
        <p>{review.department}</p>
      </div>
      <Input label="Rating (1–5)" type="number" min="1" max="5" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} />
      <Textarea label="Strengths" rows={3} value={form.strengths} onChange={(event) => setForm({ ...form, strengths: event.target.value })} />
      <Textarea label="Areas for improvement" rows={3} value={form.improvements} onChange={(event) => setForm({ ...form, improvements: event.target.value })} />
      <Textarea label="Comments" rows={3} value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} />
      <Select label="Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
        {REVIEW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </Select>
      {form.status === 'Submitted' ? <p className="text-[11px] text-slate-500">A rating is required before a review can be submitted.</p> : null}
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Save review</Button>
      </div>
    </form>
  );
}

function FeedbackForm({ employees, currentUserId, onClose, onSaved }) {
  const toast = useToast();
  const choices = employees.filter((employee) => employee.id !== currentUserId);
  const [form, setForm] = useState({ employee_id: choices[0]?.id ?? '', type: 'Praise', message: '', visibility: 'Manager and HR' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/performance/feedback', form);
      toast.success('Feedback submitted');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!choices.length) {
    return (
      <div>
        <EmptyState title="No feedback recipients available" description="Feedback can be shared with colleagues in your authorised scope." />
        <div className="mt-3 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Employee" required value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
        {choices.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.department}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Feedback type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
          {FEEDBACK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </Select>
        <Select label="Visibility" value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })}>
          {VISIBILITY.map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </div>
      <Textarea label="Feedback" required rows={4} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Submit feedback</Button>
      </div>
    </form>
  );
}

function SkillForm({ skill, employees, currentUserId, canChooseEmployee, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    employee_id: skill?.employee_id ?? currentUserId,
    skill: skill?.skill ?? '',
    proficiency: skill?.proficiency ?? 'Intermediate',
    years_experience: skill?.years_experience ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, years_experience: Number(form.years_experience) };
      if (skill) await api.patch(`/performance/skills/${skill.id}`, payload);
      else await api.post('/performance/skills', payload);
      toast.success(skill ? 'Skill updated' : 'Skill added');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {canChooseEmployee ? (
        <Select label="Employee" required value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.department}</option>)}
        </Select>
      ) : <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">This skill will be added to your profile.</p>}
      <Input label="Skill" required value={form.skill} onChange={(event) => setForm({ ...form, skill: event.target.value })} placeholder="e.g. PostgreSQL" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Proficiency" value={form.proficiency} onChange={(event) => setForm({ ...form, proficiency: event.target.value })}>
          {PROFICIENCY.map((level) => <option key={level} value={level}>{level}</option>)}
        </Select>
        <Input label="Years of experience" type="number" min="0" max="60" value={form.years_experience} onChange={(event) => setForm({ ...form, years_experience: event.target.value })} />
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{skill ? 'Save skill' : 'Add skill'}</Button>
      </div>
    </form>
  );
}

export default function Performance() {
  const { user, isHRAdmin, isManager, isStaffAgent } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);
  const [acknowledge, setAcknowledge] = useState(null);
  const [saving, setSaving] = useState(false);
  const { employees } = useEmployees();

  const overviewLoader = useCallback(() => api.get('/performance/overview').then((response) => response.data), []);
  const cyclesLoader = useCallback(() => api.get('/performance/cycles').then((response) => response.data), []);
  const goalsLoader = useCallback(() => api.get('/performance/goals').then((response) => response.data), []);
  const reviewsLoader = useCallback(() => api.get('/performance/reviews').then((response) => response.data), []);
  const feedbackLoader = useCallback(() => api.get('/performance/feedback').then((response) => response.data), []);
  const skillsLoader = useCallback(() => api.get('/performance/skills').then((response) => response.data), []);
  const reportsLoader = useCallback(() => api.get('/performance/reports').then((response) => response.data), []);

  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const cycles = useApiResource(cyclesLoader, [cyclesLoader]);
  const goals = useApiResource(goalsLoader, [goalsLoader], { immediate: tab === 'goals' });
  const reviews = useApiResource(reviewsLoader, [reviewsLoader], { immediate: tab === 'reviews' });
  const feedback = useApiResource(feedbackLoader, [feedbackLoader], { immediate: tab === 'feedback' });
  const skills = useApiResource(skillsLoader, [skillsLoader], { immediate: tab === 'skills' });
  const reports = useApiResource(reportsLoader, [reportsLoader], { immediate: isStaffAgent && tab === 'reports' });

  const cycleList = cycles.data ?? [];
  const goalList = goals.data ?? [];
  const reviewList = reviews.data ?? [];
  const feedbackList = feedback.data ?? [];
  const skillList = skills.data ?? [];

  const canManageGoal = (goal) => isHRAdmin || goal.employee_id === user?.id || (isManager && goal.manager_id === user?.id);
  const canManageReview = (review) => isHRAdmin || review.reviewer_id === user?.id;
  const canAcknowledge = (review) => review.employee_id === user?.id && review.status === 'Submitted';
  const canManageSkill = (skill) => isHRAdmin || isManager || skill.employee_id === user?.id;

  const acknowledgeReview = async () => {
    if (!acknowledge) return;
    setSaving(true);
    try {
      await api.patch(`/performance/reviews/${acknowledge.id}`, { status: 'Acknowledged' });
      toast.success('Review acknowledged');
      setAcknowledge(null);
      reviews.reload();
      overview.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'cycles', label: 'Review cycles' },
    { id: 'goals', label: 'Goals' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'skills', label: 'Skills' },
    ...(isStaffAgent ? [{ id: 'reports', label: 'Reports' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Performance"
        description="Review cycles, goals, appraisals, feedback and skills across your authorised scope."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button icon={Target} onClick={() => setModal({ type: 'goal' })}>New goal</Button>
            {isStaffAgent ? <Button variant="secondary" icon={MessageSquare} onClick={() => setModal({ type: 'feedback' })}>Give feedback</Button> : null}
          </div>
        )}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' ? (
        overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Active cycles" value={overview.data?.active_cycles ?? 0} icon={BarChart3} />
              <StatCard label="Goals" value={overview.data?.total_goals ?? 0} hint={`${overview.data?.goal_completion ?? 0}% completed`} icon={Target} tone="blue" />
              <StatCard label="Open reviews" value={overview.data?.open_reviews ?? 0} hint={`${overview.data?.submitted_reviews ?? 0} submitted`} icon={Users} tone="amber" />
              <StatCard label="Average rating" value={overview.data?.average_rating ? `${overview.data.average_rating} / 5` : '—'} icon={Award} tone="purple" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card title="Goal completion" description="Across goals in your scope">
                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <p className="text-3xl font-semibold text-slate-900">{overview.data?.goal_completion ?? 0}%</p>
                    <p className="text-xs text-slate-500">{overview.data?.completed_goals ?? 0} of {overview.data?.total_goals ?? 0} goals</p>
                  </div>
                  <ProgressBar value={overview.data?.goal_completion ?? 0} />
                  <p className="text-xs leading-5 text-slate-500">Employees update progress on their own goals. Managers and HR can review and close goals within their reporting scope.</p>
                </div>
              </Card>
              <Card title="Feedback culture" description="Recognition and constructive input">
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="text-xs text-slate-600">Feedback entries</span>
                    <span className="text-sm font-semibold text-slate-900">{overview.data?.feedback_count ?? 0}</span>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">Feedback visibility is controlled by the sender. Private feedback is retained for audit and HR review only.</p>
                  <Button size="sm" variant="secondary" icon={MessageSquare} onClick={() => setModal({ type: 'feedback' })}>Give feedback</Button>
                </div>
              </Card>
            </div>
          </div>
        )
      ) : null}

      {tab === 'cycles' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Review cycles group goals and appraisals for a performance period.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'cycle' })}>New cycle</Button> : null}
          </div>
          {cycles.error ? <div className="p-4"><ErrorState error={cycles.error} onRetry={cycles.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'name', header: 'Cycle', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
                { key: 'period', header: 'Period', render: (row) => `${formatDate(row.period_start)} – ${formatDate(row.period_end)}` },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'created_at', header: 'Created', render: (row) => formatDate(row.created_at) },
                ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ type: 'cycle', item: row })}>Edit</Button></div> }] : []),
              ]}
              rows={cycleList}
              loading={cycles.loading}
              emptyTitle="No review cycles"
              emptyDescription="Admin or HR can create the first performance cycle."
            />
          )}
        </Card>
      ) : null}

      {tab === 'goals' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Goals are visible to the employee, their manager and HR.</p>
            <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'goal' })}>New goal</Button>
          </div>
          {goals.error ? <div className="p-4"><ErrorState error={goals.error} onRetry={goals.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'title', header: 'Goal', render: (row) => <div><p className="font-medium text-slate-900">{row.title}</p><p className="text-[11px] text-slate-500">{row.employee_name} · {row.employee_code}</p></div> },
                { key: 'target', header: 'Target', render: (row) => <span className="line-clamp-2 max-w-xs text-xs text-slate-500">{row.target || '—'}</span> },
                { key: 'weightage', header: 'Weight', render: (row) => `${row.weightage ?? 0}%` },
                { key: 'progress', header: 'Progress', render: (row) => <div className="w-32"><ProgressBar value={row.progress} label={`${row.progress ?? 0}%`} /></div> },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'actions', header: '', render: (row) => canManageGoal(row) ? <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ type: 'goal-update', item: row })}>Update</Button></div> : null },
              ]}
              rows={goalList}
              loading={goals.loading}
              emptyTitle="No goals"
              emptyDescription="Create a goal to start tracking progress."
            />
          )}
        </Card>
      ) : null}

      {tab === 'reviews' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Appraisal reviews move from draft to submitted, then employee acknowledgement.</p>
            {isStaffAgent ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'review' })}>New review</Button> : null}
          </div>
          {reviews.error ? <div className="p-4"><ErrorState error={reviews.error} onRetry={reviews.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code} · {row.department}</p></div> },
                { key: 'rating', header: 'Rating', render: (row) => row.rating ? <span className="font-medium text-slate-900">{row.rating} / 5</span> : '—' },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'submitted_at', header: 'Submitted', render: (row) => formatDate(row.submitted_at) },
                { key: 'comments', header: 'Comments', render: (row) => <span className="line-clamp-2 max-w-sm text-xs text-slate-500">{row.comments || row.strengths || '—'}</span> },
                {
                  key: 'actions',
                  header: '',
                  render: (row) => (
                    <div className="flex justify-end gap-1">
                      {canManageReview(row) ? <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'review-update', item: row })}>Edit</Button> : null}
                      {canAcknowledge(row) ? <Button size="sm" onClick={() => setAcknowledge(row)}>Acknowledge</Button> : null}
                    </div>
                  ),
                },
              ]}
              rows={reviewList}
              loading={reviews.loading}
              emptyTitle="No performance reviews"
              emptyDescription={isStaffAgent ? 'Create a review for an employee in your scope.' : 'Your manager will create your appraisal review.'}
            />
          )}
        </Card>
      ) : null}

      {tab === 'feedback' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Feedback you received or shared, subject to visibility rules.</p>
            <Button size="sm" icon={MessageSquare} onClick={() => setModal({ type: 'feedback' })}>Give feedback</Button>
          </div>
          {feedback.error ? <div className="p-4"><ErrorState error={feedback.error} onRetry={feedback.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'employee_name', header: 'About', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.department}</p></div> },
                { key: 'from_name', header: 'From' },
                { key: 'type', header: 'Type', render: (row) => <Badge tone={row.type === 'Praise' ? 'green' : row.type === 'Constructive' ? 'amber' : 'blue'}>{row.type}</Badge> },
                { key: 'message', header: 'Message', render: (row) => <span className="line-clamp-2 max-w-md text-xs text-slate-600">{row.message}</span> },
                { key: 'visibility', header: 'Visibility' },
                { key: 'created_at', header: 'Date', render: (row) => formatDate(row.created_at) },
              ]}
              rows={feedbackList}
              loading={feedback.loading}
              emptyTitle="No feedback yet"
              emptyDescription="Recognition and constructive feedback will appear here."
            />
          )}
        </Card>
      ) : null}

      {tab === 'skills' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Skills inform workforce planning and development conversations.</p>
            <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'skill' })}>Add skill</Button>
          </div>
          {skills.error ? <div className="p-4"><ErrorState error={skills.error} onRetry={skills.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'employee_name', header: 'Employee' },
                { key: 'skill', header: 'Skill', render: (row) => <span className="font-medium text-slate-900">{row.skill}</span> },
                { key: 'proficiency', header: 'Proficiency', render: (row) => <Badge>{row.proficiency}</Badge> },
                { key: 'years_experience', header: 'Experience', render: (row) => `${row.years_experience ?? 0} year(s)` },
                { key: 'actions', header: '', render: (row) => canManageSkill(row) ? <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ type: 'skill', item: row })}>Edit</Button></div> : null },
              ]}
              rows={skillList}
              loading={skills.loading}
              emptyTitle="No skills recorded"
              emptyDescription="Add skills to employee profiles."
            />
          )}
        </Card>
      ) : null}

      {isStaffAgent && tab === 'reports' ? (
        reports.error ? <ErrorState error={reports.error} onRetry={reports.reload} /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Average rating" value={reports.data?.average_rating ? `${reports.data.average_rating} / 5` : '—'} icon={Award} />
              <StatCard label="Goals tracked" value={(reports.data?.goals_by_status ?? []).reduce((sum, row) => sum + row.count, 0)} icon={Target} tone="blue" />
              <StatCard label="Reviews tracked" value={(reports.data?.reviews_by_status ?? []).reduce((sum, row) => sum + row.count, 0)} icon={Users} tone="amber" />
              <StatCard label="Departments" value={(reports.data?.departments ?? []).length} icon={TrendingUp} tone="green" />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Goals by status" padded={false}>
                <DataTable
                  columns={[
                    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                    { key: 'count', header: 'Goals' },
                  ]}
                  rows={reports.data?.goals_by_status ?? []}
                  loading={reports.loading}
                  compact
                  emptyTitle="No goal data"
                />
              </Card>
              <Card title="Reviews by status" padded={false}>
                <DataTable
                  columns={[
                    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                    { key: 'count', header: 'Reviews' },
                  ]}
                  rows={reports.data?.reviews_by_status ?? []}
                  loading={reports.loading}
                  compact
                  emptyTitle="No review data"
                />
              </Card>
            </div>
            <Card title="Department performance" description="Appraisal and goal coverage by department" padded={false}>
              <DataTable
                columns={[
                  { key: 'department', header: 'Department', render: (row) => <span className="font-medium text-slate-900">{row.department}</span> },
                  { key: 'reviews', header: 'Reviews' },
                  { key: 'goals', header: 'Goals' },
                  { key: 'average_rating', header: 'Average rating', render: (row) => row.average_rating ? `${row.average_rating} / 5` : '—' },
                ]}
                rows={reports.data?.departments ?? []}
                loading={reports.loading}
                emptyTitle="No department data"
              />
            </Card>
          </div>
        )
      ) : null}

      <Modal open={modal?.type === 'cycle'} onClose={() => setModal(null)} title={modal?.item ? 'Edit review cycle' : 'New review cycle'} size="md">
        <CycleForm cycle={modal?.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); cycles.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'goal'} onClose={() => setModal(null)} title="Create goal" size="md">
        <GoalForm cycles={cycleList} canChooseEmployee={isStaffAgent} onClose={() => setModal(null)} onSaved={() => { setModal(null); goals.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'goal-update'} onClose={() => setModal(null)} title="Update goal progress" size="md">
        {modal?.item ? <GoalUpdateForm goal={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); goals.reload(); overview.reload(); }} /> : null}
      </Modal>
      <Modal open={modal?.type === 'review'} onClose={() => setModal(null)} title="New performance review" size="lg">
        <ReviewForm cycles={cycleList} employees={employees} currentUserId={user?.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); reviews.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'review-update'} onClose={() => setModal(null)} title="Update performance review" size="lg">
        {modal?.item ? <ReviewUpdateForm review={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); reviews.reload(); overview.reload(); }} /> : null}
      </Modal>
      <Modal open={modal?.type === 'feedback'} onClose={() => setModal(null)} title="Give feedback" size="md">
        <FeedbackForm employees={employees} currentUserId={user?.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); feedback.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'skill'} onClose={() => setModal(null)} title={modal?.item ? 'Edit skill' : 'Add skill'} size="md">
        <SkillForm skill={modal?.item} employees={employees} currentUserId={user?.id} canChooseEmployee={isStaffAgent} onClose={() => setModal(null)} onSaved={() => { setModal(null); skills.reload(); }} />
      </Modal>
      <ConfirmDialog
        open={Boolean(acknowledge)}
        onClose={() => setAcknowledge(null)}
        onConfirm={acknowledgeReview}
        loading={saving}
        title="Acknowledge review?"
        message="Acknowledgement confirms that you have read your appraisal. It does not change the rating or comments."
        confirmLabel="Acknowledge"
        danger={false}
      />
    </div>
  );
}
