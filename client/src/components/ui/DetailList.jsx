export default function DetailList({ items, columns = 2 }) {
  return (
    <dl className={`grid gap-x-6 gap-y-3 ${columns === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
      {items.filter(Boolean).map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{item.label}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
