import { useCallback, useState } from 'react';
import { BookOpen, GraduationCap, Plus, Trophy } from 'lucide-react';
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
import ProgressBar from '../../components/ui/ProgressBar.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { formatDate, todayISO } from '../../lib/format.js';

function CourseForm({ course, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: course?.title ?? '',
    description: course?.description ?? '',
    duration_hours: course?.duration_hours ?? 1,
    category: course?.category ?? '',
    status: course?.status ?? 'Draft',
    content: course?.content ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, duration_hours: Number(form.duration_hours) };
      if (course) await api.patch(`/lms/courses/${course.id}`, payload);
      else await api.post('/lms/courses', payload);
      toast.success(course ? 'Course updated' : 'Course created');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Duration (hours)" type="number" min="0.1" value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} />
        <Input label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      </div>
      <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        {['Draft', 'Published', 'Archived'].map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Textarea label="Course content" rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={saving}>{course ? 'Save' : 'Create'}</Button>
      </div>
    </form>
  );
}

function AssignForm({ courses, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees(true);
  const published = courses.filter((c) => c.status === 'Published');
  const [form, setForm] = useState({ course_id: published[0]?.id ?? '', employee_ids: [], due_date: todayISO() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toggle = (id) => setForm((f) => ({
    ...f,
    employee_ids: f.employee_ids.includes(id) ? f.employee_ids.filter((x) => x !== id) : [...f.employee_ids, id],
  }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.employee_ids.length) { setError('Select employees'); return; }
    setSaving(true);
    try {
      await api.post('/lms/assignments', { course_id: form.course_id, employee_ids: form.employee_ids, due_date: form.due_date });
      toast.success('Training assigned');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  if (!published.length) return <p className="text-sm text-slate-500">Publish a course before assigning.</p>;
  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Course" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
        {published.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </Select>
      <Input label="Due date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
      <div className="max-h-48 overflow-y-auto rounded border p-2 text-xs">
        {employees.map((emp) => (
          <label key={emp.id} className="flex gap-2 py-1">
            <input type="checkbox" checked={form.employee_ids.includes(emp.id)} onChange={() => toggle(emp.id)} />
            {emp.full_name}
          </label>
        ))}
      </div>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Assign</Button></div>
    </form>
  );
}

export default function Lms() {
  const { isHRAdmin, isStaffAgent } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);

  const overviewLoader = useCallback(() => api.get('/lms/overview').then((r) => r.data), []);
  const coursesLoader = useCallback(() => api.get('/lms/courses').then((r) => r.data), []);
  const assignmentsLoader = useCallback(() => api.get('/lms/assignments').then((r) => r.data), []);
  const announcementsLoader = useCallback(() => api.get('/lms/announcements').then((r) => r.data), []);
  const certsLoader = useCallback(() => api.get('/lms/certificates').then((r) => r.data), []);

  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const courses = useApiResource(coursesLoader, [coursesLoader], { immediate: tab === 'catalog' || modal === 'assign' });
  const assignments = useApiResource(assignmentsLoader, [assignmentsLoader], { immediate: tab === 'learning' });
  const announcements = useApiResource(announcementsLoader, [announcementsLoader], { immediate: tab === 'announcements' });
  const certs = useApiResource(certsLoader, [certsLoader], { immediate: tab === 'certificates' });

  const updateProgress = async (row) => {
    const progress = window.prompt('Progress 0–100', String(row.progress ?? 0));
    if (progress === null) return;
    try {
      await api.patch(`/lms/assignments/${row.id}`, { progress: Number(progress) });
      toast.success('Progress saved');
      assignments.reload();
      overview.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'learning', label: 'My learning' },
    { id: 'catalog', label: isHRAdmin ? 'Course catalog' : 'Courses' },
    { id: 'certificates', label: 'Certificates' },
    { id: 'announcements', label: 'Announcements' },
  ];

  return (
    <div>
      <PageHeader
        title="Learning (LMS)"
        description="Courses, assignments, progress and certificates."
        actions={(
          <div className="flex gap-2">
            {isHRAdmin ? <Button icon={Plus} onClick={() => setModal('course')}>New course</Button> : null}
            {isStaffAgent ? <Button variant="secondary" icon={BookOpen} onClick={() => setModal('assign')}>Assign training</Button> : null}
          </div>
        )}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' && (overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overview.data?.mode === 'admin' ? (
            <>
              <StatCard label="Published courses" value={overview.data?.published_courses ?? 0} icon={BookOpen} />
              <StatCard label="Assignments" value={overview.data?.assignments_total ?? 0} icon={GraduationCap} />
              <StatCard label="In progress" value={overview.data?.in_progress ?? 0} icon={GraduationCap} tone="amber" />
              <StatCard label="Completed" value={overview.data?.completed ?? 0} icon={Trophy} tone="green" />
            </>
          ) : (
            <>
              <StatCard label="Assigned" value={overview.data?.my_assigned ?? 0} icon={BookOpen} />
              <StatCard label="In progress" value={overview.data?.my_in_progress ?? 0} icon={GraduationCap} tone="amber" />
              <StatCard label="Completed" value={overview.data?.my_completed ?? 0} icon={Trophy} tone="green" />
              {isStaffAgent ? <StatCard label="Team open" value={overview.data?.team_open ?? 0} icon={GraduationCap} /> : null}
            </>
          )}
        </div>
      ))}

      {tab === 'learning' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'course_title', header: 'Course' },
              { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              { key: 'progress', header: 'Progress', render: (r) => <div className="w-28"><ProgressBar value={r.progress} label={`${r.progress}%`} /></div> },
              { key: 'due_date', header: 'Due', render: (r) => formatDate(r.due_date) },
              { key: 'actions', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => updateProgress(r)}>Update</Button> },
            ]}
            rows={assignments.data ?? []}
            loading={assignments.loading}
            emptyTitle="No assignments"
          />
        </Card>
      )}

      {tab === 'catalog' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'title', header: 'Course', render: (r) => <span className="font-medium">{r.title}</span> },
              { key: 'category', header: 'Category' },
              { key: 'duration_hours', header: 'Hours' },
              { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
              ...(isHRAdmin ? [{ key: 'actions', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'course', item: r })}>Edit</Button> }] : []),
            ]}
            rows={courses.data ?? []}
            loading={courses.loading}
            emptyTitle="No courses"
          />
        </Card>
      )}

      {tab === 'certificates' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'certificate_name', header: 'Certificate' },
              { key: 'course_title', header: 'Course' },
              { key: 'issued_at', header: 'Issued', render: (r) => formatDate(r.issued_at) },
              { key: 'expires_at', header: 'Expires', render: (r) => formatDate(r.expires_at) },
            ]}
            rows={certs.data ?? []}
            loading={certs.loading}
            emptyTitle="No certificates"
          />
        </Card>
      )}

      {tab === 'announcements' && (
        <Card padded={false}>
          <DataTable
            columns={[
              { key: 'title', header: 'Title' },
              { key: 'body', header: 'Message', render: (r) => <span className="line-clamp-2 text-xs">{r.body}</span> },
              { key: 'published_at', header: 'Published', render: (r) => formatDate(r.published_at) },
            ]}
            rows={announcements.data ?? []}
            loading={announcements.loading}
            emptyTitle="No announcements"
          />
        </Card>
      )}

      <Modal open={modal === 'course' || modal?.type === 'course'} onClose={() => setModal(null)} title={modal?.item ? 'Edit course' : 'New course'} size="lg">
        <CourseForm course={modal?.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); courses.reload(); overview.reload(); }} />
      </Modal>
      <Modal open={modal === 'assign'} onClose={() => setModal(null)} title="Assign training" size="md">
        <AssignForm courses={courses.data ?? []} onClose={() => setModal(null)} onSaved={() => { setModal(null); assignments.reload(); overview.reload(); }} />
      </Modal>
    </div>
  );
}
