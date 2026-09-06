import Link from 'next/link';
import { DOC_META } from '@/lib/docs';
import { Panel } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';

export const metadata = {
  title: 'Docs',
};

export default function DocsIndexPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentation"
        subtitle="Protocol architecture, accounting, security notes, glossary, and Sepolia runbook — rendered from repo markdown."
      />
      <Panel title="Guides" subtitle="Copied into apps/web/content at build. Not hardcoded duplicates.">
        <ul className="space-y-2">
          {DOC_META.map((d) => (
            <li key={d.slug}>
              <Link
                href={`/docs/${d.slug}`}
                className="group flex flex-wrap items-center justify-between gap-2 rounded-xl border border-canvas-border/80 bg-canvas/40 px-4 py-3.5 transition hover:border-accent/40 hover:bg-canvas-raised/80 hover:shadow-glow-sm"
              >
                <span className="font-medium text-slate-100 group-hover:text-white">{d.title}</span>
                <span className="font-mono text-xs text-slate-500">{d.file}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
