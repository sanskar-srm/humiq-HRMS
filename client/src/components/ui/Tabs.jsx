export default function Tabs({ tabs, active, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 overflow-x-auto border-b border-slate-200 ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative shrink-0 px-3 py-2.5 text-sm font-medium transition ${isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined ? (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
              ) : null}
            </span>
            {isActive ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" /> : null}
          </button>
        );
      })}
    </div>
  );
}
