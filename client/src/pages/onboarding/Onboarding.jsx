import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileText, Plus, UserPlus } from 'lucide-react';
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
import DetailList from '../../components/ui/DetailList.jsx';
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { formatDate, todayISO } from '../../lib/format.js';

const CASE_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Cancelled'];
const TASK_CATEGORIES = ['Paperwork', 'Induction', 'Training', 'IT Provisioning', 'Other'];
const TASK_STATUSES = ['Pending', 'In Progress', 'Completed'];
const DOCUMENT_TYPES = ['Handbook', 'NDA', 'Policy', 'Tax Form', 'Other'];

function CaseForm({ departments, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: '', candidate_name: '', email: '', department: departments[0] ?? '', designation: '', joining_date: todayISO(), manager_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        employee_id: form.employee_id || undefined,
        candidate_name: form.employee_id ? undefined : form.candidate_name.trim(),
        email: form.employee_id ? undefined : form.email.trim() || undefined,
        department: form.department,
        designation: form.designation.trim(),
        joining_date: form.joining_date,
        manager_id: form.manager_id || null,
      };
      await api.post('/onboarding/cases', payload);
      toast.success('Onboarding case created');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Existing employee (optional)" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
        <option value="">New hire — not yet in the directory</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}
      </Select>
      {!form.employee_id ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Candidate name" required value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} />
          <Input label="Personal email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Department" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </Select>
        <Input label="Designation" required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Joining date" type="date" required value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
        <Select label="Onboarding manager" value={form.manager_id} onChange={(e) => setForm({ ...form, manager_id: e.target.value })}>
          <option value="">Unassigned</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
        </Select>
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Create case</Button></div>
    </form>
  );
}

function TaskForm({ caseId, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ title: '', category: 'Paperwork', assigned_to: '', due_date: todayISO() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/onboarding/cases/${caseId}/tasks`, { ...form, assigned_to: form.assigned_to || null, due_date: form.due_date || null });
      toast.success('Task added');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Task title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {TASK_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </Select>
        <Input label="Due date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
      </div>
      <Select label="Assign to" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
        <option value="">Case manager</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
      </Select>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Add task</Button></div>
    </form>
  );
}

function DocumentForm({ caseId, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ document_type: 'Handbook', file_name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/onboarding/cases/${caseId}/documents`, { document_type: form.document_type, file_name: form.file_name || undefined });
      toast.success('Document added');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Document type" value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })}>
        {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </Select>
      <Input label="File name" value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} placeholder="e.g. employee-handbook.pdf" />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Add document</Button></div>
    </form>
  );
}

