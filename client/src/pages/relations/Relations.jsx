import { useCallback, useState } from 'react';
import { AlertTriangle, Plus, Shield } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api.js';
import useApiResource from '../../hooks/useApiResource.js';
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
import DetailList from '../../components/ui/DetailList.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { formatDate, formatDateTime } from '../../lib/format.js';

const STATUSES = ['Intake', 'Investigation', 'Action', 'Resolution', 'Closed'];
const CATEGORIES = ['Concern', 'Grievance', 'Policy Deviation', 'Harassment', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

function CaseForm({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ subject: '', description: '', category: 'Concern', priority: 'Medium' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/relations/cases', form);
      toast.success('Concern submitted');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Subject" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </Select>
      <Textarea label="Description" required rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving}>Submit</Button>
      </div>
    </form>
  );
}

function CaseDetail({ caseId, isHRAdmin, isStaffAgent, onClose, onChanged }) {
  const toast = useToast();
  const loader = useCallback(() => api.get(`/relations/cases/${caseId}`).then((r) => r.data), [caseId]);
  const resource = useApiResource(loader, [loader]);
  const c = resource.data;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/relations/cases/${caseId}`, form);
      toast.success('Case updated');
      resource.reload();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (resource.loading) return <p className="py-8 text-center text-sm text-slate-500">Loading…</p>;
  if (!c) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge>{c.status}</Badge>
        <Badge tone={c.priority === 'Urgent' ? 'red' : 'blue'}>{c.priority}</Badge>
      </div>
      <DetailList items={[
        { label: 'Case', value: c.case_no },
        { label: 'Employee', value: `${c.employee_name} · ${c.employee_code}` },
        { label: 'Category', value: c.category },
        { label: 'Assignee', value: c.assignee_name ?? 'Unassigned' },
        { label: 'Opened', value: formatDateTime(c.created_at) },
      ]} />
      <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap">{c.description}</div>
      {(isHRAdmin || isStaffAgent) && c.status !== 'Closed' ? (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <Select label="Status" value={form.status ?? c.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Textarea label="Investigation notes" rows={2} value={form.investigation_notes ?? c.investigation_notes ?? ''} onChange={(e) => setForm({ ...form, investigation_notes: e.target.value })} />
          <Textarea label="Resolution summary" rows={2} value={form.resolution_summary ?? c.resolution_summary ?? ''} onChange={(e) => setForm({ ...form, resolution_summary: e.target.value })} />
          <div className="flex justify-end"><Button size="sm" onClick={save} loading={saving}>Save</Button></div>
        </div>
      ) : null}
      <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
    </div>
  );
}

export default function Relations() {
  const { isHRAdmin, isStaffAgent } = useAuth();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(false);
  const [caseId, setCaseId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const overviewLoader = useCallback(() => api.get('/relations/overview').then((r) => r.data), []);
  const casesLoader = useCallback(() => api.get('/relations/cases', { params: { status: statusFilter || undefined } }).then((r) => r.data), [statusFilter]);

  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const cases = useApiResource(casesLoader, [casesLoader], { immediate: tab === 'cases' || tab === 'overview' });

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'cases', label: isHRAdmin || isStaffAgent ? 'Case console' : 'My concerns', count: (cases.data ?? []).length },
  ];

  return (
    <div>
      <PageHeader
        title="Employee Relations"
        description="Submit and track workplace concerns with confidential HR handling."
        actions={<Button icon={Plus} onClick={() => setModal(true)}>Raise concern</Button>}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' && (overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Open cases" value={overview.data?.open_cases ?? 0} icon={AlertTriangle} tone="amber" />
            <StatCard label="Urgent" value={overview.data?.urgent_cases ?? 0} icon={Shield} tone="red" />
            <StatCard label="Total in scope" value={overview.data?.total_cases ?? 0} icon={Shield} />
          </div>
          <Card title="Recent cases" padded={false}>
            <DataTable
              columns={[
                { key: 'case_no', header: 'Case' },
                { key: 'subject', header: 'Subject' },
                { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              ]}
              rows={(cases.data ?? []).slice(0, 5)}
              loading={cases.loading}
              onRowClick={(r) => setCaseId(r.id)}
              compact
            />
          </Card>
        </div>
      ))}

      {tab === 'cases' && (
        <Card padded={false}>
          <div className="flex gap-2 border-b p-4">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <DataTable
            columns={[
              { key: 'case_no', header: 'Case' },
              { key: 'subject', header: 'Subject', render: (r) => <div><p className="font-medium">{r.subject}</p><p className="text-[11px] text-slate-500">{r.employee_name}</p></div> },
              { key: 'category', header: 'Category' },
              { key: 'priority', header: 'Priority', render: (r) => <Badge>{r.priority}</Badge> },
              { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              { key: 'created_at', header: 'Opened', render: (r) => formatDate(r.created_at) },
            ]}
            rows={cases.data ?? []}
            loading={cases.loading}
            onRowClick={(r) => setCaseId(r.id)}
            emptyTitle="No cases"
          />
        </Card>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Raise a concern">
        <CaseForm onClose={() => setModal(false)} onSaved={() => { setModal(false); cases.reload(); overview.reload(); setTab('cases'); }} />
      </Modal>
      <Modal open={Boolean(caseId)} onClose={() => setCaseId(null)} title="Employee relations case" size="lg">
        {caseId ? <CaseDetail caseId={caseId} isHRAdmin={isHRAdmin} isStaffAgent={isStaffAgent} onClose={() => setCaseId(null)} onChanged={() => { cases.reload(); overview.reload(); }} /> : null}
      </Modal>
    </div>
  );
}
