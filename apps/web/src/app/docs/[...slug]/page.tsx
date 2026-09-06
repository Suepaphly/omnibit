import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  allDocStaticParams,
  extractHeadings,
  readContract,
  readGuide,
  resolveDoc,
  type GuideSlug,
} from '@/lib/docs';
import { MarkdownDoc } from '@/components/docs/MarkdownDoc';
import { SolidityViewer } from '@/components/docs/SolidityViewer';
import { DocsHeadingsSync } from '@/components/docs/DocsHeadingsSync';
import { DocsToc } from '@/components/docs/DocsToc';

export function generateStaticParams() {
  return allDocStaticParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const meta = resolveDoc(slug);
  return { title: meta?.title ?? 'Doc' };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const meta = resolveDoc(slug);
  if (!meta) notFound();

  if (meta.kind === 'guide') {
    const md = readGuide(meta.slug as GuideSlug);
    const headings = extractHeadings(md);
    return (
      <div className="space-y-4">
        <DocsHeadingsSync headings={headings} />
        <DocChrome file={meta.file} />
        {headings.length > 0 && (
          <div className="rounded-xl border border-canvas-border/70 bg-canvas/40 p-4 xl:hidden">
            <DocsToc headings={headings} />
          </div>
        )}
        <div className="rounded-2xl border border-canvas-border/90 bg-canvas-raised/50 p-6 shadow-panel sm:p-8">
          <MarkdownDoc source={md} />
        </div>
      </div>
    );
  }

  const source = readContract(meta.relPath);
  if (source == null) notFound();

  return (
    <div className="space-y-4">
      <DocsHeadingsSync headings={[]} />
      <DocChrome file={meta.relPath} />
      <SolidityViewer source={source} fileLabel={meta.relPath} />
    </div>
  );
}

function DocChrome({ file }: { file: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href="/docs"
        className="rounded-lg border border-canvas-border/80 bg-canvas-raised/50 px-3 py-1.5 text-sm text-accent-soft transition hover:border-accent/40 hover:bg-canvas-raised"
      >
        ← Docs
      </Link>
      <span className="font-mono text-xs text-slate-500">{file}</span>
    </div>
  );
}