function CaseDetail({ id, onClose, onChanged }) {
  const { user, isHRAdmin } = useAuth();
  const toast = useToast();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [updating, setUpdating] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/onboarding/cases/${id}`)
      .then((response) => setItem(response.data))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); onChanged(); };

  const updateTask = async (task, status) => {
    setUpdating(task.id);
    try {
      await api.patch(`/onboarding/tasks/${task.id}`, { status });
      toast.success('Task updated');
      refresh();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setUpdating(null); }
  };

  const updateDocument = async (document, status) => {
    setUpdating(document.id);
    try {
      await api.patch(`/onboarding/documents/${document.id}`, { status });
      toast.success(`Document marked ${status.toLowerCase()}`);
      refresh();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setUpdating(null); }
  };

  const canManage = isHRAdmin || item?.manager_id === user?.id;

  return (
    <>
      <Modal open onClose={onClose} title="Onboarding case" size="xl" footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {canManage ? <Button variant="secondary" icon={Plus} onClick={() => setModal('task')}>Add task</Button> : null}
          {isHRAdmin ? <Button icon={FileText} onClick={() => setModal('document')}>Add document</Button> : null}
        </>
      )}>
        {loading && !item ? <p className="py-8 text-center text-sm text-slate-500">Loading case…</p> : error ? <ErrorState error={error} onRetry={load} /> : item ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{item.candidate_name}</h3>
                <p className="text-xs text-slate-500">{item.designation} · {item.department} · joining {formatDate(item.joining_date)}</p>
              </div>
              <Badge>{item.status}</Badge>
            </div>
            <ProgressBar value={item.progress} label="Onboarding completion" />
            <DetailList items={[
              { label: 'Email', value: item.email },
              { label: 'Manager', value: item.manager_name ?? 'Unassigned' },
              { label: 'Tasks', value: `${item.task_completed} of ${item.task_total} completed` },
              { label: 'Documents', value: `${item.document_completed} of ${item.document_total} acknowledged` },
            ]} />
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tasks</p>
              {item.tasks?.length ? (
                <div className="space-y-2">
                  {item.tasks.map((task) => {
                    const editable = isHRAdmin || item.manager_id === user?.id || task.assigned_to === user?.id || task.employee_id === user?.id;
                    return (
                      <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{task.title}</p>
                          <p className="text-[11px] text-slate-500">{task.category} · due {formatDate(task.due_date)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{task.status}</Badge>
                          {editable ? (
                            <select value={task.status} disabled={updating === task.id} onChange={(e) => updateTask(task, e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs">
                              {TASK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title="No tasks yet" description="Add tasks so the new hire has a clear checklist." />}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Documents</p>
              {item.documents?.length ? (
                <div className="space-y-2">
                  {item.documents.map((document) => {
                    const editable = isHRAdmin || document.employee_id === user?.id;
                    return (
                      <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{document.document_type}</p>
                          <p className="text-[11px] text-slate-500">{document.file_name || 'No file attached'}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge>{document.status}</Badge>
                          {editable && document.status === 'Pending' ? <Button size="sm" variant="secondary" loading={updating === document.id} onClick={() => updateDocument(document, 'Acknowledged')}>Acknowledge</Button> : null}
                          {editable && document.status === 'Acknowledged' ? <Button size="sm" variant="secondary" loading={updating === document.id} onClick={() => updateDocument(document, 'Signed')}>Sign</Button> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState title="No documents yet" description="HR can add handbooks, NDAs and policy documents." />}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={modal === 'task'} onClose={() => setModal(null)} title="Add onboarding task" size="md">
        <TaskForm caseId={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      </Modal>
      <Modal open={modal === 'document'} onClose={() => setModal(null)} title="Add onboarding document" size="md">
        <DocumentForm caseId={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      </Modal>
    </>
  );
}

export default function Onboarding() {
  const { isHRAdmin } = useAuth();
  const { employees } = useEmployees();
  const [tab, setTab] = useState('overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const overviewLoader = useCallback(() => api.get('/onboarding/overview').then((r) => r.data), []);
  const casesLoader = useCallback(() => api.get('/onboarding/cases').then((r) => r.data), []);
  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const cases = useApiResource(casesLoader, [casesLoader]);

  const departments = [...new Set(employees.map((employee) => employee.department))].sort();
  const caseList = cases.data ?? [];

  const columns = [
    { key: 'candidate_name', header: 'New hire', render: (row) => <div><p className="font-medium text-slate-900">{row.candidate_name}</p><p className="text-[11px] text-slate-500">{row.email || '—'}</p></div> },
    { key: 'department', header: 'Department' },
    { key: 'designation', header: 'Designation' },
    { key: 'joining_date', header: 'Joining', render: (row) => formatDate(row.joining_date) },
    { key: 'manager_name', header: 'Manager', render: (row) => row.manager_name ?? '—' },
    { key: 'progress', header: 'Progress', render: (row) => <div className="w-32"><ProgressBar value={row.progress} /></div> },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Onboarding"
        description="Coordinate paperwork, induction, IT provisioning and training for new hires."
        actions={isHRAdmin ? <Button icon={UserPlus} onClick={() => setCreateOpen(true)}>New onboarding case</Button> : null}
      />
      <Tabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'cases', label: 'Cases', count: caseList.length }]} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' ? (
        overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="New hires" value={overview.data?.total_new_hires ?? 0} icon={UserPlus} />
              <StatCard label="In progress" value={overview.data?.in_progress ?? 0} icon={ClipboardCheck} tone="blue" />
              <StatCard label="Completed" value={overview.data?.completed ?? 0} icon={CheckCircle2} tone="green" />
              <StatCard label="Completion rate" value={`${overview.data?.completion_rate ?? 0}%`} hint="Average across cases" tone="amber" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card title="Pending documents" description="Acknowledgement still outstanding">
                <div className="space-y-2 text-sm text-slate-700">
                  <div className="flex justify-between"><span>Employee handbooks</span><Badge tone={overview.data?.pending_handbooks ? 'amber' : 'green'}>{overview.data?.pending_handbooks ?? 0}</Badge></div>
                  <div className="flex justify-between"><span>NDAs</span><Badge tone={overview.data?.pending_ndas ? 'amber' : 'green'}>{overview.data?.pending_ndas ?? 0}</Badge></div>
                </div>
              </Card>
              <Card title="Workflow" description="How onboarding progresses">
                <ol className="space-y-2 text-xs text-slate-600">
                  <li>1. HR creates a case and assigns an onboarding manager.</li>
                  <li>2. Tasks cover paperwork, IT provisioning, induction and training.</li>
                  <li>3. The new hire acknowledges and signs documents.</li>
                  <li>4. The case completes automatically at 100% progress.</li>
                </ol>
              </Card>
            </div>
          </div>
        )
      ) : (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Employees see their own case; managers see their team; HR and Admin see everything.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>New case</Button> : null}
          </div>
          {cases.error ? <div className="p-4"><ErrorState error={cases.error} onRetry={cases.reload} /></div> : <DataTable columns={columns} rows={caseList} loading={cases.loading} onRowClick={(row) => setDetailId(row.id)} emptyTitle="No onboarding cases" emptyDescription="Create a case for the next new hire." />}
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New onboarding case" size="lg">
        <CaseForm departments={departments} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); cases.reload(); overview.reload(); }} />
      </Modal>

      {detailId ? <CaseDetail id={detailId} onClose={() => setDetailId(null)} onChanged={() => { cases.reload(); overview.reload(); }} /> : null}
    </div>
  );
}
