'use client';

import type { DocHeading } from '@/lib/docs';

export function DocsToc({ headings }: { headings: DocHeading[] }) {
  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">On this page</p>
      <ul className="space-y-1.5 border-l border-canvas-border/80">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`block border-l-2 border-transparent py-0.5 text-sm text-slate-400 transition hover:border-accent/60 hover:text-accent-soft ${
                h.level === 3 ? 'pl-5' : 'pl-3'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
