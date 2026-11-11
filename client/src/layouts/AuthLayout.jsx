import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

const points = [
  'Workforce planning, recruitment and onboarding in one flow',
  'Attendance, leave and shift operations with team scoping',
  'Compensation, reimbursements and payroll with approvals',
  'Performance, offboarding and HR helpdesk built in',
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-slate-100">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 p-10 text-white lg:flex xl:p-14">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-3">
          <img src="/hrms_logo.png" alt="HRMS logo" className="h-10 w-10 shrink-0 object-contain" />
          <span>
            <span className="block text-sm font-semibold">HRMS</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-400">People operations</span>
          </span>
        </Link>

        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Human Resource Management System</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight xl:text-4xl">One secure workspace for the entire employee lifecycle.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Role-aware access for Admin, HR, managers and employees — with approval workflows enforced on the server.
          </p>
          <ul className="mt-7 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-slate-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-slate-500">Confidential workforce data · Authorized access only</p>
      </div>

      <div className="flex w-full items-center justify-center px-4 py-10 sm:px-8 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <img src="/hrms_logo.png" alt="HRMS logo" className="h-9 w-9 shrink-0 object-contain" />
            <div>
              <p className="text-sm font-semibold text-slate-900">HRMS</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">People operations</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-500">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
