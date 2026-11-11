import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api.js';
import useApiResource from '../../hooks/useApiResource.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
import SearchInput from '../../components/ui/SearchInput.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import DetailList from '../../components/ui/DetailList.jsx';
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { Input, Select } from '../../components/ui/Field.jsx';
import { formatDate, formatDateTime, todayISO } from '../../lib/format.js';

const EMPLOYMENT_LEVELS = ['IC', 'Manager', 'Director', 'VP', 'AVP', 'President', 'CEO'];
const STATUSES = ['Active', 'Pending Verification', 'On Leave', 'Exited'];
const EMPTY_FORM = {
  employee_code: '', full_name: '', email: '', phone: '', department: '', designation: '',
  employment_level: 'IC', reports_to: '', date_of_joining: todayISO(), employment_status: 'Active',
  password: '', is_active: true,
};

function EmployeeForm({ employee, departments, employees, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => (employee ? {
    employee_code: employee.employee_code ?? '',
    full_name: employee.full_name ?? '',
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    department: employee.department ?? '',
    designation: employee.designation ?? '',
    employment_level: employee.employment_level ?? 'IC',
    reports_to: employee.reports_to ?? '',
    date_of_joining: employee.date_of_joining?.slice(0, 10) ?? todayISO(),
    employment_status: employee.employment_status ?? 'Active',
    password: '',
    is_active: employee.is_active !== false,
  } : { ...EMPTY_FORM, department: departments[0] ?? '' }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone || null,
      department: form.department,
      designation: form.designation.trim(),
      employment_level: form.employment_level,
      reports_to: form.reports_to || null,
      date_of_joining: form.date_of_joining,
      employment_status: form.employment_status,
      is_active: form.is_active,
    };
    if (!employee) {
      if (form.employee_code.trim()) payload.employee_code = form.employee_code.trim();
      if (form.password) payload.password = form.password;
    }
    try {
      const response = employee
        ? await api.patch(`/employees/${employee.id}`, payload)
        : await api.post('/employees', payload);
      toast.success(employee ? 'Employee updated' : 'Employee created');
      onSaved(response.data, !employee ? response.data?.temporary_password : null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Employee code" value={form.employee_code} disabled={Boolean(employee)} placeholder="Auto-generated" onChange={(e) => setForm({ ...form, employee_code: e.target.value })} hint={employee ? 'Employee codes cannot be changed' : 'Leave blank to auto-generate'} />
        <Input label="Full name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Work email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Department" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          <option value="">Select department</option>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </Select>
        <Input label="Designation" required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Employment level" value={form.employment_level} onChange={(e) => setForm({ ...form, employment_level: e.target.value })}>
          {EMPLOYMENT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
        </Select>
        <Select label="Reporting manager" value={form.reports_to} onChange={(e) => setForm({ ...form, reports_to: e.target.value })}>
          <option value="">No manager</option>
          {employees.filter((option) => option.id !== employee?.id).map((option) => (
            <option key={option.id} value={option.id}>{option.full_name} · {option.employee_code}</option>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Date of joining" type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} />
        <Select label="Employment status" value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })}>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
      </div>
      {!employee ? (
        <Input label="Initial password" type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="Optional. Leave blank to generate a temporary password." />
      ) : null}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
        Account is active and can sign in
      </label>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        Roles are derived automatically from department, employment level and reporting line. Admin, HR and Manager permissions cannot be granted manually.
      </p>
      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{employee ? 'Save changes' : 'Create employee'}</Button>
      </div>
    </form>
  );
}

function EmployeeDetail({ id, onClose, canManage, onEdit, onResetPassword }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/employees/${id}`)
      .then((response) => { if (active) setEmployee(response.data); })
      .catch((err) => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  return (
    <Modal open onClose={onClose} title="Employee record" size="lg" footer={canManage && employee ? (
      <>
        <Button variant="secondary" icon={KeyRound} onClick={() => onResetPassword(employee)}>Reset password</Button>
        <Button icon={Pencil} onClick={() => onEdit(employee)}>Edit record</Button>
      </>
    ) : null}>
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading employee record…</p> : error ? <ErrorState error={error} /> : employee ? (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={employee.full_name} size="lg" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">{employee.full_name}</h3>
              <p className="text-xs text-slate-500">{employee.designation} · {employee.department}</p>
              <div className="mt-1.5 flex gap-1.5">
                <Badge>{employee.role}</Badge>
                <Badge>{employee.employment_status}</Badge>
                {employee.is_active === false ? <Badge tone="red">Inactive</Badge> : <Badge tone="green">Active</Badge>}
              </div>
            </div>
          </div>
          <DetailList items={[
            { label: 'Employee code', value: employee.employee_code },
            { label: 'Work email', value: employee.email },
            { label: 'Phone', value: employee.phone },
            { label: 'Reporting manager', value: employee.manager_name ?? 'None' },
            { label: 'Date of joining', value: formatDate(employee.date_of_joining) },
            { label: 'Employment level', value: employee.employment_level },
            { label: 'Exit date', value: employee.exit_date ? formatDate(employee.exit_date) : '—' },
            { label: 'Direct reports', value: employee.direct_reports ?? employee.reports?.length ?? 0 },
          ]} />
          {employee.reports?.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Direct reports</p>
              <div className="flex flex-wrap gap-2">
                {employee.reports.map((report) => (
                  <span key={report.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                    <UserRound className="h-3 w-3" /> {report.full_name} · {report.designation}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export default function Employees() {
  const { isHRAdmin, isAdmin } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('directory');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [options, setOptions] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [auditPage, setAuditPage] = useState(1);

  useEffect(() => {
    api.get('/employees/departments').then((response) => setDepartments(response.data)).catch(() => {});
    api.get('/employees/options').then((response) => setOptions(response.data)).catch(() => {});
  }, []);

  useEffect(() => { setPage(1); }, [debouncedSearch, department, status, role]);

  const loader = useCallback(() => api.get('/employees', {
    params: { search: debouncedSearch || undefined, department: department || undefined, status: status || undefined, role: role || undefined, page, limit: 20 },
  }), [debouncedSearch, department, status, role, page]);
  const directory = useApiResource(loader, [loader]);
  const rows = directory.data?.data ?? [];
  const meta = directory.data?.meta;
  const { loading, error, reload } = directory;

  const auditLoader = useCallback(() => api.get('/employees/audit-logs', { params: { page: auditPage, limit: 20 } }), [auditPage]);
  const auditResource = useApiResource(auditLoader, [auditLoader], { immediate: isAdmin && tab === 'audit' });
  const auditRows = auditResource.data?.data ?? [];
  const auditMeta = auditResource.data?.meta;

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (employee) => { setEditing(employee); setFormOpen(true); setDetailId(null); };

  const handleSaved = (saved, password) => {
    setFormOpen(false);
    setEditing(null);
    reload();
    if (password) setTempPassword({ name: saved.employee?.full_name ?? saved.full_name, password });
    if (saved?.employee) {
      api.get('/employees/options').then((response) => setOptions(response.data)).catch(() => {});
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      const response = await api.post(`/employees/${resetTarget.id}/reset-password`, {});
      setTempPassword({ name: resetTarget.full_name, password: response.data.temporary_password });
      setResetTarget(null);
      toast.success('Password reset successfully');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'full_name',
      header: 'Employee',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.full_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.full_name}</p>
            <p className="truncate text-[11px] text-slate-500">{row.employee_code} · {row.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'department', header: 'Department' },
    { key: 'designation', header: 'Designation' },
    { key: 'manager_name', header: 'Manager', render: (row) => row.manager_name ?? '—' },
    { key: 'role', header: 'Role', render: (row) => <Badge>{row.role}</Badge> },
    { key: 'employment_status', header: 'Status', render: (row) => <Badge>{row.employment_status}</Badge> },
    { key: 'date_of_joining', header: 'Joined', render: (row) => formatDate(row.date_of_joining) },
  ], []);

  const auditColumns = [
    { key: 'created_at', header: 'When', render: (row) => formatDateTime(row.created_at) },
    { key: 'actor_name', header: 'Actor', render: (row) => row.actor_name ?? 'System' },
    { key: 'action', header: 'Action', render: (row) => <span className="font-mono text-[11px]">{row.action}</span> },
    { key: 'entity_type', header: 'Entity', render: (row) => <Badge tone="slate">{row.entity_type}</Badge> },
    { key: 'entity_id', header: 'Entity ID', render: (row) => <span className="font-mono text-[10px] text-slate-400">{row.entity_id?.slice(0, 8) ?? '—'}</span> },
    { key: 'ip_address', header: 'IP', render: (row) => row.ip_address ?? '—' },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Directory of people in your access scope. Managers see their reporting line; Admin and HR see the organisation."
        actions={isHRAdmin ? <Button icon={Plus} onClick={openCreate}>Add employee</Button> : null}
      />

      <Tabs
        tabs={[
          { id: 'directory', label: 'Directory', count: meta?.total },
          ...(isAdmin ? [{ id: 'audit', label: 'Audit trail' }] : []),
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'directory' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, email…" className="w-full sm:w-72" />
            <Select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full sm:w-44">
              <option value="">All departments</option>
              {departments.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44">
              <option value="">All statuses</option>
              {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-full sm:w-36">
              <option value="">All roles</option>
              {['Admin', 'HR', 'Manager', 'Employee'].map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            {isHRAdmin ? <Button className="ml-auto" icon={Plus} size="sm" onClick={openCreate}>Add</Button> : null}
          </div>
          {error ? <div className="p-4"><ErrorState error={error} onRetry={reload} /></div> : (
            <>
              <DataTable columns={columns} rows={rows} loading={loading} onRowClick={(row) => setDetailId(row.id)} emptyTitle="No employees match" emptyDescription="Try changing the filters or add a new employee." />
              <Pagination page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} total={meta?.total ?? 0} limit={meta?.limit ?? 20} onPageChange={setPage} />
            </>
          )}
        </Card>
      ) : (
        <Card padded={false}>
          {auditResource.error ? <div className="p-4"><ErrorState error={auditResource.error} onRetry={auditResource.reload} /></div> : (
            <>
              <DataTable columns={auditColumns} rows={auditRows} loading={auditResource.loading} emptyTitle="No audit entries" emptyDescription="Administrative actions will appear here." compact />
              <Pagination page={auditMeta?.page ?? 1} totalPages={auditMeta?.totalPages ?? 1} total={auditMeta?.total ?? 0} limit={auditMeta?.limit ?? 20} onPageChange={setAuditPage} />
            </>
          )}
        </Card>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit employee' : 'Add employee'}
        description={editing ? `Update the record for ${editing.full_name}.` : 'Create a staff account. A temporary password can be generated automatically.'}
        size="lg"
      >
        <EmployeeForm key={editing?.id ?? 'new'} employee={editing} departments={departments} employees={options} onClose={() => setFormOpen(false)} onSaved={handleSaved} />
      </Modal>

      {detailId ? (
        <EmployeeDetail id={detailId} onClose={() => setDetailId(null)} canManage={isHRAdmin} onEdit={openEdit} onResetPassword={setResetTarget} />
      ) : null}

      <ConfirmDialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        onConfirm={resetPassword}
        title="Reset employee password"
        message={`A new temporary password will be generated for ${resetTarget?.full_name}. Existing sessions are not revoked automatically.`}
        confirmLabel="Reset password"
        loading={resetting}
      />

      <Modal
        open={Boolean(tempPassword)}
        onClose={() => setTempPassword(null)}
        title="Temporary password"
        description="Share this securely. It will not be shown again."
        size="sm"
        footer={<Button onClick={() => setTempPassword(null)}>I have saved it</Button>}
      >
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">Employee: <strong>{tempPassword?.name}</strong></p>
          <p className="mt-2 break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-900">{tempPassword?.password}</p>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> The employee should change this password immediately after signing in.</p>
      </Modal>

      {loading && rows.length ? <ProgressBar indeterminate label="Refreshing employees" className="mt-4" /> : null}
    </div>
  );
}
