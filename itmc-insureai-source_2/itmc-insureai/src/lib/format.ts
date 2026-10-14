import { CURRENCY } from '../config/rules';

export const money = (n: number, opts: { decimals?: boolean } = {}) =>
  `${CURRENCY} ${n.toLocaleString('en-US', {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  })}`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`;

export const todayISO = () => toISODate(new Date());

export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

export const daysFromToday = (n: number) => addDays(todayISO(), n);

export const daysBetween = (a: string, b: string) => {
  const da = new Date(a.slice(0, 10) + 'T12:00:00').getTime();
  const db = new Date(b.slice(0, 10) + 'T12:00:00').getTime();
  return Math.round((db - da) / 86400000);
};

export const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

export const nowISO = () => new Date().toISOString();

/** Timestamp N days ago (optionally offset by minutes) — used for seeded history. */
export const stampDaysAgo = (days: number, minutes = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(10, 0, 0, 0);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
};
