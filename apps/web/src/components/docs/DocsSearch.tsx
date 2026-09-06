'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { SearchEntry } from '@/lib/docs';

export function DocsSearch({
  corpus,
  onNavigate,
}: {
  corpus: SearchEntry[];
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored: { entry: SearchEntry; score: number }[] = [];
    for (const entry of corpus) {
      const title = entry.title.toLowerCase();
      const body = entry.body.toLowerCase();
      let score = 0;
      if (title === q) score += 100;
      else if (title.includes(q)) score += 50;
      if (body.includes(q)) score += 10;
      if (score > 0) scored.push({ entry, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
      .slice(0, 24)
      .map((s) => s.entry);
  }, [corpus, query]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-canvas-border/80 bg-canvas/60 px-3 py-2 text-left text-sm text-slate-500 transition hover:border-accent/40 hover:text-slate-300"
        aria-label="Search docs"
      >
        <SearchIcon />
        <span className="flex-1">Search docs…</span>
        <kbd className="hidden rounded border border-canvas-border px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Search documentation">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close search" onClick={close} />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-canvas-border bg-canvas-raised shadow-panel">
            <div className="flex items-center gap-2 border-b border-canvas-border px-3 py-2.5">
              <SearchIcon />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search titles and body…"
                className="flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button type="button" onClick={close} className="rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-300">
                Esc
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {query.trim() === '' && (
                <p className="px-3 py-6 text-center text-sm text-slate-500">Type to filter guides and contract sources.</p>
              )}
              {query.trim() !== '' && results.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-slate-500">No matches.</p>
              )}
              <ul className="space-y-1">
                {results.map((r) => (
                  <li key={r.href}>
                    <Link
                      href={r.href}
                      onClick={() => {
                        close();
                        onNavigate?.();
                      }}
                      className="block rounded-lg px-3 py-2.5 transition hover:bg-canvas-overlay"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-100">{r.title}</span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">{r.section}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 font-mono text-[11px] text-slate-500">{r.href}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-slate-500">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/** Sidebar inline filter — filters nav list by title/path without a modal. */
export function DocsNavFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="sr-only">Filter navigation</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter nav…"
        className="w-full rounded-lg border border-canvas-border/80 bg-canvas/60 px-3 py-1.5 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent/40 focus:ring-1 focus:ring-accent/25"
      />
    </label>
  );
}
