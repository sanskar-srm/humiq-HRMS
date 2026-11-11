import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, ChevronDown, KeyRound, LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { api, getErrorMessage } from '../../services/api.js';
import Avatar from '../ui/Avatar.jsx';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { Input } from '../ui/Field.jsx';

const titles = {
  '/dashboard': 'Dashboard',
  '/employees': 'Employees',
  '/workforce': 'Workforce Planning',
  '/recruitment': 'Recruitment',
  '/onboarding': 'Onboarding',
  '/offboarding': 'Offboarding',
  '/attendance': 'Attendance',
  '/compensation': 'Compensation',
  '/payroll': 'Payroll',
  '/performance': 'Performance',
  '/helpdesk': 'Helpdesk',
};

export default function Header({ onMenu }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    let active = true;
    api.get('/dashboard/summary')
      .then((response) => { if (active) setNotifications(response.data.notifications ?? []); })
      .catch((error) => {
        if (active) {
          console.error('[api] failed to load notifications', {
            message: error?.message,
            status: error?.status,
            code: error?.code,
            requestId: error?.requestId,
          });
        }
      });
    return () => { active = false; };
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const changePassword = async (event) => {
    event.preventDefault();
    if (form.new_password !== form.confirm) {
      toast.error('New password and confirmation do not match');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast.success('Password updated successfully');
      setPasswordOpen(false);
      setForm({ current_password: '', new_password: '', confirm: '' });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{titles[location.pathname] ?? 'HRMS'}</p>
          <p className="hidden text-[11px] text-slate-500 sm:block">{user?.department} · {user?.designation}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => { setNotificationsOpen((open) => !open); setMenuOpen(false); }}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {notifications.length ? (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                {notifications.length}
              </span>
            ) : null}
          </button>
          {notificationsOpen ? (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications</p>
              {notifications.length ? notifications.map((notification, index) => (
                <Link
                  key={`${notification.type}-${index}`}
                  to={notification.to}
                  onClick={() => setNotificationsOpen(false)}
                  className="block rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                  {notification.message}
                </Link>
              )) : <p className="px-2 py-3 text-xs text-slate-500">You are all caught up.</p>}
            </div>
          ) : null}
        </div>

        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => { setMenuOpen((open) => !open); setNotificationsOpen(false); }}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100"
          >
            <Avatar name={user?.full_name} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate text-xs font-semibold text-slate-800">{user?.full_name}</span>
              <span className="block text-[10px] text-slate-500">{user?.role}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <div className="border-b border-slate-100 px-2.5 py-2">
                <p className="text-sm font-semibold text-slate-800">{user?.full_name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-500">
                  <ShieldCheck className="h-3 w-3" /> {user?.role} · {user?.employee_code}
                </p>
              </div>
              <button type="button" onClick={() => { setMenuOpen(false); setPasswordOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
                <KeyRound className="h-4 w-4" /> Change password
              </button>
              <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change password"
        description="Use at least 8 characters. You will stay signed in on this device."
        size="sm"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button onClick={changePassword} loading={saving}>Update password</Button>
          </>
        )}
      >
        <form onSubmit={changePassword} className="space-y-3">
          <Input label="Current password" type="password" required value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} />
          <Input label="New password" type="password" required minLength={8} value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
          <Input label="Confirm new password" type="password" required minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </form>
      </Modal>
    </header>
  );
}
