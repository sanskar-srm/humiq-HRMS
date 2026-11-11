import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, LogIn, LogOut, Plus, Trash2 } from 'lucide-react';
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
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { currentMonth, formatDate, monthLabel, todayISO } from '../../lib/format.js';

const ATTENDANCE_STATUSES = ['Present', 'Late', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Work From Home'];
const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid', 'Maternity', 'Paternity'];

function LeaveForm({ isHRAdmin, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: '', leave_type: 'Casual', start_date: todayISO(), end_date: todayISO(), reason: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/attendance/leaves', { ...form, employee_id: form.employee_id || undefined });
      toast.success('Leave request submitted');
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
      ) : null}
      <Select label="Leave type" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
        {LEAVE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Start date" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        <Input label="End date" type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
      </div>
      <Textarea label="Reason" required rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Submit request</Button></div>
    </form>
  );
}

function DecisionForm({ leave, onClose, onSaved }) {
  const toast = useToast();
  const [decision, setDecision] = useState('Approved');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`/attendance/leaves/${leave.id}/decision`, { decision, note: note || undefined });
      toast.success(`Leave ${decision.toLowerCase()}`);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{leave.employee_name}</p>
        <p>{leave.leave_type} leave · {formatDate(leave.start_date)} to {formatDate(leave.end_date)} · {leave.days} day(s)</p>
        <p className="mt-1">{leave.reason}</p>
      </div>
      <Select label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
        <option value="Approved">Approve</option>
        <option value="Rejected">Reject</option>
      </Select>
      <Textarea label="Decision note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" variant={decision === 'Rejected' ? 'danger' : 'primary'} loading={saving}>{decision === 'Rejected' ? 'Reject leave' : 'Approve leave'}</Button></div>
    </form>
  );
}

function RecordForm({ onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: '', date: todayISO(), clock_in: '09:00', clock_out: '18:00', status: 'Present', overtime_hours: 0, notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/attendance/records', { ...form, clock_in: form.clock_in || null, clock_out: form.clock_out || null, overtime_hours: Number(form.overtime_hours) });
      toast.success('Attendance record added');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Employee" required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
        <option value="">Select employee</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Clock in" type="time" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} />
        <Input label="Clock out" type="time" value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} />
        <Input label="Overtime hours" type="number" min="0" max="24" step="0.25" value={form.overtime_hours} onChange={(e) => setForm({ ...form, overtime_hours: e.target.value })} />
      </div>
      <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Add record</Button></div>
    </form>
  );
}

