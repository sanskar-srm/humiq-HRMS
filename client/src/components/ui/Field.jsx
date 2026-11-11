export function Input({ label, error, hint, className = '', id, required, ...props }) {
  const inputId = id || props.name;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="label">
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      <input id={inputId} className={`input ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : ''}`} {...props} />
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Select({ label, error, hint, className = '', id, children, required, ...props }) {
  const selectId = id || props.name;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={selectId} className="label">
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      <select id={selectId} className={`input ${error ? 'border-rose-400' : ''}`} {...props}>
        {children}
      </select>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Textarea({ label, error, hint, className = '', id, required, rows = 4, ...props }) {
  const inputId = id || props.name;
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="label">
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      <textarea id={inputId} rows={rows} className={`input ${error ? 'border-rose-400' : ''}`} {...props} />
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
