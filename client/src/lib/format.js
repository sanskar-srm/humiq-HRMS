export const currency = (value, code = 'INR') => {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (Number.isNaN(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code || 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code || 'INR'} ${amount.toLocaleString('en-IN')}`;
  }
};

export const number = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  return Number.isNaN(amount) ? '—' : amount.toLocaleString('en-IN');
};

export const formatDate = (value, fallback = '—') => {
  if (!value) return fallback;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const formatDateTime = (value, fallback = '—') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const monthLabel = (period) => {
  if (!period) return '—';
  const date = new Date(`${period}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return period;
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export const currentMonth = () => new Date().toISOString().slice(0, 7);

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export const titleCase = (value = '') =>
  String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

export const percent = (value) => `${Math.max(0, Math.min(100, Number(value) || 0))}%`;

export const dateInput = (value) => (value ? String(value).slice(0, 10) : '');

export const toDateInput = (date = new Date()) => {
  const copy = new Date(date);
  const offset = copy.getTimezoneOffset();
  return new Date(copy.getTime() - offset * 60000).toISOString().slice(0, 10);
};
