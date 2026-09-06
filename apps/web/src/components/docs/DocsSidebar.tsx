'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ContractMeta, GuideMeta, SearchEntry } from '@/lib/docs';
import { DocsNavFilter, DocsSearch } from './DocsSearch';

export function DocsSidebar({
  guides,
  contracts,
  searchCorpus,
  activeHref,
  onNavigate,
}: {
  guides: GuideMeta[];
  contracts: ContractMeta[];
  searchCorpus: SearchEntry[];
  activeHref: string;
  onNavigate?: () => void;
}) {
  const [filter, setFilter] = useState('');

  const q = filter.trim().toLowerCase();
  const filteredGuides = useMemo(
    () => (q ? guides.filter((g) => g.title.toLowerCase().includes(q) || g.file.toLowerCase().includes(q)) : guides),
    [guides, q],
  );
  const filteredContracts = useMemo(
    () =>
      q
        ? contracts.filter(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              c.file.toLowerCase().includes(q) ||
              c.relPath.toLowerCase().includes(q),
          )
        : contracts,
    [contracts, q],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <DocsSearch corpus={searchCorpus} onNavigate={onNavigate} />
      <DocsNavFilter value={filter} onChange={setFilter} />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-6 pr-1">
        <NavSection title="Guides">
          {filteredGuides.length === 0 && <Empty />}
          {filteredGuides.map((g) => (
            <NavLink
              key={g.href}
              href={g.href}
              label={g.title}
              hint={g.file}
              active={activeHref === g.href}
              onNavigate={onNavigate}
            />
          ))}
        </NavSection>

        <NavSection title="Contracts">
          {filteredContracts.length === 0 && <Empty />}
          {filteredContracts.map((c) => (
            <NavLink
              key={c.href}
              href={c.href}
              label={c.title}
              hint={c.relPath}
              active={activeHref === c.href}
              onNavigate={onNavigate}
              mono
            />
          ))}
        </NavSection>
      </div>
    </div>
  );
}

function NavSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function NavLink({
  href,
  label,
  hint,
  active,
  onNavigate,
  mono,
}: {
  href: string;
  label: string;
  hint?: string;
  active: boolean;
  onNavigate?: () => void;
  mono?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className={`block rounded-lg px-2.5 py-1.5 transition ${
          active
            ? 'bg-accent/10 text-accent-soft ring-1 ring-accent/30'
            : 'text-slate-300 hover:bg-canvas-overlay/80 hover:text-white'
        }`}
        title={hint}
      >
        <span className={`block text-sm ${mono ? 'font-mono text-[13px]' : 'font-medium'}`}>{label}</span>
        {hint && <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">{hint}</span>}
      </Link>
    </li>
  );
}

function Empty() {
  return <li className="px-2.5 py-1 text-xs text-slate-600">No matches</li>;
}
