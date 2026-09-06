'use client';

import { useId, useState, type ReactNode, type MouseEvent } from 'react';

/** Compact “?” tooltip for technical terms. Prefer plain labels + this for jargon. */
export function HelpTip({
  label = 'What is this?',
  children,
  side = 'top',
}: {
  label?: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  function stop(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <span className="relative inline-flex align-middle" onClick={stop}>
      <button
        type="button"
        className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-canvas-border-strong bg-canvas-overlay text-[10px] font-semibold text-slate-400 transition hover:border-accent/50 hover:text-accent-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 w-56 rounded-lg border border-canvas-border bg-canvas-overlay px-3 py-2 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-slate-300 shadow-panel ${
            side === 'bottom' ? 'left-1/2 top-full mt-2 -translate-x-1/2' : 'bottom-full left-1/2 mb-2 -translate-x-1/2'
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** Inline label with optional help tip — use for Field / Stat headings. */
export function LabelWithHelp({
  children,
  help,
}: {
  children: ReactNode;
  help?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {children}
      {help != null && <HelpTip>{help}</HelpTip>}
    </span>
  );
}
