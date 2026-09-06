'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useDocsData } from './DocsDataContext';
import { DocsSidebar } from './DocsSidebar';
import { DocsToc } from './DocsToc';

export function DocsShell({ children }: { children: ReactNode }) {
  const { guides, contracts, searchCorpus, headings } = useDocsData();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="docs-layout relative">
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="btn-secondary px-3 py-1.5 text-sm"
          aria-expanded={mobileOpen}
          aria-controls="docs-mobile-drawer"
        >
          Menu
        </button>
        <span className="text-xs text-slate-500">Docs</span>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" id="docs-mobile-drawer">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={closeMobile}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col border-r border-canvas-border bg-canvas-raised p-4 shadow-panel">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-100">Documentation</span>
              <button
                type="button"
                onClick={closeMobile}
                className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <DocsSidebar
              guides={guides}
              contracts={contracts}
              searchCorpus={searchCorpus}
              activeHref={pathname}
              onNavigate={closeMobile}
            />
          </aside>
        </div>
      )}

      <div className="flex gap-8 xl:gap-10">
        <aside className="hidden w-56 shrink-0 lg:block xl:w-60">
          <div className="sticky top-20 max-h-[calc(100vh-5.5rem)] overflow-hidden">
            <DocsSidebar
              guides={guides}
              contracts={contracts}
              searchCorpus={searchCorpus}
              activeHref={pathname}
            />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>

        <aside className="hidden w-44 shrink-0 xl:block">
          <div className="sticky top-20 max-h-[calc(100vh-5.5rem)] overflow-y-auto">
            <DocsToc headings={headings} />
          </div>
        </aside>
      </div>
    </div>
  );
}
