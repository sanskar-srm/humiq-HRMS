import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Users,
  Wallet,
  LifeBuoy,
  Target,
  BriefcaseBusiness,
  UserPlus,
  Radio,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import { api } from '../../services/api.js';
import useApiResource from '../../hooks/useApiResource.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import PageLoader from '../../components/ui/Spinner.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { formatDateTime, number } from '../../lib/format.js';

const POLL_MS = 15_000;

const CHART_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#a855f7', '#f43f5e', '#64748b'];

const iconMap = {
  employees: Users,
  team: Users,
  new_hires: UserPlus,
  attendance: CalendarClock,
  leaves: CalendarClock,
  tickets: LifeBuoy,
  requisitions: BriefcaseBusiness,
  onboarding: UserPlus,
  payroll: Wallet,
  reimbursements: Wallet,
  reviews: Target,
  goals: Target,
  payslip: Wallet,
};

const toneMap = {
  employees: 'brand',
  team: 'brand',
  new_hires: 'green',
  attendance: 'blue',
  leaves: 'amber',
  tickets: 'purple',
  requisitions: 'blue',
  onboarding: 'green',
  payroll: 'amber',
  reimbursements: 'amber',
  reviews: 'purple',
  goals: 'green',
  payslip: 'amber',
};

const quickLinks = [
  { to: '/attendance', label: 'Attendance & leave', icon: CalendarClock, roles: ['Admin', 'HR', 'Manager', 'Employee'] },
  { to: '/payroll', label: 'Payroll & payslips', icon: Wallet, roles: ['Admin', 'HR', 'Manager', 'Employee'] },
  { to: '/recruitment', label: 'Hiring pipeline', icon: BriefcaseBusiness, roles: ['Admin', 'HR', 'Manager'] },
  { to: '/performance', label: 'Goals & reviews', icon: Target, roles: ['Admin', 'HR', 'Manager', 'Employee'] },
  { to: '/onboarding', label: 'Onboarding tasks', icon: ClipboardList, roles: ['Admin', 'HR', 'Manager', 'Employee'] },
  { to: '/helpdesk', label: 'Get support', icon: LifeBuoy, roles: ['Admin', 'HR', 'Manager', 'Employee'] },
];

