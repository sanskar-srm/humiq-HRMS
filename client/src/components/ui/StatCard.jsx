import { useEffect, useRef } from 'react';

const tones = {
  brand: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-rose-50 text-rose-600',
  blue: 'bg-sky-50 text-sky-600',
  purple: 'bg-violet-50 text-violet-600',
  slate: 'bg-slate-100 text-slate-600',
};

export default function StatCard({ label, value, hint, icon: Icon, tone = 'brand', wobble = false }) {
  const valueRef = useRef(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (!wobble || value === prevValue.current) return;
    prevValue.current = value;
    const el = valueRef.current;
    if (!el) return;
    el.classList.remove('animate-wobble');
    // reflow so re-adding the class retriggers the animation
    void el.offsetWidth;
    el.classList.add('animate-wobble');
  }, [value, wobble]);

  return (
    <div className="card p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p ref={valueRef} className="mt-1.5 inline-block text-2xl font-semibold tracking-tight text-slate-900">{value ?? '—'}</p>
          {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className={`shrink-0 rounded-lg p-2 ${tones[tone] ?? tones.brand}`}>
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
