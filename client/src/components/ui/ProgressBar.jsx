export default function ProgressBar({ value = 0, label, className = '', indeterminate = false }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));

  if (indeterminate) {
    return (
      <div className={className} role="progressbar" aria-label={label || 'Loading'} aria-valuetext="Loading">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>{label}</span>
          <span className="font-medium text-slate-700">{width}%</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
