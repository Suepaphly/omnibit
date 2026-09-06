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
    <section className="rounded-xl border border-canvas-border bg-canvas-raised/60 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-canvas-border/80 bg-canvas/50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-slate-100">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
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

export const inputClass =
  'w-full rounded-md border border-canvas-border bg-canvas px-3 py-2 font-mono text-sm text-slate-100 outline-none ring-accent/40 placeholder:text-slate-600 focus:ring-2';

export const btnPrimary =
  'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-40';

export const btnSecondary =
  'rounded-md border border-canvas-border bg-canvas px-4 py-2 text-sm text-slate-300 hover:bg-canvas-raised disabled:cursor-not-allowed disabled:opacity-40';
