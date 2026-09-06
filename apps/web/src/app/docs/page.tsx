import Link from 'next/link';
import { getNavItems } from '@/lib/docs';
import { PageHeader } from '@/components/PageHeader';

export const metadata = {
  title: 'Docs',
};

export default function DocsIndexPage() {
  const { guides, contracts } = getNavItems();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Documentation"
        subtitle="Protocol guides and public Solidity sources — architecture, accounting, security, glossary, runbook, and on-chain contract code."
      />

      <section className="rounded-2xl border border-canvas-border/90 bg-canvas-raised/50 p-5 shadow-panel sm:p-6">
        <h2 className="text-base font-semibold text-slate-100">Guides</h2>
        <p className="mt-1 text-sm text-slate-400">Markdown from the repo, copied at build into content/.</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {guides.map((d) => (
            <li key={d.slug}>
              <Link
                href={d.href}
                className="group flex flex-col rounded-xl border border-canvas-border/80 bg-canvas/40 px-4 py-3.5 transition hover:border-accent/40 hover:bg-canvas-raised/80 hover:shadow-glow-sm"
              >
                <span className="font-medium text-slate-100 group-hover:text-white">{d.title}</span>
                <span className="mt-1 font-mono text-xs text-slate-500">{d.file}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-canvas-border/90 bg-canvas-raised/50 p-5 shadow-panel sm:p-6">
        <h2 className="text-base font-semibold text-slate-100">Contracts</h2>
        <p className="mt-1 text-sm text-slate-400">
          Read-only protocol Solidity from <code className="text-accent-soft">src/</code>, mirrored to {' '}
          <code className="text-accent-soft">content/contracts/</code> at prebuild.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {contracts.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="group flex flex-col rounded-xl border border-canvas-border/80 bg-canvas/40 px-4 py-3.5 transition hover:border-accent/40 hover:bg-canvas-raised/80 hover:shadow-glow-sm"
              >
                <span className="font-mono text-sm font-medium text-slate-100 group-hover:text-white">{c.title}</span>
                <span className="mt-1 font-mono text-xs text-slate-500">{c.relPath}</span>
              </Link>
            </li>
          ))}
        </ul>
        {contracts.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">No contracts copied yet. Run npm run copy-docs / prebuild.</p>
        )}
      </section>
    </div>
  );
}
