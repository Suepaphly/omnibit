import type { ReactNode } from 'react';

export function Panel({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-canvas-border/90 bg-canvas-raised/70 p-5 shadow-panel backdrop-blur-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-slate-50">{title}</h2>
          {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-400">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'accretion' | 'ok' | 'warn';
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-accent-soft'
      : tone === 'accretion'
        ? 'text-accretion-soft'
        : tone === 'ok'
          ? 'text-ok'
          : tone === 'warn'
            ? 'text-warn'
            : 'text-slate-100';

  return (
    <div className="rounded-xl border border-canvas-border/70 bg-canvas/60 px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 break-all font-mono text-sm ${valueTone}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = 'field-input';

export const btnPrimary = 'btn-primary';

export const btnSecondary = 'btn-secondary';

export const btnDanger = 'btn-danger';
