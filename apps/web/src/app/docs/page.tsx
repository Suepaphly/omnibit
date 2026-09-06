import Link from 'next/link';
import { DOC_META } from '@/lib/docs';
import { Panel } from '@/components/Panel';

export default function DocsIndexPage() {
  return (
    <Panel
      title="Documentation"
      subtitle="Rendered from repo markdown (copied into apps/web/content at build). Not hardcoded duplicates."
    >
      <ul className="space-y-2">
        {DOC_META.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/docs/${d.slug}`}
              className="block rounded-lg border border-canvas-border bg-canvas/40 px-4 py-3 text-slate-200 hover:border-accent/40"
            >
              <span className="font-medium">{d.title}</span>
              <span className="ml-2 font-mono text-xs text-slate-500">{d.file}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
