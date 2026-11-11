const tones = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  blue: 'bg-sky-50 text-sky-700 border-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  purple: 'bg-violet-50 text-violet-700 border-violet-200',
};

const statusTones = {
  active: 'green', approved: 'green', completed: 'green', paid: 'green', present: 'green', published: 'green',
  signed: 'green', acknowledged: 'green', hired: 'green', disbursed: 'green', resolved: 'green', helpful: 'green',
  'ready now': 'green', filed: 'green', '1-2 years': 'blue', '3+ years': 'amber',
  pending: 'amber', 'pending manager': 'amber', 'pending admin': 'amber', submitted: 'amber', draft: 'amber',
  'in progress': 'blue', 'awaiting review': 'amber', 'manager approved': 'blue', scheduled: 'blue',
  planning: 'slate', 'on hold': 'amber', open: 'blue', issued: 'blue', interview: 'blue', offer: 'indigo',
  screening: 'indigo', applied: 'slate', 'not started': 'slate', 'exit interview': 'amber', clearance: 'amber',
  settlement: 'amber', documents: 'amber', 'resignation submitted': 'amber', 'knowledge transfer': 'blue',
  rejected: 'red', absent: 'red', cancelled: 'red', withdrawn: 'red', revoked: 'red', escalated: 'red',
  archived: 'slate', 'not helpful': 'red', 'at risk': 'red', 'no show': 'red', exited: 'slate',
  'half day': 'amber', leave: 'purple', holiday: 'purple', 'work from home': 'blue', late: 'amber',
  low: 'slate', medium: 'blue', high: 'amber', urgent: 'red', expert: 'green', advanced: 'blue',
  intermediate: 'amber', beginner: 'slate',
};

export default function Badge({ children, tone, className = '' }) {
  const key = String(children ?? '').toLowerCase();
  const resolved = tone || statusTones[key] || 'slate';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 ${tones[resolved] ?? tones.slate} ${className}`}>
      {children}
    </span>
  );
}
