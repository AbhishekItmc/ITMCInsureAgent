import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Tone } from '../lib/selectors';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');
export { cx };

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'hero';
export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const v = {
    primary: 'bg-teal text-white hover:bg-teal/90 disabled:bg-teal/40',
    hero: 'bg-navy text-white hover:bg-navy/90 ring-2 ring-teal/60 disabled:opacity-50 dark-hero',
    secondary: 'bg-surface text-ink border border-line hover:bg-sunken disabled:opacity-50',
    ghost: 'text-ink hover:bg-sunken disabled:opacity-50',
    danger: 'bg-surface text-crit border border-crit/40 hover:bg-critsoft disabled:opacity-50',
  }[variant];
  const s = { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-4 text-sm', lg: 'h-12 px-6 text-[15px] tracking-wide' }[size];
  return (
    <button {...rest} className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap', v, s, className)}>
      {children}
    </button>
  );
}

const toneCls: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted border-line',
  info: 'bg-infosoft text-info border-info/25',
  ok: 'bg-oksoft text-ok border-ok/25',
  warn: 'bg-warnsoft text-warn border-warn/30',
  crit: 'bg-critsoft text-crit border-crit/30',
  teal: 'bg-tealsoft text-tealink border-teal/30',
};
const dotCls: Record<Tone, string> = { neutral: 'bg-muted', info: 'bg-info', ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit', teal: 'bg-teal' };

export function Pill({ tone = 'neutral', children, dot = true, pulse, className }: { tone?: Tone; children: ReactNode; dot?: boolean; pulse?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap', toneCls[tone], className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', dotCls[tone], pulse && 'pulse-dot')} />}
      {children}
    </span>
  );
}

export function Card({ children, className, title, action, subtitle, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface min-w-0', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="font-display text-[15px] font-bold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="font-display text-[26px] font-extrabold leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <em className="text-[12px] not-italic text-crit">{error}</em> : hint ? <em className="text-[12px] not-italic text-muted">{hint}</em> : null}
    </label>
  );
}

export function KV({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-[14px] font-medium text-ink tnum">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-sunken/60">
            {head.map((h, i) => <th key={i} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const Td = ({ children, className, mono }: { children: ReactNode; className?: string; mono?: boolean }) => (
  <td className={cx('px-4 py-3 align-top text-ink', mono && 'font-mono text-[12.5px]', className)}>{children}</td>
);

export function Ref({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12.5px] font-medium text-ink">{children}</span>;
}

export function DemoTag({ children = 'Demo record' }: { children?: ReactNode }) {
  return <span className="inline-flex items-center rounded border border-dashed border-warn/60 px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wider text-warn">{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">{children}</div>;
}

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('rounded-lg border px-4 py-3 text-[13px] leading-relaxed', toneCls[tone])}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={cx(title ? 'mt-0.5' : '', 'text-ink/90')}>{children}</div>}
    </div>
  );
}

/* Toasts */
type ToastItem = { id: number; text: string; tone: Tone };
let pushToast: (t: Omit<ToastItem, 'id'>) => void = () => {};
export const toast = (text: string, tone: Tone = 'ok') => pushToast({ text, tone });
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let n = 0;
    pushToast = (t) => {
      const id = ++n;
      setItems((x) => [...x.slice(-2), { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed z-50 flex flex-col gap-2" style={{ right: 'max(16px, env(safe-area-inset-right, 0px))', bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }} role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx('pointer-events-auto max-w-sm rounded-lg border px-4 py-2.5 text-[13px] font-medium shadow-lg', toneCls[t.tone])}>{t.text}</div>
      ))}
    </div>
  );
}