const numericStatValue = (val) => {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && /^\d+$/.test(val.trim())) return Number(val);
  return null;
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-card">
      {label ? <p className="mb-1 font-medium text-slate-800">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} className="text-slate-600">
          <span style={{ color: entry.color }}>{entry.name}: </span>
          {number(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [lastSynced, setLastSynced] = useState(null);
  const loader = useCallback(
    () => api.get('/dashboard/summary').then((response) => {
      setLastSynced(new Date());
      return response.data;
    }),
    [],
  );
  const { data, loading, error, reload } = useApiResource(loader, [], { pollInterval: POLL_MS });

  const departmentChart = useMemo(
    () => (data?.departments ?? []).map((item) => ({
      name: item.department.length > 14 ? `${item.department.slice(0, 12)}…` : item.department,
      fullName: item.department,
      count: item.count,
    })),
    [data?.departments],
  );

  const workloadPie = useMemo(() => {
    const stats = data?.stats ?? [];
    return stats
      .map((stat) => ({ name: stat.label, value: numericStatValue(stat.value), key: stat.key }))
      .filter((item) => item.value !== null && item.value > 0)
      .slice(0, 8);
  }, [data?.stats]);

  const attendancePct = useMemo(() => {
    const total = data?.scope?.employee_count ?? 0;
    const today = data?.attendance_today ?? 0;
    if (!total) return 0;
    return Math.min(100, Math.round((today / total) * 100));
  }, [data?.attendance_today, data?.scope?.employee_count]);

  const radialData = useMemo(() => [{ name: 'Today', value: attendancePct, fill: '#6366f1' }], [attendancePct]);

  if (loading && !data) return <PageLoader label="Loading your workspace…" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const roleLabel = data?.scope?.all ? 'organization-wide view' : data?.role === 'Manager' ? 'your team view' : 'your personal view';

  return (
    <div>
      <PageHeader
        title={`${greeting}, ${user?.full_name?.split(' ')[0] ?? 'there'}`}
        description={`Here is ${roleLabel} for today. ${data?.scope?.employee_count ? `${data.scope.employee_count} ${data.scope.employee_count === 1 ? 'person is' : 'people are'} in your access scope.` : ''}`}
        actions={(
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="live-pulse inline-flex h-2 w-2 rounded-full bg-emerald-500" title="Live data" />
            <Radio className="h-3.5 w-3.5 text-brand-600" aria-hidden />
            <span>
              Live
              {lastSynced ? ` · updated ${formatDateTime(lastSynced.toISOString())}` : ''}
            </span>
          </div>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {(data?.stats ?? []).map((stat) => (
          <StatCard
            key={stat.key}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            icon={iconMap[stat.key] ?? ClipboardList}
            tone={toneMap[stat.key] ?? 'brand'}
            wobble
          />
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Headcount by department" description="Live distribution from the database" className="xl:col-span-2">
          {departmentChart.length ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentChart} margin={{ top: 8, right: 8, left: -12, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} angle={-28} textAnchor="end" height={56} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} width={36} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(99 102 241 / 0.06)' }} />
                  <Bar dataKey="count" name="Employees" fill="#6366f1" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No headcount data" description="Department distribution appears once employees are added." />
          )}
        </Card>

        <Card title="Attendance today" description="Clock-ins vs scope headcount">
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="68%"
                outerRadius="100%"
                data={radialData}
                startAngle={220}
                endAngle={-40}
                barSize={14}
              >
                <RadialBar background={{ fill: '#f1f5f9' }} dataKey="value" cornerRadius={8} animationDuration={900} />
                <text x="50%" y="46%" textAnchor="middle" className="fill-slate-900 text-2xl font-semibold">
                  {attendancePct}%
                </text>
                <text x="50%" y="58%" textAnchor="middle" className="fill-slate-500 text-[11px]">
                  {data?.attendance_today ?? 0} / {data?.scope?.employee_count ?? 0}
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Workload mix" description="Numeric KPIs in your current view" className="xl:col-span-1">
          {workloadPie.length ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={workloadPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={3}
                    animationDuration={800}
                  >
                    {workloadPie.map((entry, index) => (
                      <Cell key={entry.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No numeric metrics" description="Charts appear when stats return countable values." />
          )}
        </Card>

        <Card title="Quick actions" description="Common workflows for your role" className="xl:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {quickLinks.filter((link) => link.roles.includes(user?.role)).map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.to} to={link.to} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition hover:border-brand-200 hover:bg-brand-50/50">
                  <span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Icon className="h-4 w-4" /></span>
                  <span className="flex-1">{link.label}</span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card title="Notifications" description="Items that may need your attention" className="xl:col-span-1">
          {data?.notifications?.length ? (
            <div className="space-y-2">
              {data.notifications.map((notification, index) => (
                <Link key={`${notification.type}-${index}`} to={notification.to} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-700 hover:border-brand-200">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500 live-pulse" />
                  {notification.message}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="You are all caught up" description="No pending notifications right now." />
          )}
        </Card>

        <Card title="Recent activity" description="Audit trail across the organisation" className="xl:col-span-2">
          {data?.recent_activity?.length ? (
            <div className="space-y-3">
              {data.recent_activity.map((activity) => (
                <div key={activity.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800">{activity.action.replaceAll('_', ' ')}</p>
                    <p className="text-[11px] text-slate-500">{activity.entity_type} · {formatDateTime(activity.created_at)}</p>
                  </div>
                  <Badge tone="slate">{activity.entity_type}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No recent activity" description="Administrative actions will appear here as they happen." />
          )}
        </Card>
      </div>

      {data?.scope?.all === false && data?.role === 'Manager' ? (
        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-xs text-brand-800">
          You are viewing your team scope. Employee records, attendance, compensation and payroll are automatically filtered by the server to your reporting line.
        </div>
      ) : null}
    </div>
  );
}
