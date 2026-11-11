import { useCallback, useMemo, useState } from 'react';
import { Banknote, BriefcaseBusiness, Layers, Plus, Target, Trash2, TrendingUp, UserCheck, Users } from 'lucide-react';
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
import EmptyState from '../../components/ui/EmptyState.jsx';
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { currency, formatDate, number, todayISO } from '../../lib/format.js';

const PROJECT_STATUS = ['Planning', 'Active', 'On Hold', 'Completed'];
const PROFICIENCY = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const READINESS = ['Ready Now', '1-2 Years', '3+ Years'];

function Actions({ children }) {
  return <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">{children}</div>;
}

function ProjectForm({ project, departments, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: project?.name ?? '', department: project?.department ?? departments[0] ?? '',
    status: project?.status ?? 'Planning', start_date: project?.start_date?.slice(0, 10) ?? todayISO(),
    end_date: project?.end_date?.slice(0, 10) ?? '', budget: project?.budget ?? '', description: project?.description ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...form, budget: form.budget === '' ? undefined : Number(form.budget) };
      if (project) await api.patch(`/workforce/projects/${project.id}`, payload);
      else await api.post('/workforce/projects', payload);
      toast.success(project ? 'Project updated' : 'Project created');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Project name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </Select>
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {PROJECT_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Start date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        <Input label="End date" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        <Input label="Budget (INR)" type="number" min="0" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
      </div>
      <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>{project ? 'Save project' : 'Create project'}</Button></Actions>
    </form>
  );
}

function AllocationForm({ projects, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: '', project_id: projects[0]?.id ?? '', allocation_percent: 50, role: '', start_date: todayISO(), end_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/workforce/allocations', {
        ...form,
        employee_id: form.employee_id,
        project_id: form.project_id,
        allocation_percent: Number(form.allocation_percent),
        end_date: form.end_date || undefined,
      });
      toast.success('Allocation created');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Employee" required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
          <option value="">Select employee</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.department}</option>)}
        </Select>
        <Select label="Project" required value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
          <option value="">Select project</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Allocation %" type="number" min="1" max="100" required value={form.allocation_percent} onChange={(e) => setForm({ ...form, allocation_percent: e.target.value })} />
        <Input label="Project role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Tech Lead" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Start date" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        <Input label="End date" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Allocate employee</Button></Actions>
    </form>
  );
}

function ForecastForm({ departments, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ department: departments[0] ?? '', period: 'FY 2026-27', current_headcount: 0, forecast_headcount: 0, cost_impact: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/workforce/forecasts', {
        ...form,
        current_headcount: Number(form.current_headcount),
        forecast_headcount: Number(form.forecast_headcount),
        cost_impact: form.cost_impact === '' ? undefined : Number(form.cost_impact),
      });
      toast.success('Forecast saved');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </Select>
        <Input label="Planning period" required value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Current headcount" type="number" min="0" required value={form.current_headcount} onChange={(e) => setForm({ ...form, current_headcount: e.target.value })} />
        <Input label="Forecast headcount" type="number" min="0" required value={form.forecast_headcount} onChange={(e) => setForm({ ...form, forecast_headcount: e.target.value })} />
        <Input label="Cost impact (INR)" type="number" min="0" value={form.cost_impact} onChange={(e) => setForm({ ...form, cost_impact: e.target.value })} />
      </div>
      <Textarea label="Notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Save forecast</Button></Actions>
    </form>
  );
}

function SkillForm({ skill, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: skill?.employee_id ?? '', skill: skill?.skill ?? '', proficiency: skill?.proficiency ?? 'Intermediate', years_experience: skill?.years_experience ?? 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...form, years_experience: Number(form.years_experience) };
      if (skill) await api.patch(`/workforce/skills/${skill.id}`, payload);
      else await api.post('/workforce/skills', payload);
      toast.success(skill ? 'Skill updated' : 'Skill added');
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
        <Input label="Skill" required value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} />
        <Select label="Proficiency" value={form.proficiency} onChange={(e) => setForm({ ...form, proficiency: e.target.value })}>
          {PROFICIENCY.map((level) => <option key={level} value={level}>{level}</option>)}
        </Select>
      </div>
      <Input label="Years of experience" type="number" min="0" max="60" value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>{skill ? 'Save skill' : 'Add skill'}</Button></Actions>
    </form>
  );
}

