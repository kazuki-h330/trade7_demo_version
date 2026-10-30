import type { ReactNode } from 'react';
import { LABEL, toneOf, type Tone } from '@/lib/format';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

export function PageHeader({ title, sub, icon, actions }: { title: ReactNode; sub?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <div className="brand-gradient grid size-11 place-items-center rounded-2xl text-white shadow-lg shadow-fuchsia-500/25">{icon}</div>}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

const TONE_CLS: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset', TONE_CLS[tone])}>{children}</span>;
}
export function Status<K extends keyof typeof LABEL>({ kind, value }: { kind: K; value: string }) {
  const label = (LABEL[kind] as Record<string, string>)[value] ?? value;
  return <Badge tone={toneOf(value)}><span className="size-1.5 rounded-full bg-current opacity-70" />{label}</Badge>;
}

const STAT_BG = {
  violet: 'from-violet-500 to-indigo-500 shadow-violet-500/25',
  pink: 'from-fuchsia-500 to-pink-500 shadow-pink-500/25',
  orange: 'from-amber-400 to-orange-500 shadow-orange-500/25',
  teal: 'from-emerald-400 to-teal-500 shadow-teal-500/25',
  sky: 'from-sky-400 to-blue-500 shadow-sky-500/25',
  rose: 'from-rose-500 to-red-500 shadow-rose-500/25',
};
export type StatColor = keyof typeof STAT_BG;
export function Stat({ label, value, sub, color = 'violet', icon, href }: { label: string; value: ReactNode; sub?: ReactNode; color?: StatColor; icon?: ReactNode; href?: string }) {
  const body = (
    <div className={cx('relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg transition', STAT_BG[color], href && 'hover:-translate-y-0.5 hover:shadow-xl')}>
      <div className="absolute -top-6 -right-6 size-24 rounded-full bg-white/15" />
      <div className="absolute -right-2 -bottom-10 size-24 rounded-full bg-white/10" />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-white/85">{label}</div>
          <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-white/80">{sub}</div>}
        </div>
        {icon && <div className="rounded-xl bg-white/20 p-2">{icon}</div>}
      </div>
    </div>
  );
  return href ? <a href={href}>{body}</a> : body;
}

export function Table({ head, children, empty = 'データがありません', rows }: { head: ReactNode[]; children: ReactNode; empty?: string; rows: number }) {
  if (!rows) return <Empty>{empty}</Empty>;
  return (
    <div className="-mx-5 -my-5 overflow-x-auto">
      <table className="tbl">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm text-slate-500">
      {icon}{children}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function DL({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="contents"><dt className="text-slate-500">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>
      ))}
    </dl>
  );
}

export function Notice({ tone = 'violet', children, icon }: { tone?: 'violet' | 'amber' | 'red' | 'green'; children: ReactNode; icon?: ReactNode }) {
  const cls = { violet: 'border-violet-200 bg-violet-50 text-violet-900', amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-rose-200 bg-rose-50 text-rose-900', green: 'border-emerald-200 bg-emerald-50 text-emerald-900' }[tone];
  return <div className={cx('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm', cls)}>{icon}<div className="min-w-0">{children}</div></div>;
}

const FACE_GRAD: [number, string][] = [
  [50000, 'from-slate-900 via-violet-900 to-fuchsia-800'],
  [20000, 'from-indigo-600 via-violet-600 to-fuchsia-500'],
  [10000, 'from-fuchsia-500 via-pink-500 to-orange-400'],
  [5000, 'from-sky-500 via-cyan-500 to-emerald-400'],
  [0, 'from-amber-400 via-orange-500 to-rose-500'],
];
/** Generic gift-card artwork (no third-party logos). */
export function GiftArt({ face, className, small }: { face: number; className?: string; small?: boolean }) {
  const g = FACE_GRAD.find(([min]) => face >= min)![1];
  return (
    <div className={cx(!className?.includes('absolute') && 'relative', 'overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-lg', g, small ? 'p-3' : 'p-4', className)}>
      <div className="gift-shine absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,.18)_45%,transparent_60%)]" />
      <div className="absolute -right-8 -bottom-12 size-36 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between text-[11px] font-semibold tracking-widest text-white/80 uppercase">
        <span>Gift Card</span><span>Apple</span>
      </div>
      <div className={cx('relative font-extrabold tracking-tight', small ? 'mt-2 text-xl' : 'mt-5 text-3xl')}>¥{face.toLocaleString('ja-JP')}</div>
    </div>
  );
}
