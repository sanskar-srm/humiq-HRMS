import { useCallback, useState } from 'react';
import { Award, Heart, MessageSquare, Plus, Sparkles, BarChart3 } from 'lucide-react';
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
import ErrorState from '../../components/ui/ErrorState.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { formatDate } from '../../lib/format.js';

function FeedbackForm({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ category: 'General', message: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/engagement/feedback', form);
      toast.success('Feedback submitted');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
        {['General', 'Manager', 'Workplace', 'Suggestion', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Textarea label="Message" required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Submit</Button>
      </div>
    </form>
  );
}

function WellnessForm({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ mood_score: 4, stress_level: 3, notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/engagement/wellness', { ...form, mood_score: Number(form.mood_score), stress_level: Number(form.stress_level) });
      toast.success('Wellness check-in saved');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Mood (1–5)" value={form.mood_score} onChange={(e) => setForm({ ...form, mood_score: e.target.value })}>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
      <Select label="Stress (1–5)" value={form.stress_level} onChange={(e) => setForm({ ...form, stress_level: e.target.value })}>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
      <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving}>Save</Button>
      </div>
    </form>
  );
}

function SurveyCreateForm({ onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees(true);
  const [step, setStep] = useState('survey');
  const [surveyId, setSurveyId] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', status: 'Draft' });
  const [question, setQuestion] = useState({ question_text: '', question_type: 'Rating' });
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const createSurvey = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post('/engagement/surveys', form);
      setSurveyId(res.data.id);
      setStep('question');
      toast.success('Survey created — add questions');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/engagement/surveys/${surveyId}/questions`, question);
      setQuestion({ question_text: '', question_type: 'Rating' });
      toast.success('Question added');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const assign = async () => {
    if (!selected.length) { setError('Select employees'); return; }
    setSaving(true);
    try {
      await api.post(`/engagement/surveys/${surveyId}/assign`, { employee_ids: selected, activate_survey: true });
      toast.success('Survey assigned');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (step === 'survey') {
    return (
      <form onSubmit={createSurvey} className="space-y-3.5">
        <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        {error ? <p className="text-xs text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Continue</Button></div>
      </form>
    );
  }
  if (step === 'question') {
    return (
      <div className="space-y-4">
        <form onSubmit={addQuestion} className="space-y-3 rounded-lg border border-slate-200 p-3">
          <Input label="Question" required value={question.question_text} onChange={(e) => setQuestion({ ...question, question_text: e.target.value })} />
          <Select label="Type" value={question.question_type} onChange={(e) => setQuestion({ ...question, question_type: e.target.value })}>
            <option value="Rating">Rating</option>
            <option value="Text">Text</option>
          </Select>
          <Button size="sm" type="submit" loading={saving}>Add question</Button>
        </form>
        <p className="text-xs text-slate-500">Assign employees and activate the survey.</p>
        <div className="max-h-40 overflow-y-auto rounded border border-slate-100 p-2 text-xs">
          {employees.map((emp) => (
            <label key={emp.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={selected.includes(emp.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, emp.id] : selected.filter((id) => id !== emp.id))} />
              {emp.full_name}
            </label>
          ))}
        </div>
        {error ? <p className="text-xs text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStep('assign')}>Skip assign</Button>
          <Button onClick={assign} loading={saving}>Assign &amp; activate</Button>
        </div>
      </div>
    );
  }
  return null;
}

export default function Engagement() {
  const { isHRAdmin } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);

  const overviewLoader = useCallback(() => api.get('/engagement/overview').then((r) => r.data), []);
  const surveysLoader = useCallback(() => api.get('/engagement/surveys').then((r) => r.data), []);
  const feedbackLoader = useCallback(() => api.get('/engagement/feedback').then((r) => r.data), []);
  const wellnessLoader = useCallback(() => api.get('/engagement/wellness').then((r) => r.data), []);
  const recognitionLoader = useCallback(() => api.get('/engagement/recognition').then((r) => r.data), []);
  const pulseLoader = useCallback(() => api.get('/engagement/pulse').then((r) => r.data), []);
  const analyticsLoader = useCallback(() => api.get('/engagement/analytics').then((r) => r.data), []);

  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const surveys = useApiResource(surveysLoader, [surveysLoader], { immediate: tab === 'surveys' });
  const feedback = useApiResource(feedbackLoader, [feedbackLoader], { immediate: tab === 'feedback' });
  const wellness = useApiResource(wellnessLoader, [wellnessLoader], { immediate: tab === 'wellness' });
  const recognition = useApiResource(recognitionLoader, [recognitionLoader], { immediate: tab === 'recognition' });
  const pulse = useApiResource(pulseLoader, [pulseLoader], { immediate: tab === 'pulse' });
  const analytics = useApiResource(analyticsLoader, [analyticsLoader], { immediate: isHRAdmin && tab === 'analytics' });

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'surveys', label: isHRAdmin ? 'Surveys' : 'My surveys' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'wellness', label: 'Wellness' },
    { id: 'recognition', label: 'Recognition' },
    { id: 'pulse', label: 'Pulse' },
    ...(isHRAdmin ? [{ id: 'analytics', label: 'Analytics' }] : []),
  ];

  const respondPulse = async (pollId) => {
    const response = window.prompt('Your response');
    if (!response) return;
    try {
      await api.post(`/engagement/pulse/${pollId}/respond`, { response });
      toast.success('Response recorded');
      pulse.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Engagement"
        description={isHRAdmin ? 'Surveys, feedback, wellness and recognition programs.' : 'Surveys, feedback, wellness check-ins and recognition.'}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={MessageSquare} onClick={() => setModal('feedback')}>Submit feedback</Button>
            <Button variant="secondary" icon={Heart} onClick={() => setModal('wellness')}>Wellness check-in</Button>
            {isHRAdmin ? <Button icon={Plus} onClick={() => setModal('survey')}>New survey</Button> : null}
          </div>
        )}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' && (overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isHRAdmin ? (
            <>
              <StatCard label="Active surveys" value={overview.data?.active_surveys ?? 0} icon={Sparkles} />
              <StatCard label="Pending feedback" value={overview.data?.pending_feedback ?? 0} icon={MessageSquare} tone="amber" />
              <StatCard label="Avg mood" value={overview.data?.average_mood ?? '—'} icon={Heart} tone="purple" />
              <StatCard label="Recognition points" value={overview.data?.recognition_points ?? 0} icon={Award} />
            </>
          ) : (
            <>
              <StatCard label="Pending surveys" value={overview.data?.pending_surveys ?? 0} icon={Sparkles} />
              <StatCard label="My feedback" value={overview.data?.feedback_count ?? 0} icon={MessageSquare} />
              <StatCard label="Points" value={overview.data?.recognition_points ?? 0} icon={Award} tone="purple" />
              <StatCard label="Latest mood" value={overview.data?.latest_mood ?? '—'} icon={Heart} />
            </>
          )}
        </div>
      ))}

      {tab === 'surveys' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'title', header: 'Survey', render: (r) => <span className="font-medium">{r.title}</span> },
              { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              { key: 'assignment_status', header: 'Your status', render: (r) => r.assignment_status ? <Badge>{r.assignment_status}</Badge> : '—' },
              { key: 'end_date', header: 'Ends', render: (r) => formatDate(r.end_date) },
            ]}
            rows={surveys.data ?? []}
            loading={surveys.loading}
            emptyTitle="No surveys"
          />
        </Card>
      )}

      {tab === 'feedback' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'employee_name', header: 'Employee', render: (r) => r.employee_name ?? 'You' },
              { key: 'category', header: 'Category' },
              { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              { key: 'message', header: 'Message', render: (r) => <span className="line-clamp-2 max-w-md text-xs">{r.message}</span> },
              { key: 'created_at', header: 'Date', render: (r) => formatDate(r.created_at) },
            ]}
            rows={feedback.data ?? []}
            loading={feedback.loading}
            emptyTitle="No feedback"
          />
        </Card>
      )}

      {tab === 'wellness' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'mood_score', header: 'Mood' },
              { key: 'stress_level', header: 'Stress' },
              { key: 'notes', header: 'Notes', render: (r) => <span className="text-xs">{r.notes || '—'}</span> },
              { key: 'created_at', header: 'Date', render: (r) => formatDate(r.created_at) },
            ]}
            rows={wellness.data ?? []}
            loading={wellness.loading}
            emptyTitle="No check-ins"
          />
        </Card>
      )}

      {tab === 'recognition' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'employee_name', header: 'Employee' },
              { key: 'points', header: 'Points' },
              { key: 'badge', header: 'Badge' },
              { key: 'reason', header: 'Reason', render: (r) => <span className="text-xs">{r.reason}</span> },
              { key: 'awarded_at', header: 'Awarded', render: (r) => formatDate(r.awarded_at) },
            ]}
            rows={recognition.data ?? []}
            loading={recognition.loading}
            emptyTitle="No recognition"
          />
        </Card>
      )}

      {tab === 'pulse' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'question', header: 'Question' },
              { key: 'has_responded', header: 'Responded', render: (r) => <Badge tone={r.has_responded ? 'green' : 'amber'}>{r.has_responded ? 'Yes' : 'No'}</Badge> },
              { key: 'actions', header: '', render: (r) => !r.has_responded ? <Button size="sm" variant="ghost" onClick={() => respondPulse(r.id)}>Respond</Button> : null },
            ]}
            rows={pulse.data ?? []}
            loading={pulse.loading}
            emptyTitle="No active polls"
          />
        </Card>
      )}

      {isHRAdmin && tab === 'analytics' && (
        analytics.error ? <ErrorState error={analytics.error} onRetry={analytics.reload} /> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Survey completion" value={`${analytics.data?.survey_completion_rate ?? 0}%`} icon={BarChart3} />
            <StatCard label="Wellness entries" value={analytics.data?.wellness_entries ?? 0} icon={Heart} />
            <StatCard label="Avg mood" value={analytics.data?.average_mood ?? '—'} icon={Sparkles} />
            <StatCard label="Active surveys" value={analytics.data?.surveys_active ?? 0} icon={Award} />
          </div>
        )
      )}

      <Modal open={modal === 'feedback'} onClose={() => setModal(null)} title="Submit feedback">
        <FeedbackForm onClose={() => setModal(null)} onSaved={() => { setModal(null); feedback.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal === 'wellness'} onClose={() => setModal(null)} title="Wellness check-in">
        <WellnessForm onClose={() => setModal(null)} onSaved={() => { setModal(null); wellness.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal === 'survey'} onClose={() => setModal(null)} title="Create survey" size="lg">
        <SurveyCreateForm onClose={() => setModal(null)} onSaved={() => { setModal(null); surveys.reload(); overview.reload(); }} />
      </Modal>
    </div>
  );
}
