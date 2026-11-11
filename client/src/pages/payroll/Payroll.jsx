import { useCallback, useState } from 'react';
import {
  Banknote, CheckCircle2, Download, FileText, Play, Plus, ReceiptText, Send, ShieldCheck, Users,
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
import DetailList from '../../components/ui/DetailList.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import { currency, currentMonth, formatDate, formatDateTime, monthLabel, todayISO } from '../../lib/format.js';

function RunForm({ onClose, onSaved }) {
  const toast = useToast();
  const [period, setPeriod] = useState(currentMonth());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/payroll/runs', { period });
      toast.success('Payroll run created as a draft');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Pay period" type="month" required value={period} onChange={(event) => setPeriod(event.target.value)} hint="A single run can be created for each pay period." />
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        Processing includes active employees with a configured compensation structure. Approved reimbursements are added to gross pay, and approved unpaid leave is deducted.
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Create draft</Button>
      </div>
    </form>
  );
}

function TaxForm({ record, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({
    employee_id: record?.employee_id ?? '',
    period: record?.period ?? currentMonth(),
    taxable_income: record?.taxable_income ?? '',
    tax_amount: record?.tax_amount ?? '',
    status: record?.status ?? 'Draft',
    filed_at: record?.filed_at?.slice(0, 10) ?? todayISO(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        employee_id: form.employee_id,
        period: form.period,
        taxable_income: Number(form.taxable_income),
        tax_amount: Number(form.tax_amount),
        status: form.status,
        filed_at: form.status === 'Filed' ? form.filed_at || todayISO() : null,
      };
      if (record) await api.patch(`/payroll/tax-records/${record.id}`, payload);
      else await api.post('/payroll/tax-records', payload);
      toast.success(record ? 'Tax record updated' : 'Tax record added');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Employee" required value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
        <option value="">Select employee</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Period" type="month" required value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value })} />
        <Select label="Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          {['Draft', 'Filed'].map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Taxable income" type="number" min="0" required value={form.taxable_income} onChange={(event) => setForm({ ...form, taxable_income: event.target.value })} />
        <Input label="Tax amount" type="number" min="0" required value={form.tax_amount} onChange={(event) => setForm({ ...form, tax_amount: event.target.value })} />
      </div>
      {form.status === 'Filed' ? (
        <Input label="Filed on" type="date" value={form.filed_at} onChange={(event) => setForm({ ...form, filed_at: event.target.value })} />
      ) : null}
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{record ? 'Save record' : 'Add record'}</Button>
      </div>
    </form>
  );
}

function RunDetail({ runId, onClose, onChanged }) {
  const toast = useToast();
  const loader = useCallback(() => api.get(`/payroll/runs/${runId}`).then((response) => response.data), [runId]);
  const resource = useApiResource(loader, [loader]);
  const run = resource.data;
  const [acting, setActing] = useState(false);

  const download = async (payslip) => {
    try {
      await api.download(`/payroll/payslips/${payslip.id}/document`);
      toast.success('Payslip download started');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const act = async (action) => {
    setActing(true);
    try {
      await api.post(`/payroll/runs/${runId}/${action}`);
      toast.success(action === 'process' ? 'Payroll processed' : 'Payroll disbursed');
      resource.reload();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setActing(false);
    }
  };

  const payslips = run?.payslips ?? [];

  return (
    <Modal open onClose={onClose} title={run ? `Payroll run · ${monthLabel(run.period)}` : 'Payroll run'} size="xl">
      {resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : resource.loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading payroll run…</div>
      ) : run ? (
        <div className="space-y-5">
          <DetailList
            items={[
              { label: 'Status', value: <Badge>{run.status}</Badge> },
              { label: 'Employees paid', value: run.employee_count ?? 0 },
              { label: 'Gross pay', value: currency(run.total_gross) },
              { label: 'Total deductions', value: currency(run.total_deductions) },
              { label: 'Net pay', value: currency(run.total_net) },
              { label: 'Processed', value: run.processed_at ? formatDateTime(run.processed_at) : '—' },
              { label: 'Disbursed', value: run.disbursed_at ? formatDateTime(run.disbursed_at) : '—' },
              { label: 'Processed by', value: run.processed_by_name ?? '—' },
            ]}
          />

          {run.skipped?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-medium">{run.skipped.length} employee(s) skipped</p>
              <ul className="mt-1 space-y-0.5">
                {run.skipped.map((item) => <li key={`${item.employee_id}-${item.reason}`}>{item.employee_code}: {item.reason}</li>)}
              </ul>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Payslips in this run</p>
              <div className="flex gap-2">
                {run.status === 'Draft' ? <Button size="sm" icon={Play} loading={acting} onClick={() => act('process')}>Process</Button> : null}
                {run.status === 'Processed' ? <Button size="sm" icon={Send} loading={acting} onClick={() => act('disburse')}>Disburse</Button> : null}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <DataTable
                columns={[
                  { key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code} · {row.department}</p></div> },
                  { key: 'gross_pay', header: 'Gross', render: (row) => currency(row.gross_pay, row.currency) },
                  { key: 'deductions', header: 'Deductions', render: (row) => currency(Number(row.deductions ?? 0) + Number(row.tax ?? 0), row.currency) },
                  { key: 'net_pay', header: 'Net', render: (row) => currency(row.net_pay, row.currency) },
                  { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                  { key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" icon={Download} onClick={() => download(row)}>Payslip</Button></div> },
                ]}
                rows={payslips}
                loading={false}
                compact
                emptyTitle="No payslips"
                emptyDescription="This run has not generated any payslips."
              />
            </div>
          </div>
        </div>
      ) : <EmptyState title="Payroll run unavailable" />}
    </Modal>
  );
}

export default function Payroll() {
  const { isHRAdmin, isManager } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [detailRunId, setDetailRunId] = useState(null);
  const [saving, setSaving] = useState(false);
  const { employeeMap } = useEmployees(isHRAdmin);

  const summaryLoader = useCallback(() => api.get('/payroll/summary').then((response) => response.data), []);
  const runsLoader = useCallback(() => api.get('/payroll/runs').then((response) => response.data), []);
  const payslipsLoader = useCallback(() => api.get('/payroll/payslips').then((response) => response.data), []);
  const taxLoader = useCallback(() => api.get('/payroll/tax-records').then((response) => response.data), []);
  const auditLoader = useCallback(() => api.get('/payroll/audit').then((response) => response.data), []);

  const summary = useApiResource(summaryLoader, [summaryLoader]);
  const runs = useApiResource(runsLoader, [runsLoader], { immediate: isHRAdmin });
  const payslips = useApiResource(payslipsLoader, [payslipsLoader], { immediate: tab === 'payslips' });
  const taxRecords = useApiResource(taxLoader, [taxLoader], { immediate: tab === 'tax' });
  const audit = useApiResource(auditLoader, [auditLoader], { immediate: isHRAdmin && tab === 'audit' });

  const latest = summary.data?.latest_run;
  const runList = runs.data ?? [];
  const payslipList = payslips.data ?? [];
  const taxList = taxRecords.data ?? [];
  const auditList = audit.data ?? [];

  const downloadPayslip = async (payslip) => {
    try {
      await api.download(`/payroll/payslips/${payslip.id}/document`);
      toast.success('Payslip download started');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const executeRunAction = async () => {
    if (!confirm?.run) return;
    setSaving(true);
    try {
      await api.post(`/payroll/runs/${confirm.run.id}/${confirm.type}`);
      toast.success(confirm.type === 'process' ? 'Payroll processed successfully' : 'Payroll disbursed successfully');
      setConfirm(null);
      runs.reload();
      summary.reload();
      if (tab === 'payslips') payslips.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    ...(isHRAdmin ? [{ id: 'runs', label: 'Payroll runs', count: runList.length }] : []),
    { id: 'payslips', label: 'Payslips' },
    { id: 'tax', label: 'Tax records' },
    ...(isHRAdmin ? [{ id: 'audit', label: 'Audit trail' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Run monthly payroll, review payslips and keep tax records within your authorised scope."
        actions={isHRAdmin ? <Button icon={Plus} onClick={() => setModal({ type: 'run' })}>New payroll run</Button> : null}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' ? (
        summary.error ? <ErrorState error={summary.error} onRetry={summary.reload} /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {isHRAdmin ? (
                <>
                  <StatCard label="Latest run" value={latest ? monthLabel(latest.period) : 'No runs yet'} hint={latest?.status ?? 'Create a draft to begin'} icon={Banknote} />
                  <StatCard label="Latest net payroll" value={latest ? currency(latest.total_net) : '—'} icon={ReceiptText} tone="green" />
                  <StatCard label="Payslips generated" value={summary.data?.payslips ?? 0} icon={FileText} tone="blue" />
                  <StatCard label="Total net processed" value={currency(summary.data?.total_net_paid)} icon={ShieldCheck} tone="purple" />
                </>
              ) : isManager ? (
                <>
                  <StatCard label="Direct reports" value={summary.data?.team_size ?? 0} icon={Users} />
                  <StatCard label="Team payslips" value={summary.data?.payslips ?? 0} icon={FileText} tone="blue" />
                  <StatCard label="Team net payroll" value={currency(summary.data?.total_net)} icon={ReceiptText} tone="green" />
                </>
              ) : (
                <>
                  <StatCard label="Payslips available" value={summary.data?.payslips ?? 0} icon={FileText} />
                  <StatCard label="Latest net pay" value={summary.data?.latest_net == null ? '—' : currency(summary.data.latest_net)} icon={ReceiptText} tone="green" />
                  <StatCard label="Year-to-date net" value={summary.data?.ytd_net == null ? '—' : currency(summary.data.ytd_net)} icon={ShieldCheck} tone="blue" />
                </>
              )}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card title="Payroll controls" description="Restricted to Admin and HR">
                <p className="text-xs leading-6 text-slate-600">Only Admin and HR can create, process and disburse payroll runs. Processing validates every employee's compensation structure and skips invalid records rather than producing negative net pay.</p>
              </Card>
              <Card title="What is included" description="Configured pay components and approved claims">
                <p className="text-xs leading-6 text-slate-600">Gross pay combines base salary, allowances and approved reimbursements. Fixed deductions, tax and approved unpaid leave are deducted. Payslips remain available to the employee after disbursement.</p>
              </Card>
            </div>
          </div>
        )
      ) : null}

      {isHRAdmin && tab === 'runs' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Draft runs can be processed once. Processed runs can then be disbursed.</p>
            <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'run' })}>New run</Button>
          </div>
          {runs.error ? <div className="p-4"><ErrorState error={runs.error} onRetry={runs.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'period', header: 'Period', render: (row) => <span className="font-medium text-slate-900">{monthLabel(row.period)}</span> },
                { key: 'employee_count', header: 'Employees' },
                { key: 'total_gross', header: 'Gross', render: (row) => currency(row.total_gross) },
                { key: 'total_deductions', header: 'Deductions', render: (row) => currency(row.total_deductions) },
                { key: 'total_net', header: 'Net', render: (row) => currency(row.total_net) },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'created_at', header: 'Created', render: (row) => formatDate(row.created_at) },
                {
                  key: 'actions',
                  header: '',
                  render: (row) => (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetailRunId(row.id)}>View</Button>
                      {row.status === 'Draft' ? <Button size="sm" icon={Play} loading={saving && confirm?.run?.id === row.id} onClick={() => setConfirm({ type: 'process', run: row })}>Process</Button> : null}
                      {row.status === 'Processed' ? <Button size="sm" icon={Send} loading={saving && confirm?.run?.id === row.id} onClick={() => setConfirm({ type: 'disburse', run: row })}>Disburse</Button> : null}
                    </div>
                  ),
                },
              ]}
              rows={runList}
              loading={runs.loading}
              emptyTitle="No payroll runs"
              emptyDescription="Create a draft payroll run for a pay period."
            />
          )}
        </Card>
      ) : null}

      {tab === 'payslips' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">{isHRAdmin ? 'Organisation-wide payslips.' : 'Payslips available within your scope.'}</p>
          </div>
          {payslips.error ? <div className="p-4"><ErrorState error={payslips.error} onRetry={payslips.reload} /></div> : (
            <DataTable
              columns={[
                ...(isHRAdmin ? [{ key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code} · {row.department}</p></div> }] : []),
                { key: 'period', header: 'Period', render: (row) => monthLabel(row.period) },
                { key: 'gross_pay', header: 'Gross', render: (row) => currency(row.gross_pay, row.currency) },
                { key: 'deductions', header: 'Deductions', render: (row) => currency(Number(row.deductions ?? 0) + Number(row.tax ?? 0), row.currency) },
                { key: 'net_pay', header: 'Net pay', render: (row) => <span className="font-medium text-slate-900">{currency(row.net_pay, row.currency)}</span> },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" icon={Download} onClick={() => downloadPayslip(row)}>Download</Button></div> },
              ]}
              rows={payslipList}
              loading={payslips.loading}
              emptyTitle="No payslips"
              emptyDescription="Payslips appear after payroll has been processed."
            />
          )}
        </Card>
      ) : null}

      {tab === 'tax' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Tax records are visible to the employee, their manager and HR.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'tax' })}>Add tax record</Button> : null}
          </div>
          {taxRecords.error ? <div className="p-4"><ErrorState error={taxRecords.error} onRetry={taxRecords.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code}</p></div> },
                { key: 'period', header: 'Period', render: (row) => monthLabel(row.period) },
                { key: 'taxable_income', header: 'Taxable income', render: (row) => currency(row.taxable_income) },
                { key: 'tax_amount', header: 'Tax', render: (row) => currency(row.tax_amount) },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'filed_at', header: 'Filed', render: (row) => formatDate(row.filed_at) },
                ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ type: 'tax', item: row })}>Edit</Button></div> }] : []),
              ]}
              rows={taxList}
              loading={taxRecords.loading}
              emptyTitle="No tax records"
              emptyDescription="Tax records will appear here when they are added."
            />
          )}
        </Card>
      ) : null}

      {isHRAdmin && tab === 'audit' ? (
        <Card padded={false}>
          <div className="border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Immutable trail of payroll, payslip, tax and reimbursement actions.</p>
          </div>
          {audit.error ? <div className="p-4"><ErrorState error={audit.error} onRetry={audit.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'created_at', header: 'When', render: (row) => formatDateTime(row.created_at) },
                { key: 'action', header: 'Action', render: (row) => <Badge tone="blue">{row.action}</Badge> },
                { key: 'actor', header: 'Actor', render: (row) => employeeMap.get(row.actor_id)?.full_name ?? (row.actor_id ? 'System user' : 'Candidate') },
                { key: 'entity_type', header: 'Entity' },
                { key: 'details', header: 'Details', render: (row) => <span className="line-clamp-2 max-w-md text-[11px] text-slate-500">{row.details ? JSON.stringify(row.details) : '—'}</span> },
              ]}
              rows={auditList}
              loading={audit.loading}
              emptyTitle="No audit entries"
              emptyDescription="Payroll actions will be recorded here."
            />
          )}
        </Card>
      ) : null}

      <Modal open={modal?.type === 'run'} onClose={() => setModal(null)} title="Create payroll run" size="md">
        <RunForm onClose={() => setModal(null)} onSaved={() => { setModal(null); runs.reload(); summary.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'tax'} onClose={() => setModal(null)} title={modal?.item ? 'Edit tax record' : 'Add tax record'} size="md">
        <TaxForm record={modal?.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); taxRecords.reload(); }} />
      </Modal>
      {detailRunId ? <RunDetail runId={detailRunId} onClose={() => setDetailRunId(null)} onChanged={() => { runs.reload(); summary.reload(); payslips.reload(); }} /> : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={executeRunAction}
        loading={saving}
        title={confirm?.type === 'disburse' ? 'Disburse payroll?' : 'Process payroll?'}
        message={confirm?.type === 'disburse'
          ? `This will mark ${monthLabel(confirm?.run?.period)} payroll as disbursed and all its payslips as paid. This action cannot be reversed.`
          : `This will calculate payslips for ${monthLabel(confirm?.run?.period)} from compensation structures, approved reimbursements and unpaid leave.`}
        confirmLabel={confirm?.type === 'disburse' ? 'Disburse payroll' : 'Process payroll'}
        danger={confirm?.type === 'disburse'}
      />
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        Payroll data is confidential and access is enforced by role and reporting scope.
      </div>
    </div>
  );
}
