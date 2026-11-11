import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, BadgeIndianRupee, Banknote, Gift, HandCoins, HeartPulse, Plus, ReceiptText, Wallet } from 'lucide-react';
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
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { currency, formatDate, todayISO } from '../../lib/format.js';

const REIMBURSEMENT_CATEGORIES = ['Travel', 'Medical', 'Meals', 'Equipment', 'Training', 'Other'];

function StructureForm({ structure, grades, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({
    employee_id: structure?.employee_id ?? '', grade_id: structure?.grade_id ?? '',
    base_salary: structure?.base_salary ?? '', allowances: structure?.allowances ?? 0,
    deductions: structure?.deductions ?? 0, tax_percent: structure?.tax_percent ?? 0,
    currency: structure?.currency ?? 'INR', effective_date: structure?.effective_date?.slice(0, 10) ?? todayISO(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/compensation/salary-structures', {
        ...form,
        employee_id: form.employee_id,
        grade_id: form.grade_id || null,
        base_salary: Number(form.base_salary),
        allowances: Number(form.allowances),
        deductions: Number(form.deductions),
        tax_percent: Number(form.tax_percent),
      });
      toast.success('Compensation structure saved');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Employee" required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
        <option value="">Select employee</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}
      </Select>
      <Select label="Salary grade (optional)" value={form.grade_id} onChange={(e) => setForm({ ...form, grade_id: e.target.value })}>
        <option value="">No grade</option>
        {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.grade} · {currency(grade.min_salary)}–{currency(grade.max_salary)}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Base salary" type="number" min="0" required value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} />
        <Input label="Allowances" type="number" min="0" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Fixed deductions" type="number" min="0" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} />
        <Input label="Tax percent" type="number" min="0" max="60" step="0.1" value={form.tax_percent} onChange={(e) => setForm({ ...form, tax_percent: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          {['INR', 'USD', 'EUR', 'GBP'].map((code) => <option key={code} value={code}>{code}</option>)}
        </Select>
        <Input label="Effective date" type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Save structure</Button></div>
    </form>
  );
}

function GradeForm({ grade, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ grade: grade?.grade ?? '', min_salary: grade?.min_salary ?? '', max_salary: grade?.max_salary ?? '', currency: grade?.currency ?? 'INR', description: grade?.description ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...form, min_salary: Number(form.min_salary), max_salary: Number(form.max_salary) };
      if (grade) await api.patch(`/compensation/salary-grades/${grade.id}`, payload);
      else await api.post('/compensation/salary-grades', payload);
      toast.success(grade ? 'Salary grade updated' : 'Salary grade created');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Grade name" required value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Minimum salary" type="number" min="0" required value={form.min_salary} onChange={(e) => setForm({ ...form, min_salary: e.target.value })} />
        <Input label="Maximum salary" type="number" min="0" required value={form.max_salary} onChange={(e) => setForm({ ...form, max_salary: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
          {['INR', 'USD', 'EUR', 'GBP'].map((code) => <option key={code} value={code}>{code}</option>)}
        </Select>
        <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>{grade ? 'Save grade' : 'Create grade'}</Button></div>
    </form>
  );
}

function BenefitForm({ benefit, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: benefit?.name ?? '', description: benefit?.description ?? '', provider: benefit?.provider ?? '', cost: benefit?.cost ?? 0, active: benefit?.active !== false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...form, cost: Number(form.cost) };
      if (benefit) await api.patch(`/compensation/benefits/${benefit.id}`, payload);
      else await api.post('/compensation/benefits', payload);
      toast.success(benefit ? 'Benefit updated' : 'Benefit created');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Benefit name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
        <Input label="Annual cost" type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
      </div>
      <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" /> Available for enrollment</label>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>{benefit ? 'Save benefit' : 'Create benefit'}</Button></div>
    </form>
  );
}

function EnrollmentForm({ benefits, isHRAdmin, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const activeBenefits = benefits.filter((benefit) => benefit.active !== false);
  const [form, setForm] = useState({ benefit_id: activeBenefits[0]?.id ?? '', employee_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/compensation/enrollments', { benefit_id: form.benefit_id, employee_id: form.employee_id || undefined });
      toast.success('Benefit enrollment saved');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  if (!activeBenefits.length) return <div><EmptyState title="No active benefits" description="Create or activate a benefit first." /><div className="mt-3 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div></div>;

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {isHRAdmin ? (
        <Select label="Employee" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
          <option value="">Myself</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
        </Select>
      ) : <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">You are enrolling yourself in the selected benefit.</p>}
      <Select label="Benefit" required value={form.benefit_id} onChange={(e) => setForm({ ...form, benefit_id: e.target.value })}>
        {activeBenefits.map((benefit) => <option key={benefit.id} value={benefit.id}>{benefit.name} {benefit.provider ? `· ${benefit.provider}` : ''}</option>)}
      </Select>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Enroll</Button></div>
    </form>
  );
}

function RewardForm({ onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: '', title: '', points: 100, note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/compensation/rewards', { ...form, points: Number(form.points) });
      toast.success('Reward awarded');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Employee" required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
        <option value="">Select employee</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Award title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input label="Points" type="number" min="1" required value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
      </div>
      <Textarea label="Note" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Award reward</Button></div>
    </form>
  );
}

function ReimbursementForm({ isHRAdmin, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: '', category: 'Travel', amount: '', description: '', receipt_url: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/compensation/reimbursements', { ...form, employee_id: form.employee_id || undefined, amount: Number(form.amount), receipt_url: form.receipt_url || undefined });
      toast.success('Reimbursement submitted');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {isHRAdmin ? (
        <Select label="Employee" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
          <option value="">Myself</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
        </Select>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {REIMBURSEMENT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
        </Select>
        <Input label="Amount" type="number" min="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </div>
      <Textarea label="Description" required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <Input label="Receipt URL" type="url" value={form.receipt_url} onChange={(e) => setForm({ ...form, receipt_url: e.target.value })} />
      <p className="text-[11px] text-slate-500">Claims are reviewed by your reporting manager, then HR. Approved claims are included in the next payroll run.</p>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Submit claim</Button></div>
    </form>
  );
}

function DecisionForm({ reimbursement, onClose, onSaved }) {
  const toast = useToast();
  const [decision, setDecision] = useState('Approved');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`/compensation/reimbursements/${reimbursement.id}/decision`, { decision, note: note || undefined });
      toast.success(`Reimbursement ${decision.toLowerCase()}`);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{reimbursement.employee_name} · {reimbursement.category}</p>
        <p>{currency(reimbursement.amount)} · {reimbursement.status}</p>
        <p className="mt-1">{reimbursement.description}</p>
      </div>
      <Select label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
        <option value="Approved">Approve</option>
        <option value="Rejected">Reject</option>
      </Select>
      <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant={decision === 'Rejected' ? 'danger' : 'primary'} loading={saving}>{decision === 'Rejected' ? 'Reject claim' : 'Approve claim'}</Button></div>
    </form>
  );
}

export default function Compensation() {
  const { user, isHRAdmin, isManager } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);
  const [decision, setDecision] = useState(null);
  const [saving, setSaving] = useState(false);

  const overviewLoader = useCallback(() => api.get('/compensation/overview').then((r) => r.data), []);
  const structuresLoader = useCallback(() => api.get('/compensation/salary-structures', { params: isHRAdmin ? {} : { employee_id: user?.id } }).then((r) => r.data), [isHRAdmin, user?.id]);
  const gradesLoader = useCallback(() => api.get('/compensation/salary-grades').then((r) => r.data), []);
  const benefitsLoader = useCallback(() => api.get('/compensation/benefits').then((r) => r.data), []);
  const enrollmentsLoader = useCallback(() => api.get('/compensation/enrollments').then((r) => r.data), []);
  const rewardsLoader = useCallback(() => api.get('/compensation/rewards').then((r) => r.data), []);
  const reimbursementsLoader = useCallback(() => api.get('/compensation/reimbursements').then((r) => r.data), []);

  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const structures = useApiResource(structuresLoader, [structuresLoader], { immediate: tab === 'structures' });
  const grades = useApiResource(gradesLoader, [gradesLoader], { immediate: isHRAdmin && (tab === 'grades' || modal?.type === 'structure') });
  const benefits = useApiResource(benefitsLoader, [benefitsLoader], { immediate: tab === 'benefits' || tab === 'enrollments' || modal?.type === 'enrollment' });
  const enrollments = useApiResource(enrollmentsLoader, [enrollmentsLoader], { immediate: tab === 'enrollments' });
  const rewards = useApiResource(rewardsLoader, [rewardsLoader], { immediate: tab === 'rewards' });
  const reimbursements = useApiResource(reimbursementsLoader, [reimbursementsLoader], { immediate: tab === 'reimbursements' });

  const benefitMap = useMemo(() => new Map((benefits.data ?? []).map((benefit) => [benefit.id, benefit])), [benefits.data]);
  const structureRows = Array.isArray(structures.data) ? structures.data : structures.data ? [structures.data] : [];
  const benefitList = benefits.data ?? [];
  const enrollmentList = enrollments.data ?? [];
  const reimbursementList = reimbursements.data ?? [];

  useEffect(() => {
    if (tab === 'benefits') benefits.reload();
    if (tab === 'enrollments') { benefits.reload(); enrollments.reload(); }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelEnrollment = async (enrollment) => {
    setSaving(true);
    try {
      await api.patch(`/compensation/enrollments/${enrollment.id}`, { status: 'Cancelled' });
      toast.success('Enrollment cancelled');
      enrollments.reload();
      overview.reload();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const canDecide = (row) => row.employee_id !== user?.id && ['Submitted', 'Manager Approved'].includes(row.status) && (isHRAdmin || isManager);

  const structureColumns = [
    ...(isHRAdmin ? [{ key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code} · {row.department}</p></div> }] : []),
    { key: 'base_salary', header: 'Base salary', render: (row) => currency(row.base_salary, row.currency) },
    { key: 'allowances', header: 'Allowances', render: (row) => currency(row.allowances, row.currency) },
    { key: 'deductions', header: 'Deductions', render: (row) => currency(row.deductions, row.currency) },
    { key: 'tax_percent', header: 'Tax', render: (row) => `${row.tax_percent ?? 0}%` },
    { key: 'effective_date', header: 'Effective', render: (row) => formatDate(row.effective_date) },
    ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ type: 'structure', item: row })}>Edit</Button></div> }] : []),
  ];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'structures', label: isHRAdmin ? 'Salary structures' : 'My compensation' },
    ...(isHRAdmin ? [{ id: 'grades', label: 'Salary grades' }] : []),
    { id: 'benefits', label: 'Benefits' },
    { id: 'enrollments', label: 'Enrollments' },
    { id: 'rewards', label: 'Rewards' },
    { id: 'reimbursements', label: 'Reimbursements' },
  ];

  return (
    <div>
      <PageHeader
        title="Compensation"
        description="Salary structures, grades, benefits, rewards and reimbursement workflows."
        actions={<Button icon={HandCoins} onClick={() => setModal({ type: 'reimbursement' })}>Submit reimbursement</Button>}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' ? (
        overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {isHRAdmin ? (
                <>
                  <StatCard label="Annual salary cost" value={currency(overview.data?.salary_cost)} icon={Banknote} />
                  <StatCard label="Average salary" value={currency(overview.data?.average_salary)} icon={BadgeIndianRupee} tone="green" />
                  <StatCard label="Salary structures" value={overview.data?.structures ?? 0} icon={Wallet} tone="blue" />
                  <StatCard label="Active benefits" value={overview.data?.active_benefits ?? 0} icon={HeartPulse} tone="purple" />
                  <StatCard label="Salary grades" value={overview.data?.salary_grades ?? 0} tone="slate" />
                  <StatCard label="Benefit enrollments" value={overview.data?.enrollments ?? 0} tone="green" />
                  <StatCard label="Reimbursements to review" value={overview.data?.pending_reimbursements ?? 0} tone="amber" />
                  <StatCard label="Reward points" value={overview.data?.rewards_points ?? 0} icon={Award} tone="purple" />
                </>
              ) : isManager ? (
                <>
                  <StatCard label="Direct reports" value={overview.data?.team_size ?? 0} icon={Wallet} />
                  <StatCard label="Reimbursements to review" value={overview.data?.pending_reimbursements ?? 0} tone="amber" />
                  <StatCard label="Team reward points" value={overview.data?.rewards_points ?? 0} icon={Award} tone="purple" />
                  <StatCard label="Team rewards" value={overview.data?.team_rewards ?? 0} icon={Gift} tone="green" />
                </>
              ) : (
                <>
                  <StatCard label="Base salary" value={overview.data?.base_salary ? currency(overview.data.base_salary, overview.data.currency) : 'Restricted'} icon={Banknote} />
                  <StatCard label="Active benefits" value={overview.data?.active_benefits ?? 0} icon={HeartPulse} tone="green" />
                  <StatCard label="Pending reimbursements" value={overview.data?.pending_reimbursements ?? 0} tone="amber" />
                  <StatCard label="Reward points" value={overview.data?.rewards_points ?? 0} icon={Award} tone="purple" />
                </>
              )}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card title="Confidentiality" description="Compensation data is restricted">
                <p className="text-xs leading-6 text-slate-600">Salary structures and grades are visible to Admin and HR only. Managers see team aggregates without individual salaries. Employees can view only their own compensation and payslips.</p>
              </Card>
              <Card title="Reimbursement workflow" description="Manager review, then HR final approval">
                <p className="text-xs leading-6 text-slate-600">Claims begin as Submitted. The reporting manager approves or rejects first; HR gives final approval. Approved claims are included in the next payroll run.</p>
              </Card>
            </div>
          </div>
        )
      ) : null}

      {tab === 'structures' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">{isHRAdmin ? 'Organisation-wide salary structures.' : 'Your compensation structure.'}</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'structure' })}>Add structure</Button> : null}
          </div>
          {structures.error ? <div className="p-4"><ErrorState error={structures.error} onRetry={structures.reload} /></div> : <DataTable columns={structureColumns} rows={structureRows} loading={structures.loading} emptyTitle="No compensation structure" emptyDescription={isHRAdmin ? 'Create a salary structure for an employee.' : 'HR has not configured your compensation yet.'} />}
        </Card>
      ) : null}

      {isHRAdmin && tab === 'grades' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Salary grades constrain the base salary ranges used in structures.</p>
            <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'grade' })}>Add grade</Button>
          </div>
          {grades.error ? <div className="p-4"><ErrorState error={grades.error} onRetry={grades.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'grade', header: 'Grade', render: (row) => <span className="font-medium text-slate-900">{row.grade}</span> },
                { key: 'range', header: 'Range', render: (row) => `${currency(row.min_salary, row.currency)} – ${currency(row.max_salary, row.currency)}` },
                { key: 'currency', header: 'Currency' },
                { key: 'description', header: 'Description', render: (row) => row.description ?? '—' },
                { key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ type: 'grade', item: row })}>Edit</Button></div> },
              ]}
              rows={grades.data ?? []}
              loading={grades.loading}
              emptyTitle="No salary grades"
              emptyDescription="Define grades before assigning salary structures."
            />
          )}
        </Card>
      ) : null}

      {tab === 'benefits' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Benefits available for enrollment.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={HeartPulse} onClick={() => setModal({ type: 'enrollment' })}>Enroll</Button>
              {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'benefit' })}>Add benefit</Button> : null}
            </div>
          </div>
          {benefits.error ? <div className="p-4"><ErrorState error={benefits.error} onRetry={benefits.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'name', header: 'Benefit', render: (row) => <div><p className="font-medium text-slate-900">{row.name}</p><p className="text-[11px] text-slate-500">{row.description}</p></div> },
                { key: 'provider', header: 'Provider', render: (row) => row.provider ?? '—' },
                { key: 'cost', header: 'Annual cost', render: (row) => currency(row.cost) },
                { key: 'active', header: 'Status', render: (row) => <Badge tone={row.active === false ? 'red' : 'green'}>{row.active === false ? 'Inactive' : 'Active'}</Badge> },
                ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ type: 'benefit', item: row })}>Edit</Button></div> }] : []),
              ]}
              rows={benefitList}
              loading={benefits.loading}
              emptyTitle="No benefits"
              emptyDescription="HR can add health insurance, provident fund and other benefits."
            />
          )}
        </Card>
      ) : null}

      {tab === 'enrollments' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Active and cancelled benefit enrollments.</p>
            <Button size="sm" variant="secondary" icon={HeartPulse} onClick={() => setModal({ type: 'enrollment' })}>Enroll</Button>
          </div>
          {enrollments.error ? <div className="p-4"><ErrorState error={enrollments.error} onRetry={enrollments.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'employee_name', header: 'Employee' },
                { key: 'benefit_id', header: 'Benefit', render: (row) => benefitMap.get(row.benefit_id)?.name ?? 'Benefit' },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'enrolled_at', header: 'Enrolled', render: (row) => formatDate(row.enrolled_at) },
                { key: 'actions', header: '', render: (row) => row.status === 'Active' && (isHRAdmin || row.employee_id === user?.id) ? <div className="text-right"><Button size="sm" variant="ghost" className="text-rose-600" loading={saving} onClick={() => cancelEnrollment(row)}>Cancel</Button></div> : null },
              ]}
              rows={enrollmentList}
              loading={enrollments.loading}
              emptyTitle="No enrollments"
              emptyDescription="Enroll in an available benefit."
            />
          )}
        </Card>
      ) : null}

      {tab === 'rewards' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Recognition awards and reward points in your scope.</p>
            {isHRAdmin ? <Button size="sm" icon={Award} onClick={() => setModal({ type: 'reward' })}>Award reward</Button> : null}
          </div>
          {rewards.error ? <div className="p-4"><ErrorState error={rewards.error} onRetry={rewards.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'employee_name', header: 'Employee' },
                { key: 'title', header: 'Award', render: (row) => <span className="font-medium text-slate-900">{row.title}</span> },
                { key: 'points', header: 'Points', render: (row) => <Badge tone="purple">{row.points}</Badge> },
                { key: 'note', header: 'Note', render: (row) => <span className="line-clamp-2 max-w-xs text-xs text-slate-500">{row.note || '—'}</span> },
                { key: 'awarded_at', header: 'Awarded', render: (row) => formatDate(row.awarded_at) },
              ]}
              rows={rewards.data ?? []}
              loading={rewards.loading}
              emptyTitle="No rewards yet"
              emptyDescription="Recognition awards will appear here."
            />
          )}
        </Card>
      ) : null}

      {tab === 'reimbursements' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Claims are scoped to you or your team.</p>
            <Button size="sm" icon={ReceiptText} onClick={() => setModal({ type: 'reimbursement' })}>Submit claim</Button>
          </div>
          {reimbursements.error ? <div className="p-4"><ErrorState error={reimbursements.error} onRetry={reimbursements.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code}</p></div> },
                { key: 'category', header: 'Category', render: (row) => <Badge>{row.category}</Badge> },
                { key: 'amount', header: 'Amount', render: (row) => currency(row.amount) },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'description', header: 'Description', render: (row) => <span className="line-clamp-2 max-w-xs text-xs text-slate-500">{row.description}</span> },
                { key: 'created_at', header: 'Submitted', render: (row) => formatDate(row.created_at) },
                { key: 'actions', header: '', render: (row) => canDecide(row) ? <div className="text-right"><Button size="sm" onClick={() => setDecision(row)}>Review</Button></div> : null },
              ]}
              rows={reimbursementList}
              loading={reimbursements.loading}
              emptyTitle="No reimbursements"
              emptyDescription="Submit a claim for travel, medical or other expenses."
            />
          )}
        </Card>
      ) : null}

      <Modal open={modal?.type === 'structure'} onClose={() => setModal(null)} title={modal?.item ? 'Edit salary structure' : 'New salary structure'} size="md">
        <StructureForm structure={modal?.item} grades={grades.data ?? []} onClose={() => setModal(null)} onSaved={() => { setModal(null); structures.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'grade'} onClose={() => setModal(null)} title={modal?.item ? 'Edit salary grade' : 'New salary grade'} size="md">
        <GradeForm grade={modal?.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); grades.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'benefit'} onClose={() => setModal(null)} title={modal?.item ? 'Edit benefit' : 'New benefit'} size="md">
        <BenefitForm benefit={modal?.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); benefits.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'enrollment'} onClose={() => setModal(null)} title="Enroll in a benefit" size="md">
        <EnrollmentForm benefits={benefitList} isHRAdmin={isHRAdmin} onClose={() => setModal(null)} onSaved={() => { setModal(null); enrollments.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'reward'} onClose={() => setModal(null)} title="Award a reward" size="md">
        <RewardForm onClose={() => setModal(null)} onSaved={() => { setModal(null); rewards.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'reimbursement'} onClose={() => setModal(null)} title="Submit reimbursement" size="md">
        <ReimbursementForm isHRAdmin={isHRAdmin} onClose={() => setModal(null)} onSaved={() => { setModal(null); reimbursements.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={Boolean(decision)} onClose={() => setDecision(null)} title="Reimbursement decision" size="sm">
        {decision ? <DecisionForm reimbursement={decision} onClose={() => setDecision(null)} onSaved={() => { setDecision(null); reimbursements.reload(); overview.reload(); }} /> : null}
      </Modal>
    </div>
  );
}
