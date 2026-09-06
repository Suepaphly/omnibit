import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { DOC_META, readDoc, type DocSlug } from '@/lib/docs';

export function generateStaticParams() {
  return DOC_META.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = DOC_META.find((d) => d.slug === slug);
  return { title: meta?.title ?? 'Doc' };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = DOC_META.find((d) => d.slug === slug);
  if (!meta) notFound();
  const md = readDoc(slug as DocSlug);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/docs"
          className="rounded-lg border border-canvas-border/80 bg-canvas-raised/50 px-3 py-1.5 text-sm text-accent-soft transition hover:border-accent/40 hover:bg-canvas-raised"
        >
          ← Docs
        </Link>
        <span className="font-mono text-xs text-slate-500">{meta.file}</span>
      </div>
      <article className="prose prose-invert prose-sm max-w-none rounded-2xl border border-canvas-border/90 bg-canvas-raised/50 p-6 shadow-panel prose-headings:tracking-tight prose-a:text-accent-soft prose-code:text-accent-soft sm:p-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </article>
    </div>
  );
}
