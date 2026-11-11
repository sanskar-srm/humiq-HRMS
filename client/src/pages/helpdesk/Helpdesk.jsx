import { useCallback, useMemo, useState } from 'react';
import {
  BarChart3, BookOpen, CheckCircle2, Clock, Download, FileText, LifeBuoy, MessageSquare, Plus,
  Send, ShieldCheck, Star, ThumbsDown, ThumbsUp, Ticket, Users,
} from 'lucide-react';
import { api, getErrorMessage } from '../../services/api.js';
import useApiResource from '../../hooks/useApiResource.js';
import useEmployees from '../../hooks/useEmployees.js';
import useDebounce from '../../hooks/useDebounce.js';
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
import SearchInput from '../../components/ui/SearchInput.jsx';
import { Input, Select, Textarea } from '../../components/ui/Field.jsx';
import { formatDate, formatDateTime, todayISO } from '../../lib/format.js';

const TICKET_STATUSES = ['Open', 'In Progress', 'Pending', 'Escalated', 'Resolved', 'Closed'];
const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const DOCUMENT_TYPES = ['Salary Certificate', 'Experience Letter', 'NOC', 'Form 16', 'Other'];

function TicketForm({ categories, isHRAdmin, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees(isHRAdmin);
  const activeCategories = categories.filter((category) => category.active !== false);
  const [form, setForm] = useState({
    employee_id: '',
    category_id: activeCategories[0]?.id ?? '',
    subject: '',
    description: '',
    priority: 'Medium',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/helpdesk/tickets', {
        ...form,
        employee_id: form.employee_id || undefined,
      });
      toast.success('Support ticket created');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!activeCategories.length) {
    return (
      <div>
        <EmptyState title="No support categories" description="Admin or HR must configure a ticket category before tickets can be raised." />
        <div className="mt-3 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {isHRAdmin ? (
        <Select label="Raise for" value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}>
          <option value="">Myself</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_code}</option>)}
        </Select>
      ) : null}
      <Select label="Category" required value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
        {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name} · {category.department} · {category.sla_hours}h SLA</option>)}
      </Select>
      <Input label="Subject" required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Short summary of the issue" />
      <Textarea label="Description" required rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Include what happened and what you have already tried." />
      <Select label="Priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
        {TICKET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </Select>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Create ticket</Button>
      </div>
    </form>
  );
}

function TicketControls({ ticket, isHRAdmin, onUpdated }) {
  const toast = useToast();
  const { employees } = useEmployees(true);
  const [form, setForm] = useState({
    status: ticket.status ?? 'Open',
    priority: ticket.priority ?? 'Medium',
    assigned_to: ticket.assigned_to ?? '',
    escalation_reason: ticket.escalation_reason ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const knownAssignee = employees.some((employee) => employee.id === form.assigned_to);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/helpdesk/tickets/${ticket.id}`, {
        ...form,
        assigned_to: form.assigned_to || null,
        escalation_reason: form.status === 'Escalated' ? form.escalation_reason || undefined : undefined,
      });
      toast.success('Ticket updated');
      onUpdated();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agent controls</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          {TICKET_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </Select>
        <Select label="Priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
          {TICKET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
        </Select>
      </div>
      <Select label="Assignee" value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}>
        <option value="">Unassigned</option>
        {!knownAssignee && form.assigned_to ? <option value={form.assigned_to}>{ticket.assignee_name ?? 'Current assignee'}</option> : null}
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.department}</option>)}
      </Select>
      {form.status === 'Escalated' ? (
        <Input label="Escalation reason" value={form.escalation_reason} onChange={(event) => setForm({ ...form, escalation_reason: event.target.value })} />
      ) : null}
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end"><Button size="sm" type="submit" loading={saving}>Save ticket</Button></div>
    </form>
  );
}

function CommentForm({ ticket, isStaffAgent, onAdded }) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/helpdesk/tickets/${ticket.id}/comments`, { message, is_internal: internal });
      setMessage('');
      toast.success('Comment added');
      onAdded();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <Textarea label="Add a comment" rows={3} required value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Share an update or ask a question…" />
      {isStaffAgent ? (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
          Internal note (visible to support agents only)
        </label>
      ) : null}
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end"><Button size="sm" type="submit" icon={Send} loading={saving}>Post comment</Button></div>
    </form>
  );
}

