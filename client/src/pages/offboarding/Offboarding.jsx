import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle2, Download, FileText, LogOut, UserMinus } from 'lucide-react';
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
import DetailList from '../../components/ui/DetailList.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { currency, formatDate, todayISO } from '../../lib/format.js';

const KT_STATUSES = ['Pending', 'In Progress', 'Completed'];
const DOCUMENT_TYPES = ['Experience Letter', 'Relieving Letter', 'Settlement Statement', 'Other'];

function ResignationForm({ isHRAdmin, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: '', resignation_date: todayISO(), last_working_date: todayISO(), reason: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/offboarding/cases', { ...form, employee_id: form.employee_id || undefined, reason: form.reason || undefined });
      toast.success('Offboarding case submitted');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {isHRAdmin ? (
        <Select label="Employee" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
          <option value="">Myself</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}
        </Select>
      ) : <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">You are submitting your own resignation. HR will validate the dates and start clearances.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Resignation date" type="date" required value={form.resignation_date} onChange={(e) => setForm({ ...form, resignation_date: e.target.value })} />
        <Input label="Last working date" type="date" required value={form.last_working_date} onChange={(e) => setForm({ ...form, last_working_date: e.target.value })} />
      </div>
      <Textarea label="Reason" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant="danger" loading={saving}>Submit resignation</Button></div>
    </form>
  );
}

function ExitInterviewForm({ caseId, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ exit_interview_date: todayISO(), notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/offboarding/cases/${caseId}/exit-interview`, form);
      toast.success('Exit interview recorded');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Interview date" type="date" value={form.exit_interview_date} onChange={(e) => setForm({ ...form, exit_interview_date: e.target.value })} />
      <Textarea label="Notes" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Save interview</Button></div>
    </form>
  );
}

function SettlementForm({ caseId, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ amount: '', status: 'Processed' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/offboarding/cases/${caseId}/settlement`, { amount: Number(form.amount), status: form.status });
      toast.success('Final settlement recorded');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Settlement amount (INR)" type="number" min="0" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      <Select label="Settlement status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        {['Pending', 'Processed', 'Paid'].map((status) => <option key={status} value={status}>{status}</option>)}
      </Select>
      <p className="text-[11px] text-slate-500">All IT, Finance and manager clearances must be approved before settlement can be recorded.</p>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Record settlement</Button></div>
    </form>
  );
}

