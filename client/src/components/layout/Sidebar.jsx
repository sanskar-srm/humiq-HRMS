import { NavLink } from 'react-router-dom';
import {
  Banknote, BriefcaseBusiness, CalendarClock, GraduationCap, Heart, LayoutDashboard, LifeBuoy, Network,
  Scale, Target, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import Avatar from '../ui/Avatar.jsx';

const ALL = ['Admin', 'HR', 'Manager', 'Employee'];

export const navigation = [
  {
    section: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ALL }],
  },
  {
    section: 'People',
    items: [
      { to: '/employees', label: 'Employees', icon: Users, roles: ['Admin', 'HR', 'Manager'] },
      { to: '/workforce', label: 'Workforce Planning', icon: Network, roles: ['Admin', 'HR', 'Manager'] },
      { to: '/recruitment', label: 'Recruitment', icon: BriefcaseBusiness, roles: ['Admin', 'HR', 'Manager'] },
      { to: '/onboarding', label: 'Onboarding', icon: UserPlus, roles: ALL },
      { to: '/offboarding', label: 'Offboarding', icon: UserMinus, roles: ALL },
    ],
  },
  {
    section: 'Experience',
    items: [
      { to: '/engagement', label: 'Engagement', icon: Heart, roles: ALL },
      { to: '/relations', label: 'Employee Relations', icon: Scale, roles: ALL },
      { to: '/lms', label: 'Learning (LMS)', icon: GraduationCap, roles: ALL },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/attendance', label: 'Attendance', icon: CalendarClock, roles: ALL },
      { to: '/compensation', label: 'Compensation', icon: Banknote, roles: ALL },
      { to: '/payroll', label: 'Payroll', icon: Banknote, roles: ALL },
      { to: '/performance', label: 'Performance', icon: Target, roles: ALL },
      { to: '/helpdesk', label: 'Helpdesk', icon: LifeBuoy, roles: ALL },
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();

  return (
    <>
      {open ? <button type="button" className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={onClose} aria-label="Close navigation" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform duration-200 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5">
            <img src="/hrms_logo.png" alt="HRMS logo" className="h-9 w-9 shrink-0 object-contain" />
            <div>
              <p className="text-sm font-semibold text-white">HRMS</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-400">People operations</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 lg:hidden" aria-label="Close navigation">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {navigation.map((group) => {
            const items = group.items.filter((item) => item.roles.includes(user?.role));
            if (!items.length) return null;
            return (
              <div key={group.section}>
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{group.section}</p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2">
            <Avatar name={user?.full_name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">{user?.full_name}</p>
              <p className="truncate text-[10px] text-slate-400">{user?.role} · {user?.employee_code}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
