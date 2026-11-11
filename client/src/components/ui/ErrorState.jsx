import { AlertTriangle } from 'lucide-react';
import Button from './Button.jsx';
import { getErrorMessage } from '../../services/api.js';

export default function ErrorState({ error, onRetry, title = 'Could not load this view' }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
      <AlertTriangle className="h-7 w-7 text-rose-500" />
      <h3 className="mt-3 text-sm font-semibold text-rose-800">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-rose-700">{getErrorMessage(error)}</p>
      {onRetry ? <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}