function CsatForm({ ticket, onSubmitted }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/helpdesk/tickets/${ticket.id}/csat`, { rating: Number(rating), comment: comment || undefined });
      toast.success('Thank you for your feedback');
      onSubmitted();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Rate this support experience</p>
      <Select label="Rating" value={rating} onChange={(event) => setRating(event.target.value)}>
        {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? '' : 's'}</option>)}
      </Select>
      <Textarea label="Comment (optional)" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end"><Button size="sm" type="submit" icon={Star} loading={saving}>Submit feedback</Button></div>
    </form>
  );
}

function TicketDetail({ ticketId, onClose, onChanged }) {
  const { user, isStaffAgent } = useAuth();
  const toast = useToast();
  const loader = useCallback(() => api.get(`/helpdesk/tickets/${ticketId}`).then((response) => response.data), [ticketId]);
  const resource = useApiResource(loader, [loader]);
  const ticket = resource.data;
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const refresh = () => {
    resource.reload();
    onChanged();
  };

  const closeOwnTicket = async () => {
    setClosing(true);
    try {
      await api.patch(`/helpdesk/tickets/${ticketId}/close`);
      toast.success('Ticket closed');
      setConfirmClose(false);
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setClosing(false);
    }
  };

  const isOwner = ticket?.employee_id === user?.id;
  const canCloseOwn = isOwner && ticket?.status !== 'Closed';
  const canSubmitCsat = isOwner && ['Resolved', 'Closed'].includes(ticket?.status) && !ticket?.csat_rating;

  return (
    <Modal open onClose={onClose} title={ticket ? `${ticket.ticket_no} · ${ticket.subject}` : 'Support ticket'} size="xl">
      {resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} /> : resource.loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading ticket…</div>
      ) : ticket ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{ticket.status}</Badge>
            <Badge>{ticket.priority}</Badge>
            <Badge tone={ticket.sla_breached ? 'red' : 'green'}>{ticket.sla_breached ? 'SLA breached' : 'Within SLA'}</Badge>
            {ticket.csat_rating ? <Badge tone="amber">{ticket.csat_rating} / 5 CSAT</Badge> : null}
          </div>

          <DetailList
            items={[
              { label: 'Raised by', value: `${ticket.employee_name} · ${ticket.employee_code}` },
              { label: 'Department', value: ticket.department },
              { label: 'Category', value: ticket.category_name },
              { label: 'Assigned to', value: ticket.assignee_name ?? 'Unassigned' },
              { label: 'Created', value: formatDateTime(ticket.created_at) },
              { label: 'SLA due', value: formatDateTime(ticket.sla_due_at) },
            ]}
          />

          <div className="rounded-lg bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Description</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{ticket.description}</p>
          </div>

          {isStaffAgent ? <TicketControls ticket={ticket} isHRAdmin={false} onUpdated={refresh} /> : null}

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Conversation</p>
            {ticket.comments?.length ? (
              <div className="space-y-2">
                {ticket.comments.map((comment) => (
                  <div key={comment.id} className={`rounded-lg border px-3 py-2 ${comment.is_internal ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-800">{comment.author_name}{comment.is_internal ? ' · internal note' : ''}</p>
                      <p className="text-[10px] text-slate-400">{formatDateTime(comment.created_at)}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{comment.message}</p>
                  </div>
                ))}
              </div>
            ) : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">No comments yet.</p>}
            <div className="mt-3"><CommentForm ticket={ticket} isStaffAgent={isStaffAgent} onAdded={refresh} /></div>
          </div>

          {canSubmitCsat ? <CsatForm ticket={ticket} onSubmitted={refresh} /> : null}

          {canCloseOwn ? (
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button size="sm" variant="secondary" onClick={() => setConfirmClose(true)}>Close my ticket</Button>
            </div>
          ) : null}
        </div>
      ) : <EmptyState title="Ticket unavailable" />}
      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={closeOwnTicket}
        loading={closing}
        title="Close this ticket?"
        message="Closing confirms that your issue is resolved. You can add a comment later to reopen the conversation."
        confirmLabel="Close ticket"
        danger={false}
      />
    </Modal>
  );
}