function SuccessionForm({ departments, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ position: '', department: departments[0] ?? '', current_holder_id: '', successor_id: '', readiness: '1-2 Years', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/workforce/succession', {
        ...form,
        current_holder_id: form.current_holder_id || null,
        successor_id: form.successor_id,
      });
      toast.success('Succession plan created');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Position" required value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
        <Select label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Current holder" value={form.current_holder_id} onChange={(e) => setForm({ ...form, current_holder_id: e.target.value })}>
          <option value="">Vacant</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
        </Select>
        <Select label="Successor" required value={form.successor_id} onChange={(e) => setForm({ ...form, successor_id: e.target.value })}>
          <option value="">Select successor</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
        </Select>
      </div>
      <Select label="Readiness" value={form.readiness} onChange={(e) => setForm({ ...form, readiness: e.target.value })}>
        {READINESS.map((level) => <option key={level} value={level}>{level}</option>)}
      </Select>
      <Textarea label="Notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Actions><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Create plan</Button></Actions>
    </form>
  );
}

export default function Workforce() {
  const { isHRAdmin } = useAuth();
  const toast = useToast();
  const { employees, employeeMap } = useEmployees();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  const overviewLoader = useCallback(() => api.get('/workforce/overview').then((r) => r.data), []);
  const projectsLoader = useCallback(() => api.get('/workforce/projects').then((r) => r.data), []);
  const allocationsLoader = useCallback(() => api.get('/workforce/allocations').then((r) => r.data), []);
  const forecastsLoader = useCallback(() => api.get('/workforce/forecasts').then((r) => r.data), []);
  const skillsLoader = useCallback(() => api.get('/workforce/skills').then((r) => r.data), []);
  const successionLoader = useCallback(() => api.get('/workforce/succession').then((r) => r.data), []);

  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const projects = useApiResource(projectsLoader, [projectsLoader]);
  const allocations = useApiResource(allocationsLoader, [allocationsLoader], { immediate: tab === 'allocations' || modal === 'allocation' });
  const forecasts = useApiResource(forecastsLoader, [forecastsLoader], { immediate: tab === 'forecasts' });
  const skills = useApiResource(skillsLoader, [skillsLoader], { immediate: tab === 'skills' });
  const succession = useApiResource(successionLoader, [successionLoader], { immediate: tab === 'succession' });

  const departments = useMemo(() => [...new Set(employees.map((employee) => employee.department))].sort(), [employees]);
  const projectList = projects.data ?? [];

  const reloadAll = () => {
    overview.reload();
    projects.reload();
    allocations.reload();
    forecasts.reload();
    skills.reload();
    succession.reload();
  };

  const closeModal = () => setModal(null);

  const deleteProject = async () => {
    setSaving(true);
    try {
      await api.delete(`/workforce/projects/${deleting.id}`);
      toast.success('Project deleted');
      setDeleting(null);
      reloadAll();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const endAllocation = async (allocation) => {
    setSaving(true);
    try {
      await api.patch(`/workforce/allocations/${allocation.id}/end`);
      toast.success('Allocation ended');
      setDeleting(null);
      reloadAll();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const projectColumns = [
    { key: 'name', header: 'Project', render: (row) => <div><p className="font-medium text-slate-900">{row.name}</p><p className="text-[11px] text-slate-500">{row.department}</p></div> },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    { key: 'allocation_count', header: 'People', render: (row) => row.allocation_count ?? 0 },
    { key: 'allocated_percent', header: 'Allocated', render: (row) => <ProgressBar value={Math.min(100, row.allocated_percent ?? 0)} /> },
    { key: 'budget', header: 'Budget', render: (row) => currency(row.budget) },
    { key: 'timeline', header: 'Timeline', render: (row) => `${formatDate(row.start_date)} → ${formatDate(row.end_date)}` },
    ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); setModal({ type: 'project', item: row }); }}>Edit</Button>
        <Button variant="ghost" size="sm" className="text-rose-600" onClick={(event) => { event.stopPropagation(); setDeleting({ type: 'project', item: row }); }}>Delete</Button>
      </div>
    ) }] : []),
  ];

  const allocationColumns = [
    { key: 'employee_name', header: 'Employee' },
    { key: 'project_name', header: 'Project' },
    { key: 'role', header: 'Role', render: (row) => row.role ?? '—' },
    { key: 'allocation_percent', header: 'Allocation', render: (row) => `${row.allocation_percent}%` },
    { key: 'start_date', header: 'Started', render: (row) => formatDate(row.start_date) },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => row.status !== 'Ended' ? <div className="text-right"><Button variant="ghost" size="sm" onClick={() => setDeleting({ type: 'allocation', item: row })}>End</Button></div> : null }] : []),
  ];

  const forecastColumns = [
    { key: 'department', header: 'Department' },
    { key: 'period', header: 'Period' },
    { key: 'current_headcount', header: 'Current' },
    { key: 'forecast_headcount', header: 'Forecast' },
    { key: 'gap', header: 'Gap', render: (row) => <Badge tone={Number(row.gap) > 0 ? 'amber' : 'green'}>{Number(row.gap) > 0 ? `+${row.gap}` : row.gap}</Badge> },
    { key: 'cost_impact', header: 'Cost impact', render: (row) => currency(row.cost_impact) },
    { key: 'notes', header: 'Notes', render: (row) => <span className="line-clamp-2 max-w-xs text-xs text-slate-500">{row.notes || '—'}</span> },
  ];

  const skillColumns = [
    { key: 'employee_name', header: 'Employee' },
    { key: 'skill', header: 'Skill' },
    { key: 'proficiency', header: 'Proficiency', render: (row) => <Badge>{row.proficiency}</Badge> },
    { key: 'years_experience', header: 'Experience', render: (row) => `${row.years_experience ?? 0} yrs` },
    ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => <div className="text-right"><Button variant="ghost" size="sm" onClick={() => setModal({ type: 'skill', item: row })}>Edit</Button></div> }] : []),
  ];

  const successionColumns = [
    { key: 'position', header: 'Position' },
    { key: 'department', header: 'Department' },
    { key: 'current_holder_id', header: 'Current holder', render: (row) => employeeMap.get(row.current_holder_id)?.full_name ?? 'Vacant' },
    { key: 'successor_id', header: 'Successor', render: (row) => employeeMap.get(row.successor_id)?.full_name ?? '—' },
    { key: 'readiness', header: 'Readiness', render: (row) => <Badge>{row.readiness}</Badge> },
    { key: 'notes', header: 'Notes', render: (row) => <span className="line-clamp-2 max-w-xs text-xs text-slate-500">{row.notes || '—'}</span> },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects', count: projectList.length },
    { id: 'allocations', label: 'Allocations' },
    { id: 'forecasts', label: 'Forecasts' },
    { id: 'skills', label: 'Skills' },
    { id: 'succession', label: 'Succession' },
  ];

  return (
    <div>
      <PageHeader
        title="Workforce Planning"
        description="Capacity, project allocation, demand forecasts, skills inventory and succession coverage."
        actions={isHRAdmin ? <Button icon={Plus} onClick={() => setModal({ type: 'project' })}>New project</Button> : null}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' ? (
        overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : overview.loading && !overview.data ? <p className="py-12 text-center text-sm text-slate-500">Loading workforce overview…</p> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Active headcount" value={number(overview.data?.headcount)} icon={Users} />
              <StatCard label="Allocated people" value={number(overview.data?.allocated)} hint={`${number(overview.data?.bench)} on bench`} icon={UserCheck} tone="green" />
              <StatCard label="Utilisation" value={`${overview.data?.utilization ?? 0}%`} hint="Average project allocation" icon={TrendingUp} tone="blue" />
              <StatCard label="Open headcount gap" value={number(overview.data?.open_gap)} hint="Across active forecasts" icon={Target} tone="amber" />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Headcount by department">
                {overview.data?.departments?.length ? (
                  <div className="space-y-3">
                    {overview.data.departments.map((item) => (
                      <div key={item.department}>
                        <div className="mb-1 flex justify-between text-xs"><span className="font-medium text-slate-700">{item.department}</span><span className="text-slate-500">{item.count}</span></div>
                        <ProgressBar value={(item.count / Math.max(1, overview.data.headcount)) * 100} />
                      </div>
                    ))}
                  </div>
                ) : <EmptyState title="No headcount data" />}
              </Card>
              <Card title="Top skills" description="Most common capabilities in scope">
                {overview.data?.top_skills?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {overview.data.top_skills.map((item) => <Badge key={item.skill} tone="blue">{item.skill} · {item.count}</Badge>)}
                  </div>
                ) : <EmptyState title="No skills recorded" description="Add skills from the Skills tab." />}
              </Card>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Active projects" value={number(overview.data?.active_projects)} icon={BriefcaseBusiness} tone="blue" />
              <StatCard label="Succession plans" value={number(overview.data?.succession_plans)} icon={Layers} tone="purple" />
              <StatCard label="Forecast gap" value={number(overview.data?.open_gap)} hint="Net additional heads" icon={Banknote} tone="amber" />
            </div>
          </div>
        )
      ) : null}

      {tab === 'projects' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Projects define where people are allocated and how capacity is consumed.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'project' })}>New project</Button> : null}
          </div>
          {projects.error ? <div className="p-4"><ErrorState error={projects.error} onRetry={projects.reload} /></div> : <DataTable columns={projectColumns} rows={projectList} loading={projects.loading} emptyTitle="No projects yet" emptyDescription="Create a project to begin allocating people." />}
        </Card>
      ) : null}

      {tab === 'allocations' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Allocation percentages show how much of each person is committed to projects.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'allocation' })}>Allocate</Button> : null}
          </div>
          {allocations.error ? <div className="p-4"><ErrorState error={allocations.error} onRetry={allocations.reload} /></div> : <DataTable columns={allocationColumns} rows={allocations.data ?? []} loading={allocations.loading} emptyTitle="No allocations" emptyDescription="Allocate employees to active projects." />}
        </Card>
      ) : null}

      {tab === 'forecasts' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Compare current and required headcount to identify hiring demand.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'forecast' })}>New forecast</Button> : null}
          </div>
          {forecasts.error ? <div className="p-4"><ErrorState error={forecasts.error} onRetry={forecasts.reload} /></div> : <DataTable columns={forecastColumns} rows={forecasts.data ?? []} loading={forecasts.loading} emptyTitle="No forecasts" emptyDescription="Add a demand forecast for the coming period." />}
        </Card>
      ) : null}

      {tab === 'skills' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Skills inventory supports project staffing and succession planning.</p>
            <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'skill' })}>Add skill</Button>
          </div>
          {skills.error ? <div className="p-4"><ErrorState error={skills.error} onRetry={skills.reload} /></div> : <DataTable columns={skillColumns} rows={skills.data ?? []} loading={skills.loading} emptyTitle="No skills recorded" emptyDescription="Add skills to employee profiles." />}
        </Card>
      ) : null}

      {tab === 'succession' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Identify successors and readiness for critical positions.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'succession' })}>New plan</Button> : null}
          </div>
          {succession.error ? <div className="p-4"><ErrorState error={succession.error} onRetry={succession.reload} /></div> : <DataTable columns={successionColumns} rows={succession.data ?? []} loading={succession.loading} emptyTitle="No succession plans" emptyDescription="Create plans for critical roles." />}
        </Card>
      ) : null}

      <Modal open={modal?.type === 'project'} onClose={closeModal} title={modal?.item ? 'Edit project' : 'New workforce project'} size="lg">
        <ProjectForm project={modal?.item} departments={departments} onClose={closeModal} onSaved={() => { closeModal(); reloadAll(); }} />
      </Modal>
      <Modal open={modal?.type === 'allocation'} onClose={closeModal} title="Allocate employee to project" size="md">
        <AllocationForm projects={projectList} onClose={closeModal} onSaved={() => { closeModal(); reloadAll(); }} />
      </Modal>
      <Modal open={modal?.type === 'forecast'} onClose={closeModal} title="New demand forecast" size="md">
        <ForecastForm departments={departments} onClose={closeModal} onSaved={() => { closeModal(); reloadAll(); }} />
      </Modal>
      <Modal open={modal?.type === 'skill'} onClose={closeModal} title={modal?.item ? 'Edit skill' : 'Add employee skill'} size="md">
        <SkillForm skill={modal?.item} onClose={closeModal} onSaved={() => { closeModal(); reloadAll(); }} />
      </Modal>
      <Modal open={modal?.type === 'succession'} onClose={closeModal} title="New succession plan" size="md">
        <SuccessionForm departments={departments} onClose={closeModal} onSaved={() => { closeModal(); reloadAll(); }} />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => (deleting?.type === 'project' ? deleteProject() : endAllocation(deleting?.item))}
        title={deleting?.type === 'project' ? 'Delete project' : 'End allocation'}
        message={deleting?.type === 'project' ? `Deleting ${deleting?.item?.name} also removes its allocations. This cannot be undone.` : `End the allocation for ${deleting?.item?.employee_name} on ${deleting?.item?.project_name}?`}
        confirmLabel={deleting?.type === 'project' ? 'Delete project' : 'End allocation'}
        loading={saving}
      />
    </div>
  );
}
