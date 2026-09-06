import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { DOC_META, readDoc, type DocSlug } from '@/lib/docs';

export function generateStaticParams() {
  return DOC_META.map((d) => ({ slug: d.slug }));
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = DOC_META.find((d) => d.slug === slug);
  if (!meta) notFound();
  const md = readDoc(slug as DocSlug);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/docs" className="text-sm text-accent-soft hover:underline">
          ← Docs
        </Link>
        <span className="font-mono text-xs text-slate-500">{meta.file}</span>
      </div>
      <article className="prose prose-invert prose-sm max-w-none rounded-xl border border-canvas-border bg-canvas-raised/40 p-6 prose-headings:tracking-tight prose-a:text-accent-soft prose-code:text-accent-soft">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </article>
    </div>
  );
}