function ArticleForm({ article, categories, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: article?.title ?? '',
    category_id: article?.category_id ?? categories[0]?.id ?? '',
    content: article?.content ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (article) await api.patch(`/helpdesk/kb/articles/${article.id}`, form);
      else await api.post('/helpdesk/kb/articles', form);
      toast.success(article ? 'Article saved' : 'Article draft created');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!categories.length) {
    return (
      <div>
        <EmptyState title="No article categories" description="Create a ticket category before writing knowledge-base articles." />
        <div className="mt-3 flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Title" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
      <Select label="Category" required value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name} · {category.department}</option>)}
      </Select>
      <Textarea label="Article content" required rows={10} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{article ? 'Save article' : 'Create draft'}</Button>
      </div>
    </form>
  );
}

function ArticleDetail({ article, isHRAdmin, onClose, onChanged, onEdit, onDelete }) {
  const toast = useToast();
  const { user } = useAuth();
  const [current, setCurrent] = useState(article);
  const [busy, setBusy] = useState(false);

  const isAuthor = current.author_id === user?.id;
  const canEdit = isHRAdmin || (isAuthor && ['Draft', 'Awaiting Review'].includes(current.status));
  const canReview = isAuthor && !isHRAdmin && current.status === 'Draft';

  const reloadArticle = async () => {
    const response = await api.get(`/helpdesk/kb/articles/${current.id}`);
    setCurrent(response.data);
    onChanged();
  };

  const vote = async (value) => {
    setBusy(true);
    try {
      await api.post(`/helpdesk/kb/articles/${current.id}/vote`, { vote: value });
      await reloadArticle();
      toast.success('Thanks for your feedback');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await api.patch(`/helpdesk/kb/articles/${current.id}`, { status });
      toast.success(`Article marked ${status.toLowerCase()}`);
      onChanged();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{current.status}</Badge>
        <Badge tone="blue">{current.category_name}</Badge>
        <span className="text-[11px] text-slate-500">By {current.author_name} · {formatDate(current.published_at || current.created_at)}</span>
      </div>
      <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">{current.content}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
        <p className="text-xs text-slate-500">Was this article helpful?</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" icon={ThumbsUp} loading={busy} onClick={() => vote('Helpful')}>Helpful ({current.helpful_votes ?? 0})</Button>
          <Button size="sm" variant="ghost" icon={ThumbsDown} loading={busy} onClick={() => vote('Not Helpful')}>Not helpful ({current.not_helpful_votes ?? 0})</Button>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
        {canEdit ? <Button size="sm" variant="secondary" onClick={() => onEdit(current)}>Edit article</Button> : null}
        {canReview && current.status === 'Draft' ? <Button size="sm" variant="secondary" onClick={() => changeStatus('Awaiting Review')} loading={busy}>Submit for review</Button> : null}
        {isHRAdmin && current.status !== 'Published' ? <Button size="sm" onClick={() => changeStatus('Published')} loading={busy}>Publish</Button> : null}
        {isHRAdmin && current.status === 'Published' ? <Button size="sm" variant="secondary" onClick={() => changeStatus('Archived')} loading={busy}>Archive</Button> : null}
        {isHRAdmin ? <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => onDelete(current)}>Delete</Button> : null}
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function DocumentRequestForm({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ document_type: DOCUMENT_TYPES[0], reason: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/helpdesk/documents/requests', { ...form, reason: form.reason || undefined });
      toast.success('Document requested');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Select label="Document type" value={form.document_type} onChange={(event) => setForm({ ...form, document_type: event.target.value })}>
        {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </Select>
      <Textarea label="Reason (optional)" rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="e.g. Bank loan application" />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Request document</Button>
      </div>
    </form>
  );
}

function IssueDocumentForm({ request, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ document_type: request.document_type, note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.patch(`/helpdesk/documents/requests/${request.id}`, { ...form, note: form.note || undefined });
      toast.success('Document issued');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{request.employee_name}</p>
        <p>{request.document_type} · requested {formatDate(request.created_at)}</p>
        {request.reason ? <p className="mt-1">{request.reason}</p> : null}
      </div>
      <Select label="Document type" value={form.document_type} onChange={(event) => setForm({ ...form, document_type: event.target.value })}>
        {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </Select>
      <Textarea label="Note on the document" rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Optional wording included in the issued letter." />
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>Issue document</Button>
      </div>
    </form>
  );
}

function CategoryForm({ category, departments, onClose, onSaved }) {
  const toast = useToast();
  const { employees } = useEmployees(true);
  const [form, setForm] = useState({
    name: category?.name ?? '',
    department: category?.department ?? departments[0] ?? '',
    sla_hours: category?.sla_hours ?? 24,
    default_assignee_id: category?.default_assignee_id ?? '',
    active: category?.active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        sla_hours: Number(form.sla_hours),
        default_assignee_id: form.default_assignee_id || null,
      };
      if (category) await api.patch(`/helpdesk/categories/${category.id}`, payload);
      else await api.post('/helpdesk/categories', payload);
      toast.success(category ? 'Category updated' : 'Category created');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <Input label="Category name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Department" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </Select>
        <Input label="SLA hours" type="number" min="1" max="720" required value={form.sla_hours} onChange={(event) => setForm({ ...form, sla_hours: event.target.value })} />
      </div>
      <Select label="Default assignee" value={form.default_assignee_id} onChange={(event) => setForm({ ...form, default_assignee_id: event.target.value })}>
        <option value="">Unassigned</option>
        {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.department}</option>)}
      </Select>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
        Available for new tickets
      </label>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{category ? 'Save category' : 'Create category'}</Button>
      </div>
    </form>
  );
}

export default function Helpdesk() {
  const { isHRAdmin, isStaffAgent } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);
  const [ticketId, setTicketId] = useState(null);
  const [article, setArticle] = useState(null);
  const [deleteArticle, setDeleteArticle] = useState(null);
  const [issueRequest, setIssueRequest] = useState(null);
  const [ticketStatus, setTicketStatus] = useState('');
  const [ticketPriority, setTicketPriority] = useState('');
  const [articleSearch, setArticleSearch] = useState('');
  const [articleCategory, setArticleCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const debouncedSearch = useDebounce(articleSearch);
  const { employees } = useEmployees();

  const overviewLoader = useCallback(() => api.get('/helpdesk/overview').then((response) => response.data), []);
  const categoriesLoader = useCallback(() => api.get('/helpdesk/categories').then((response) => response.data), []);
  const ticketsLoader = useCallback(() => api.get('/helpdesk/tickets', { params: { status: ticketStatus || undefined, priority: ticketPriority || undefined } }).then((response) => response.data), [ticketStatus, ticketPriority]);
  const articlesLoader = useCallback(() => api.get('/helpdesk/kb/articles', { params: { search: debouncedSearch || undefined, category_id: articleCategory || undefined } }).then((response) => response.data), [debouncedSearch, articleCategory]);
  const documentsLoader = useCallback(() => api.get('/helpdesk/documents').then((response) => response.data), []);
  const requestsLoader = useCallback(() => api.get('/helpdesk/documents/requests').then((response) => response.data), []);
  const analyticsLoader = useCallback(() => api.get('/helpdesk/analytics').then((response) => response.data), []);

  const overview = useApiResource(overviewLoader, [overviewLoader]);
  const categories = useApiResource(categoriesLoader, [categoriesLoader]);
  const tickets = useApiResource(ticketsLoader, [ticketsLoader], { immediate: tab === 'tickets' || tab === 'overview' });
  const articles = useApiResource(articlesLoader, [articlesLoader], { immediate: tab === 'knowledge' });
  const documents = useApiResource(documentsLoader, [documentsLoader], { immediate: tab === 'documents' });
  const requests = useApiResource(requestsLoader, [requestsLoader], { immediate: tab === 'documents' });
  const analytics = useApiResource(analyticsLoader, [analyticsLoader], { immediate: isStaffAgent && tab === 'analytics' });

  const categoryList = categories.data ?? [];
  const ticketList = tickets.data ?? [];
  const articleList = articles.data ?? [];
  const documentList = documents.data ?? [];
  const requestList = requests.data ?? [];

  const departments = useMemo(() => [...new Set(employees.map((employee) => employee.department).filter(Boolean))].sort(), [employees]);

  const refreshTickets = () => {
    tickets.reload();
    overview.reload();
  };

  const refreshArticles = () => {
    articles.reload();
  };

  const downloadDocument = async (document) => {
    try {
      await api.download(document.download_path || `/helpdesk/documents/${document.id}/download`);
      toast.success('Document download started');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const removeArticle = async () => {
    if (!deleteArticle) return;
    setSaving(true);
    try {
      await api.delete(`/helpdesk/kb/articles/${deleteArticle.id}`);
      toast.success('Article deleted');
      setDeleteArticle(null);
      setArticle(null);
      refreshArticles();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'tickets', label: 'Tickets', count: ticketList.length },
    { id: 'knowledge', label: 'Knowledge base' },
    { id: 'documents', label: 'Documents' },
    ...(isStaffAgent ? [{ id: 'analytics', label: 'Analytics' }] : []),
    ...(isHRAdmin ? [{ id: 'categories', label: 'Categories' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Helpdesk"
        description="Raise and resolve HR and IT support requests, browse guidance and request official documents."
        actions={<Button icon={Plus} onClick={() => setModal({ type: 'ticket' })}>New ticket</Button>}
      />
      <Tabs tabs={tabs} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'overview' ? (
        overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Open tickets" value={overview.data?.open ?? 0} hint={`${overview.data?.total ?? 0} total`} icon={Ticket} />
              <StatCard label="Unassigned" value={overview.data?.unassigned ?? 0} icon={Users} tone="amber" />
              <StatCard label="SLA breaches" value={overview.data?.breached ?? 0} icon={Clock} tone="red" />
              <StatCard label="Average CSAT" value={overview.data?.average_csat ? `${overview.data.average_csat} / 5` : '—'} icon={Star} tone="purple" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card title="Support that stays accountable" description="Every ticket has an owner and an SLA">
                <p className="text-xs leading-6 text-slate-600">Tickets are routed to a default assignee by category and measured against the category SLA. Agents can escalate, reassign and resolve tickets; employees can comment and close their own resolved requests.</p>
              </Card>
              <Card title="Self-service first" description="Answers before tickets">
                <p className="text-xs leading-6 text-slate-600">The knowledge base contains HR policy and process guidance. Employees can vote on published articles to help HR identify gaps, while authors submit drafts for HR review.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={BookOpen} onClick={() => setTab('knowledge')}>Browse knowledge base</Button>
                  <Button size="sm" variant="secondary" icon={FileText} onClick={() => setTab('documents')}>Request a document</Button>
                </div>
              </Card>
            </div>
            <Card title="Recent tickets" description="Latest requests in your scope" padded={false}>
              <DataTable
                columns={[
                  { key: 'ticket_no', header: 'Ticket' },
                  { key: 'subject', header: 'Subject', render: (row) => <div><p className="font-medium text-slate-900">{row.subject}</p><p className="text-[11px] text-slate-500">{row.employee_name} · {row.category_name}</p></div> },
                  { key: 'priority', header: 'Priority', render: (row) => <Badge>{row.priority}</Badge> },
                  { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                  { key: 'created_at', header: 'Created', render: (row) => formatDate(row.created_at) },
                ]}
                rows={ticketList.slice(0, 5)}
                loading={tickets.loading}
                compact
                onRowClick={(row) => setTicketId(row.id)}
                emptyTitle="No tickets"
                emptyDescription="Raise a ticket to get support."
              />
            </Card>
          </div>
        )
      ) : null}

      {tab === 'tickets' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
            <Select value={ticketStatus} onChange={(event) => setTicketStatus(event.target.value)} className="w-full sm:w-44">
              <option value="">All statuses</option>
              {TICKET_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
            <Select value={ticketPriority} onChange={(event) => setTicketPriority(event.target.value)} className="w-full sm:w-40">
              <option value="">All priorities</option>
              {TICKET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </Select>
            <Button className="sm:ml-auto" size="sm" icon={Plus} onClick={() => setModal({ type: 'ticket' })}>New ticket</Button>
          </div>
          {tickets.error ? <div className="p-4"><ErrorState error={tickets.error} onRetry={tickets.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'ticket_no', header: 'Ticket', render: (row) => <span className="font-medium text-slate-900">{row.ticket_no}</span> },
                { key: 'subject', header: 'Subject', render: (row) => <div><p className="font-medium text-slate-900">{row.subject}</p><p className="text-[11px] text-slate-500">{row.category_name} · {row.employee_name}</p></div> },
                { key: 'priority', header: 'Priority', render: (row) => <Badge>{row.priority}</Badge> },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'assignee_name', header: 'Assignee', render: (row) => row.assignee_name ?? 'Unassigned' },
                { key: 'sla', header: 'SLA', render: (row) => <Badge tone={row.sla_breached ? 'red' : 'green'}>{row.sla_breached ? 'Breached' : 'On track'}</Badge> },
                { key: 'created_at', header: 'Created', render: (row) => formatDate(row.created_at) },
              ]}
              rows={ticketList}
              loading={tickets.loading}
              onRowClick={(row) => setTicketId(row.id)}
              emptyTitle="No tickets"
              emptyDescription="Support tickets in your scope will appear here."
            />
          )}
        </Card>
      ) : null}

      {tab === 'knowledge' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-4">
            <SearchInput value={articleSearch} onChange={setArticleSearch} placeholder="Search articles…" className="w-full sm:w-64" />
            <Select value={articleCategory} onChange={(event) => setArticleCategory(event.target.value)} className="w-full sm:w-48">
              <option value="">All categories</option>
              {categoryList.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
            {isStaffAgent ? <Button className="sm:ml-auto" size="sm" icon={Plus} onClick={() => setModal({ type: 'article' })}>New article</Button> : null}
          </div>
          {articles.error ? <div className="p-4"><ErrorState error={articles.error} onRetry={articles.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'title', header: 'Article', render: (row) => <div><p className="font-medium text-slate-900">{row.title}</p><p className="text-[11px] text-slate-500">{row.category_name} · {row.author_name}</p></div> },
                { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                { key: 'votes', header: 'Helpful', render: (row) => `${row.helpful_votes ?? 0} / ${(row.helpful_votes ?? 0) + (row.not_helpful_votes ?? 0)}` },
                { key: 'published_at', header: 'Published', render: (row) => formatDate(row.published_at || row.created_at) },
              ]}
              rows={articleList}
              loading={articles.loading}
              onRowClick={setArticle}
              emptyTitle="No articles"
              emptyDescription={isStaffAgent ? 'Write a knowledge-base article to help employees self-serve.' : 'No published guidance is available yet.'}
            />
          )}
        </Card>
      ) : null}

      {tab === 'documents' ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="My document requests"
              description="Request official letters from HR"
              action={<Button size="sm" icon={FileText} onClick={() => setModal({ type: 'document-request' })}>Request</Button>}
              padded={false}
            >
              {requests.error ? <div className="p-4"><ErrorState error={requests.error} onRetry={requests.reload} /></div> : (
                <DataTable
                  columns={[
                    { key: 'document_type', header: 'Document' },
                    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
                    { key: 'created_at', header: 'Requested', render: (row) => formatDate(row.created_at) },
                    { key: 'issued_at', header: 'Issued', render: (row) => formatDate(row.issued_at) },
                    ...(isHRAdmin ? [{ key: 'actions', header: '', render: (row) => row.status !== 'Issued' ? <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setIssueRequest(row)}>Issue</Button></div> : null }] : []),
                  ]}
                  rows={requestList}
                  loading={requests.loading}
                  compact
                  emptyTitle="No requests"
                  emptyDescription="Request a salary certificate, experience letter or other official document."
                />
              )}
            </Card>
            <Card title="Documents" description="Issued letters and payslips available to you" padded={false}>
              {documents.error ? <div className="p-4"><ErrorState error={documents.error} onRetry={documents.reload} /></div> : (
                <DataTable
                  columns={[
                    { key: 'document_type', header: 'Document', render: (row) => <div><p className="font-medium text-slate-900">{row.document_type}</p><p className="text-[11px] text-slate-500">{row.file_name}</p></div> },
                    { key: 'source_module', header: 'Source' },
                    { key: 'issued_at', header: 'Issued', render: (row) => formatDate(row.issued_at) },
                    { key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" icon={Download} onClick={() => downloadDocument(row)}>Download</Button></div> },
                  ]}
                  rows={documentList}
                  loading={documents.loading}
                  compact
                  emptyTitle="No documents"
                  emptyDescription="Issued documents and payslips will appear here."
                />
              )}
            </Card>
          </div>
          <Card title="Document requests" description="HR issues requested documents; issued files remain available for download.">
            <p className="text-xs leading-6 text-slate-600">Only Admin and HR can issue documents. Issued letters are generated as signed HTML documents and recorded in the audit trail. Payslips are pulled from payroll and remain confidential to the employee and authorised HR users.</p>
          </Card>
        </div>
      ) : null}

      {isStaffAgent && tab === 'analytics' ? (
        analytics.error ? <ErrorState error={analytics.error} onRetry={analytics.reload} /> : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Open tickets" value={analytics.data?.open ?? 0} icon={Ticket} />
              <StatCard label="Resolved today" value={analytics.data?.resolved_today ?? 0} icon={CheckCircle2} tone="green" />
              <StatCard label="SLA breaches" value={analytics.data?.breached ?? 0} icon={Clock} tone="red" />
              <StatCard label="CSAT responses" value={analytics.data?.csat_responses ?? 0} hint={analytics.data?.average_csat ? `${analytics.data.average_csat} / 5 average` : 'No ratings yet'} icon={Star} tone="purple" />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Tickets by category" padded={false}>
                <DataTable
                  columns={[
                    { key: 'category', header: 'Category' },
                    { key: 'total', header: 'Total' },
                    { key: 'open', header: 'Open' },
                  ]}
                  rows={analytics.data?.by_category ?? []}
                  loading={analytics.loading}
                  compact
                  emptyTitle="No category data"
                />
              </Card>
              <Card title="Agent workload" description="Open tickets by assignee" padded={false}>
                <DataTable
                  columns={[
                    { key: 'agent', header: 'Agent' },
                    { key: 'open_tickets', header: 'Open tickets' },
                  ]}
                  rows={analytics.data?.workload ?? []}
                  loading={analytics.loading}
                  compact
                  emptyTitle="No assigned work"
                  emptyDescription="No open tickets are currently assigned."
                />
              </Card>
            </div>
          </div>
        )
      ) : null}

      {isHRAdmin && tab === 'categories' ? (
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <p className="text-xs text-slate-500">Categories determine routing and SLA targets for new tickets.</p>
            <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'category' })}>New category</Button>
          </div>
          {categories.error ? <div className="p-4"><ErrorState error={categories.error} onRetry={categories.reload} /></div> : (
            <DataTable
              columns={[
                { key: 'name', header: 'Category', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
                { key: 'department', header: 'Department' },
                { key: 'sla_hours', header: 'SLA', render: (row) => `${row.sla_hours} hours` },
                { key: 'default_assignee_id', header: 'Default assignee', render: (row) => employees.find((employee) => employee.id === row.default_assignee_id)?.full_name ?? 'Unassigned' },
                { key: 'active', header: 'Status', render: (row) => <Badge tone={row.active === false ? 'red' : 'green'}>{row.active === false ? 'Inactive' : 'Active'}</Badge> },
                { key: 'actions', header: '', render: (row) => <div className="text-right"><Button size="sm" variant="ghost" onClick={() => setModal({ type: 'category', item: row })}>Edit</Button></div> },
              ]}
              rows={categoryList}
              loading={categories.loading}
              emptyTitle="No ticket categories"
              emptyDescription="Create a category so employees can raise support requests."
            />
          )}
        </Card>
      ) : null}

      <Modal open={modal?.type === 'ticket'} onClose={() => setModal(null)} title="Raise a support ticket" size="md">
        <TicketForm categories={categoryList} isHRAdmin={isHRAdmin} onClose={() => setModal(null)} onSaved={() => { setModal(null); refreshTickets(); setTab('tickets'); }} />
      </Modal>
      <Modal open={modal?.type === 'article'} onClose={() => setModal(null)} title="New knowledge-base article" size="lg">
        <ArticleForm categories={categoryList} onClose={() => setModal(null)} onSaved={() => { setModal(null); refreshArticles(); }} />
      </Modal>
      <Modal open={modal?.type === 'article-edit'} onClose={() => setModal(null)} title="Edit knowledge-base article" size="lg">
        <ArticleForm article={modal?.item} categories={categoryList} onClose={() => setModal(null)} onSaved={() => { setModal(null); refreshArticles(); }} />
      </Modal>
      <Modal open={modal?.type === 'document-request'} onClose={() => setModal(null)} title="Request an official document" size="md">
        <DocumentRequestForm onClose={() => setModal(null)} onSaved={() => { setModal(null); requests.reload(); documents.reload(); }} />
      </Modal>
      <Modal open={modal?.type === 'category'} onClose={() => setModal(null)} title={modal?.item ? 'Edit ticket category' : 'New ticket category'} size="md">
        <CategoryForm category={modal?.item} departments={departments} onClose={() => setModal(null)} onSaved={() => { setModal(null); categories.reload(); }} />
      </Modal>
      <Modal open={Boolean(issueRequest)} onClose={() => setIssueRequest(null)} title="Issue requested document" size="md">
        {issueRequest ? <IssueDocumentForm request={issueRequest} onClose={() => setIssueRequest(null)} onSaved={() => { setIssueRequest(null); requests.reload(); documents.reload(); }} /> : null}
      </Modal>
      {ticketId ? <TicketDetail ticketId={ticketId} onClose={() => setTicketId(null)} onChanged={refreshTickets} /> : null}
      <Modal open={Boolean(article)} onClose={() => setArticle(null)} title={article?.title ?? 'Knowledge-base article'} size="lg">
        {article ? (
          <ArticleDetail
            article={article}
            isHRAdmin={isHRAdmin}
            onClose={() => setArticle(null)}
            onChanged={refreshArticles}
            onEdit={(item) => { setArticle(null); setModal({ type: 'article-edit', item }); }}
            onDelete={(item) => { setArticle(null); setDeleteArticle(item); }}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={Boolean(deleteArticle)}
        onClose={() => setDeleteArticle(null)}
        onConfirm={removeArticle}
        loading={saving}
        title="Delete this article?"
        message={`"${deleteArticle?.title ?? 'This article'}" and its votes will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete article"
      />
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        Support access is limited to your own tickets, your team or the whole organisation depending on your role.
      </div>
    </div>
  );
}
