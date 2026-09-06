'use client';

import { useState, type ReactNode } from 'react';

export type StepItem = {
  title: string;
  body?: ReactNode;
};

/** Collapsible numbered “How to use this page” guide. */
export function StepsGuide({
  title = 'How to use this page',
  steps,
  defaultOpen = false,
}: {
  title?: string;
  steps: StepItem[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group rounded-2xl border border-canvas-border/80 bg-canvas-raised/40 open:bg-canvas-raised/60"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden sm:px-5">
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-[11px] font-bold text-accent-soft">
            #
          </span>
          {title}
        </span>
        <span className="text-xs text-slate-500 group-open:hidden">Show steps</span>
        <span className="hidden text-xs text-slate-500 group-open:inline">Hide</span>
      </summary>
      <ol className="space-y-3 border-t border-canvas-border/60 px-4 pb-5 pt-4 sm:px-5">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent-soft ring-1 ring-accent/25">
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="text-sm font-medium text-slate-100">{step.title}</div>
              {step.body != null && (
                <div className="mt-1 text-sm leading-relaxed text-slate-400">{step.body}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Non-collapsible checklist for overview “What to do next”. */
export function Checklist({
  title = 'What to do next',
  items,
}: {
  title?: string;
  items: { label: string; done?: boolean; hint?: ReactNode }[];
}) {
  return (
    <section className="rounded-2xl border border-accent/25 bg-accent/5 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-slate-50">{title}</h2>
      <ol className="mt-4 space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                item.done
                  ? 'bg-ok/20 text-ok ring-1 ring-ok/40'
                  : 'bg-canvas/60 text-slate-400 ring-1 ring-canvas-border'
              }`}
              aria-hidden
            >
              {item.done ? '✓' : i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <div className={`text-sm ${item.done ? 'text-slate-400 line-through' : 'font-medium text-slate-100'}`}>
                {item.label}
              </div>
              {item.hint != null && !item.done && (
                <div className="mt-0.5 text-sm text-slate-500">{item.hint}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
