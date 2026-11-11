import { Inbox, Loader2 } from 'lucide-react';

export default function DataTable({
  columns,
  rows,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There is nothing to show here yet.',
  keyField = 'id',
  onRowClick,
  compact = false,
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
        <div className="rounded-full bg-slate-100 p-3 text-slate-400">
          <Inbox className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-slate-800">{emptyTitle}</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="table-head">
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-2.5 font-semibold ${column.headerClassName ?? ''}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row[keyField]}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`transition ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50/60'}`}
            >
              {columns.map((column) => (
                <td key={column.key} className={`${compact ? 'px-4 py-2' : 'table-cell'} ${column.className ?? ''}`}>
                  {column.render ? column.render(row) : row[column.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