function DocumentForm({ caseId, onClose, onSaved }) {
  const toast = useToast();
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/offboarding/cases/${caseId}/documents`, { document_type: documentType });
      toast.success('Exit document issued');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Document type" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
        {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </Select>
      <p className="text-[11px] text-slate-500">The final settlement must be recorded before exit documents can be issued.</p>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Issue document</Button></div>
    </form>
  );
}

function CaseDetail({ id, onClose, onChanged }) {
  const { user, isHRAdmin, isManager } = useAuth();
  const toast = useToast();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/offboarding/cases/${id}`)
      .then((response) => setItem(response.data))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); onChanged(); };

  const updateKt = async (status) => {
    setUpdating(true);
    try {
      await api.post(`/offboarding/cases/${id}/knowledge-transfer`, { status });
      toast.success('Knowledge transfer updated');
      refresh();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setUpdating(false); }
  };

  const decideClearance = async (clearance, status) => {
    setUpdating(true);
    try {
      await api.patch(`/offboarding/cases/${id}/clearances/${clearance.id}`, { status });
      toast.success(`Clearance ${status.toLowerCase()}`);
      refresh();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setUpdating(false); }
  };

  const complete = async () => {
    setUpdating(true);
    try {
      await api.post(`/offboarding/cases/${id}/complete`);
      toast.success('Offboarding completed. Employee record preserved as alumni.');
      setConfirmComplete(false);
      refresh();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setUpdating(false); }
  };

  const withdraw = async () => {
    setUpdating(true);
    try {
      await api.post(`/offboarding/cases/${id}/withdraw`);
      toast.success('Offboarding case withdrawn');
      setConfirmWithdraw(false);
      refresh();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setUpdating(false); }
  };

  const download = async (document) => {
    try {
      await api.download(`/offboarding/documents/${document.id}/download`);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const active = item && !['Completed', 'Withdrawn'].includes(item.status);
  const canWithdraw = item && active && (item.employee_id === user?.id || isHRAdmin);
  const canDecideClearance = (clearance) => isHRAdmin || (isManager && clearance.department === 'Manager');

  return (
    <>
      <Modal open onClose={onClose} title="Offboarding case" size="xl" footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {canWithdraw ? <Button variant="ghost" className="text-rose-600" onClick={() => setConfirmWithdraw(true)}>Withdraw</Button> : null}
          {isHRAdmin && active ? <Button variant="secondary" icon={FileText} onClick={() => setModal('document')}>Issue document</Button> : null}
          {isHRAdmin && active ? <Button icon={CheckCircle2} onClick={() => setConfirmComplete(true)}>Complete offboarding</Button> : null}
        </>
      )}>
        {loading && !item ? <p className="py-8 text-center text-sm text-slate-500">Loading case…</p> : error ? <ErrorState error={error} onRetry={load} /> : item ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{item.employee_name}</h3>
                <p className="text-xs text-slate-500">{item.employee_code} · {item.designation} · {item.department}</p>
              </div>
              <Badge>{item.status}</Badge>
            </div>
            <DetailList items={[
              { label: 'Resignation date', value: formatDate(item.resignation_date) },
              { label: 'Last working date', value: formatDate(item.last_working_date) },
              { label: 'Knowledge transfer', value: item.knowledge_transfer_status },
              { label: 'Exit interview', value: item.exit_interview_date ? formatDate(item.exit_interview_date) : 'Not recorded' },
              { label: 'Final settlement', value: item.final_settlement_amount ? currency(item.final_settlement_amount) : 'Not recorded' },
              { label: 'Settlement status', value: item.settlement_status },
              { label: 'Clearances', value: `${item.clearance_approved} of ${item.clearance_total} approved` },
              { label: 'Reason', value: item.reason || '—' },
            ]} />

            {active ? (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Knowledge transfer</p>
                    <p className="text-[11px] text-slate-500">Employee or HR updates the handover progress.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{item.knowledge_transfer_status}</Badge>
                    {(item.employee_id === user?.id || isHRAdmin) ? (
                      <select value={item.knowledge_transfer_status} disabled={updating} onChange={(e) => updateKt(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs">
                        {KT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Clearances</p>
                {isHRAdmin && active ? <Button size="sm" variant="secondary" icon={LogOut} onClick={() => setModal('exit')}>Record exit interview</Button> : null}
              </div>
              {item.clearances?.length ? (
                <div className="space-y-2">
                  {item.clearances.map((clearance) => (
                    <div key={clearance.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{clearance.department} clearance</p>
                        <p className="text-[11px] text-slate-500">
                          {clearance.approved_by_name ? `${clearance.approved_by_name} · ${formatDate(clearance.approved_at)}` : 'Awaiting decision'}
                          {clearance.notes ? ` · ${clearance.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge>{clearance.status}</Badge>
                        {clearance.status === 'Pending' && active && canDecideClearance(clearance) ? (
                          <>
                            <Button size="sm" variant="secondary" loading={updating} onClick={() => decideClearance(clearance, 'Approved')}>Approve</Button>
                            <Button size="sm" variant="ghost" className="text-rose-600" loading={updating} onClick={() => decideClearance(clearance, 'Rejected')}>Reject</Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState title="No clearances" description="Clearances are created automatically when a case starts." />}
            </div>

            {item.exit_interview_notes ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Exit interview notes</p>
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{item.exit_interview_notes}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Exit documents</p>
              {isHRAdmin && active && item.final_settlement_amount ? <Button size="sm" variant="secondary" icon={FileText} onClick={() => setModal('document')}>Issue another</Button> : null}
            </div>
            {item.documents?.length ? (
              <div className="space-y-2">
                {item.documents.map((document) => (
                  <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{document.document_type}</p>
                      <p className="text-[11px] text-slate-500">{document.file_name} · {formatDate(document.issued_at)}</p>
                    </div>
                    <Button size="sm" variant="secondary" icon={Download} onClick={() => download(document)}>Download</Button>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No exit documents" description="Record the final settlement, then issue letters for the employee." />}

            {isHRAdmin && active && item.clearance_total > 0 && item.clearance_approved === item.clearance_total ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-800">All clearances are approved. Record the final settlement to proceed to documents.</p>
                <Button size="sm" variant="secondary" onClick={() => setModal('settlement')}>Record settlement</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={modal === 'exit'} onClose={() => setModal(null)} title="Record exit interview" size="md">
        <ExitInterviewForm caseId={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      </Modal>
      <Modal open={modal === 'settlement'} onClose={() => setModal(null)} title="Final settlement" size="md">
        <SettlementForm caseId={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      </Modal>
      <Modal open={modal === 'document'} onClose={() => setModal(null)} title="Issue exit document" size="md">
        <DocumentForm caseId={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />
      </Modal>

      <ConfirmDialog open={confirmComplete} onClose={() => setConfirmComplete(false)} onConfirm={complete} title="Complete offboarding" message="This marks the employee as exited and deactivates their account. The employee record and all offboarding history are preserved for alumni reporting." confirmLabel="Complete offboarding" loading={updating} />
      <ConfirmDialog open={confirmWithdraw} onClose={() => setConfirmWithdraw(false)} onConfirm={withdraw} title="Withdraw offboarding" message="Withdraw this resignation? The case history is retained but no further clearance actions can be taken." confirmLabel="Withdraw case" loading={updating} />
    </>
  );
}

export default function Offboarding() {
  const { isHRAdmin } = useAuth();
  const [tab, setTab] = useState('overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const overviewLoader = useCallback(() => api.get('/offboarding/overview').then((r) => r.data), []);
  const casesLoader = useCallback(() => api.get('/offboarding/cases').then((r) => r.data), []);
  const alumniLoader = useCallback(() => api.get('/offboarding/alumni').then((r) => r.data), []);
  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const cases = useApiResource(casesLoader, [casesLoader]);
  const alumni = useApiResource(alumniLoader, [alumniLoader], { immediate: isHRAdmin && tab === 'alumni' });

  const caseList = cases.data ?? [];
  const columns = [
    { key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code} · {row.department}</p></div> },
    { key: 'last_working_date', header: 'Last working day', render: (row) => formatDate(row.last_working_date) },
    { key: 'knowledge_transfer_status', header: 'Knowledge transfer', render: (row) => <Badge>{row.knowledge_transfer_status}</Badge> },
    { key: 'clearances', header: 'Clearances', render: (row) => `${row.clearance_approved} / ${row.clearance_total}` },
    { key: 'settlement_status', header: 'Settlement', render: (row) => <Badge>{row.settlement_status}</Badge> },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="Offboarding"
        description="Manage resignations, knowledge transfer, clearances, final settlement and exit documents."
        actions={<Button variant="danger" icon={UserMinus} onClick={() => setCreateOpen(true)}>Submit resignation</Button>}
      />
      <Tabs
        tabs={[{ id: 'overview', label: 'Overview' }, { id: 'cases', label: 'Cases', count: caseList.length }, ...(isHRAdmin ? [{ id: 'alumni', label: 'Alumni' }] : [])]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'overview' ? (
        overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total cases" value={overview.data?.total ?? 0} icon={Archive} />
              <StatCard label="In progress" value={overview.data?.in_progress ?? 0} icon={UserMinus} tone="amber" />
              <StatCard label="Completed" value={overview.data?.completed ?? 0} icon={CheckCircle2} tone="green" />
              <StatCard label="Pending clearances" value={overview.data?.pending_clearances ?? 0} tone="red" />
            </div>
            <Card title="Offboarding workflow" description="Records are preserved at every stage">
              <ol className="space-y-2 text-xs text-slate-600">
                <li>1. Resignation is submitted with resignation and last working dates.</li>
                <li>2. Knowledge transfer and exit interview are completed.</li>
                <li>3. IT, Finance and manager clearances are decided.</li>
                <li>4. Final settlement is recorded and exit documents are issued.</li>
                <li>5. Completion deactivates the account but keeps the employee record and history.</li>
              </ol>
            </Card>
          </div>
        )
      ) : null}

      {tab === 'cases' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Employees see their own case, managers see their reports, and HR sees all cases.</p>
            <Button size="sm" variant="danger" icon={UserMinus} onClick={() => setCreateOpen(true)}>New case</Button>
          </div>
          {cases.error ? <div className="p-4"><ErrorState error={cases.error} onRetry={cases.reload} /></div> : <DataTable columns={columns} rows={caseList} loading={cases.loading} onRowClick={(row) => setDetailId(row.id)} emptyTitle="No offboarding cases" emptyDescription="No one is currently offboarding in your scope." />}
        </Card>
      ) : null}

      {tab === 'alumni' && isHRAdmin ? (
        <Card padded={false}>
          <div className="border-b border-slate-100 p-4 text-xs text-slate-500">Completed offboardings are retained as alumni records. Employee records are never deleted.</div>
          {alumni.error ? <div className="p-4"><ErrorState error={alumni.error} onRetry={alumni.reload} /></div> : <DataTable columns={columns} rows={alumni.data ?? []} loading={alumni.loading} emptyTitle="No alumni yet" emptyDescription="Completed offboardings will appear here." />}
        </Card>
      ) : null}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Submit resignation" size="md">
        <ResignationForm isHRAdmin={isHRAdmin} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); cases.reload(); overview.reload(); }} />
      </Modal>

      {detailId ? <CaseDetail id={detailId} onClose={() => setDetailId(null)} onChanged={() => { cases.reload(); overview.reload(); }} /> : null}
    </div>
  );
}