function ShiftForm({ onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees();
  const [form, setForm] = useState({ employee_id: '', date: todayISO(), shift_name: 'General', start_time: '09:00', end_time: '18:00' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/attendance/shifts', form);
      toast.success('Shift scheduled');
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
        <Input label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Input label="Shift name" required value={form.shift_name} onChange={(e) => setForm({ ...form, shift_name: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Start time" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        <Input label="End time" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Schedule shift</Button></div>
    </form>
  );
}

function HolidayForm({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', date: todayISO(), description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/attendance/holidays', form);
      toast.success('Holiday added');
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Holiday name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving}>Add holiday</Button></div>
    </form>
  );
}

function MonthCalendar({ data }) {
  const month = data?.period ?? currentMonth();
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const records = new Map((data?.records ?? []).map((record) => [record.date, record]));
  const leaves = data?.leaves ?? [];
  const holidays = new Map((data?.holidays ?? []).map((holiday) => [holiday.date, holiday]));
  const days = [];
  for (let index = 0; index < firstWeekday; index += 1) days.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const record = records.get(date);
    const leave = leaves.find((item) => item.start_date <= date && item.end_date >= date);
    days.push({ day, date, record, leave, holiday: holidays.get(date) });
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="py-1.5">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) return <div key={`blank-${index}`} />;
          const status = day.record?.status ?? (day.leave ? 'Leave' : day.holiday ? 'Holiday' : null);
          return (
            <div key={day.date} className={`min-h-[74px] rounded-lg border p-1.5 ${day.holiday ? 'border-violet-200 bg-violet-50' : day.leave ? 'border-violet-100 bg-violet-50/50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">{day.day}</span>
                {status ? <span className={`h-1.5 w-1.5 rounded-full ${status === 'Present' ? 'bg-emerald-500' : status === 'Absent' ? 'bg-rose-500' : 'bg-amber-500'}`} /> : null}
              </div>
              {day.holiday ? <p className="mt-1 line-clamp-2 text-[10px] text-violet-700">{day.holiday.name}</p> : null}
              {day.leave ? <p className="mt-1 text-[10px] text-violet-600">{day.leave.leave_type} leave</p> : null}
              {day.record ? <p className="mt-1 text-[10px] text-slate-500">{day.record.clock_in ?? '—'}–{day.record.clock_out ?? '—'}</p> : null}
              {status ? <p className="mt-1 text-[10px] font-medium text-slate-600">{status}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Attendance() {
  const { user, isHRAdmin, isManager } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [month, setMonth] = useState(currentMonth());
  const [modal, setModal] = useState(null);
  const [decision, setDecision] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  const todayLoader = useCallback(() => api.get('/attendance/today').then((r) => r.data), []);
  const summaryLoader = useCallback(() => api.get('/attendance/summary', { params: { month } }).then((r) => r.data), [month]);
  const recordsLoader = useCallback(() => api.get('/attendance/records', { params: { month } }).then((r) => r.data), [month]);
  const leavesLoader = useCallback(() => api.get('/attendance/leaves').then((r) => r.data), []);
  const teamLoader = useCallback(() => api.get('/attendance/team-leaves').then((r) => r.data), []);
  const shiftsLoader = useCallback(() => api.get('/attendance/shifts').then((r) => r.data), []);
  const holidaysLoader = useCallback(() => api.get('/attendance/holidays').then((r) => r.data), []);
  const calendarLoader = useCallback(() => api.get('/attendance/calendar', { params: { month } }).then((r) => r.data), [month]);

  const today = useApiResource(todayLoader, [todayLoader]);
  const summary = useApiResource(summaryLoader, [summaryLoader]);
  const records = useApiResource(recordsLoader, [recordsLoader], { immediate: tab === 'records' });
  const leaves = useApiResource(leavesLoader, [leavesLoader], { immediate: tab === 'leave' });
  const team = useApiResource(teamLoader, [teamLoader], { immediate: (tab === 'leave') && (isHRAdmin || isManager) });
  const shifts = useApiResource(shiftsLoader, [shiftsLoader], { immediate: tab === 'shifts' });
  const holidays = useApiResource(holidaysLoader, [holidaysLoader], { immediate: tab === 'holidays' || tab === 'calendar' });
  const calendar = useApiResource(calendarLoader, [calendarLoader], { immediate: tab === 'calendar' || tab === 'overview' });

  const reloadAttendance = () => { today.reload(); summary.reload(); records.reload(); calendar.reload(); };

  const clock = async (action) => {
    setSaving(true);
    try {
      await api.post(`/attendance/${action}`);
      toast.success(action === 'clock-in' ? 'Clocked in' : 'Clocked out');
      reloadAttendance();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const cancelLeave = async (leave) => {
    setSaving(true);
    try {
      await api.patch(`/attendance/leaves/${leave.id}/cancel`);
      toast.success('Leave request cancelled');
      setConfirm(null);
      leaves.reload(); team.reload();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const deleteShift = async (shift) => {
    setSaving(true);
    try {
      await api.delete(`/attendance/shifts/${shift.id}`);
      toast.success('Shift deleted');
      setConfirm(null);
      shifts.reload();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const deleteHoliday = async (holiday) => {
    setSaving(true);
    try {
      await api.delete(`/attendance/holidays/${holiday.id}`);
      toast.success('Holiday deleted');
      setConfirm(null);
      holidays.reload();
    } catch (err) { toast.error(getErrorMessage(err)); } finally { setSaving(false); }
  };

  const recordColumns = [
    { key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code} · {row.department}</p></div> },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'clock_in', header: 'In', render: (row) => row.clock_in ?? '—' },
    { key: 'clock_out', header: 'Out', render: (row) => row.clock_out ?? '—' },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    { key: 'overtime_hours', header: 'Overtime', render: (row) => `${row.overtime_hours ?? 0} h` },
  ];

  const leaveColumns = [
    { key: 'employee_name', header: 'Employee', render: (row) => <div><p className="font-medium text-slate-900">{row.employee_name}</p><p className="text-[11px] text-slate-500">{row.employee_code}</p></div> },
    { key: 'leave_type', header: 'Type', render: (row) => <Badge>{row.leave_type}</Badge> },
    { key: 'dates', header: 'Dates', render: (row) => `${formatDate(row.start_date)} → ${formatDate(row.end_date)}` },
    { key: 'days', header: 'Days' },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    { key: 'reason', header: 'Reason', render: (row) => <span className="line-clamp-2 max-w-xs text-xs text-slate-500">{row.reason}</span> },
  ];

  const canDecide = (leave) => leave.status === 'Pending' && leave.employee_id !== user?.id && (isHRAdmin || isManager);

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Clock in and out, track attendance, manage leave requests, shifts and the holiday calendar."
        actions={<Button icon={Plus} onClick={() => setModal('leave')}>Apply for leave</Button>}
      />
      <Tabs
        tabs={[{ id: 'overview', label: 'Overview' }, { id: 'calendar', label: 'My calendar' }, { id: 'records', label: 'Records' }, { id: 'leave', label: 'Leave' }, { id: 'shifts', label: 'Shifts' }, { id: 'holidays', label: 'Holidays' }]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === 'overview' ? (
        <div className="space-y-5">
          <Card title="Today" description="Your attendance for today">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="rounded-full bg-brand-50 p-3 text-brand-600"><Clock className="h-6 w-6" /></span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{today.data?.clock_in ? `Clocked in at ${today.data.clock_in}` : 'Not clocked in yet'}</p>
                  <p className="text-xs text-slate-500">{today.data?.clock_out ? `Clocked out at ${today.data.clock_out}` : today.data?.clock_in ? 'Remember to clock out at the end of the day.' : 'Start your day by clocking in.'}</p>
                  {today.data?.status ? <Badge className="mt-1">{today.data.status}</Badge> : null}
                </div>
              </div>
              <div className="flex gap-2">
                {!today.data?.clock_in ? <Button icon={LogIn} loading={saving} onClick={() => clock('clock-in')}>Clock in</Button> : null}
                {today.data?.clock_in && !today.data?.clock_out ? <Button variant="secondary" icon={LogOut} loading={saving} onClick={() => clock('clock-out')}>Clock out</Button> : null}
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Monthly summary</h2>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          {summary.error ? <ErrorState error={summary.error} onRetry={summary.reload} /> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Present days" value={summary.data?.present ?? 0} icon={CheckCircle2} tone="green" />
              <StatCard label="Absent days" value={summary.data?.absent ?? 0} tone="red" />
              <StatCard label="Late arrivals" value={summary.data?.late ?? 0} tone="amber" />
              <StatCard label="Leave days" value={summary.data?.leave_days ?? 0} tone="purple" />
              <StatCard label="Overtime" value={`${summary.data?.overtime_hours ?? 0} h`} tone="blue" />
            </div>
          )}
          <Card title="Month at a glance" description={monthLabel(month)}>
            {calendar.error ? <ErrorState error={calendar.error} onRetry={calendar.reload} /> : <MonthCalendar data={calendar.data} />}
          </Card>
        </div>
      ) : null}

      {tab === 'calendar' ? (
        <Card
          title={`Attendance calendar — ${monthLabel(month)}`}
          description="Your own attendance, approved leave and holidays"
          action={<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />}
        >
          {calendar.error ? <ErrorState error={calendar.error} onRetry={calendar.reload} /> : <MonthCalendar data={calendar.data} />}
        </Card>
      ) : null}

      {tab === 'records' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
            <p className="text-xs text-slate-500">Records are scoped to your access level.</p>
            {isHRAdmin ? <Button className="ml-auto" size="sm" icon={Plus} onClick={() => setModal('record')}>Add manual record</Button> : null}
          </div>
          {records.error ? <div className="p-4"><ErrorState error={records.error} onRetry={records.reload} /></div> : <DataTable columns={recordColumns} rows={records.data ?? []} loading={records.loading} emptyTitle="No attendance records" emptyDescription="Records appear as employees clock in or are entered manually." />}
        </Card>
      ) : null}

      {tab === 'leave' ? (
        <div className="space-y-5">
          {(isHRAdmin || isManager) && (team.data?.length ?? 0) > 0 ? (
            <Card title="Pending approvals" description="Leave requests from your team awaiting a decision" padded={false}>
              <DataTable columns={[
                ...leaveColumns,
                { key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" onClick={() => setDecision(row)}>Review</Button></div> },
              ]} rows={team.data ?? []} loading={team.loading} compact />
            </Card>
          ) : null}
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <p className="text-xs text-slate-500">Your leave history and requests in scope.</p>
              <Button size="sm" icon={Plus} onClick={() => setModal('leave')}>Apply for leave</Button>
            </div>
            {leaves.error ? <div className="p-4"><ErrorState error={leaves.error} onRetry={leaves.reload} /></div> : (
              <DataTable
                columns={[
                  ...leaveColumns,
                  {
                    key: 'actions',
                    header: '',
                    render: (row) => (
                      <div className="flex justify-end gap-1">
                        {canDecide(row) ? <Button size="sm" onClick={() => setDecision(row)}>Review</Button> : null}
                        {row.employee_id === user?.id && row.status === 'Pending' ? <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setConfirm({ type: 'leave', item: row })}>Cancel</Button> : null}
                      </div>
                    ),
                  },
                ]}
                rows={leaves.data ?? []}
                loading={leaves.loading}
                emptyTitle="No leave requests"
                emptyDescription="Apply for leave using the button above."
              />
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'shifts' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Shift schedules in your access scope.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal('shift')}>Schedule shift</Button> : null}
          </div>
          {shifts.error ? <div className="p-4"><ErrorState error={shifts.error} onRetry={shifts.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'employee_name', header: 'Employee' },
                { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
                { key: 'shift_name', header: 'Shift' },
                { key: 'time', header: 'Time', render: (row) => `${row.start_time} – ${row.end_time}` },
                ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setConfirm({ type: 'shift', item: row })}>Delete</Button></div> }] : []),
              ]}
              rows={shifts.data ?? []}
              loading={shifts.loading}
              emptyTitle="No shifts scheduled"
              emptyDescription="Shift schedules will appear here."
            />
          )}
        </Card>
      ) : null}

      {tab === 'holidays' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Company holiday calendar.</p>
            {isHRAdmin ? <Button size="sm" icon={Plus} onClick={() => setModal('holiday')}>Add holiday</Button> : null}
          </div>
          {holidays.error ? <div className="p-4"><ErrorState error={holidays.error} onRetry={holidays.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'name', header: 'Holiday', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
                { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
                { key: 'description', header: 'Description', render: (row) => row.description ?? '—' },
                ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setConfirm({ type: 'holiday', item: row })}>Delete</Button></div> }] : []),
              ]}
              rows={holidays.data ?? []}
              loading={holidays.loading}
              emptyTitle="No holidays configured"
              emptyDescription="Add public holidays to the calendar."
            />
          )}
        </Card>
      ) : null}

      <Modal open={modal === 'leave'} onClose={() => setModal(null)} title="Apply for leave" size="md">
        <LeaveForm isHRAdmin={isHRAdmin} onClose={() => setModal(null)} onSaved={() => { setModal(null); leaves.reload(); team.reload(); summary.reload(); }} />
      </Modal>
      <Modal open={modal === 'record'} onClose={() => setModal(null)} title="Add manual attendance" size="md">
        <RecordForm onClose={() => setModal(null)} onSaved={() => { setModal(null); records.reload(); summary.reload(); }} />
      </Modal>
      <Modal open={modal === 'shift'} onClose={() => setModal(null)} title="Schedule shift" size="md">
        <ShiftForm onClose={() => setModal(null)} onSaved={() => { setModal(null); shifts.reload(); }} />
      </Modal>
      <Modal open={modal === 'holiday'} onClose={() => setModal(null)} title="Add holiday" size="md">
        <HolidayForm onClose={() => setModal(null)} onSaved={() => { setModal(null); holidays.reload(); calendar.reload(); }} />
      </Modal>

      <Modal open={Boolean(decision)} onClose={() => setDecision(null)} title="Leave decision" size="sm">
        {decision ? <DecisionForm leave={decision} onClose={() => setDecision(null)} onSaved={() => { setDecision(null); leaves.reload(); team.reload(); summary.reload(); }} /> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm?.type === 'leave' ? cancelLeave(confirm.item) : confirm?.type === 'shift' ? deleteShift(confirm.item) : deleteHoliday(confirm.item))}
        title={confirm?.type === 'leave' ? 'Cancel leave request' : confirm?.type === 'shift' ? 'Delete shift' : 'Delete holiday'}
        message={confirm?.type === 'leave' ? 'Cancel this pending leave request?' : confirm?.type === 'shift' ? 'Remove this scheduled shift?' : `Remove ${confirm?.item?.name} from the holiday calendar?`}
        confirmLabel="Confirm"
        loading={saving}
      />
    </div>
  );
}
