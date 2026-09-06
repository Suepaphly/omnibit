'use client';

import type { ReactElement, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { slugifyHeading } from './slugify';

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return flattenText(el.props.children);
  }
  return '';
}

function makeUniqueIdFactory() {
  const seen = new Map<string, number>();
  return (children: ReactNode) => {
    const text = flattenText(children);
    let id = slugifyHeading(text);
    if (!id) id = 'section';
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    return id;
  };
}

export function MarkdownDoc({ source }: { source: string }) {
  const uniqueId = makeUniqueIdFactory();

  const components: Components = {
    h2: ({ children }) => {
      const id = uniqueId(children);
      return (
        <h2 id={id} className="scroll-mt-28 group">
          <a href={`#${id}`} className="no-underline hover:underline">
            {children}
          </a>
        </h2>
      );
    },
    h3: ({ children }) => {
      const id = uniqueId(children);
      return (
        <h3 id={id} className="scroll-mt-28 group">
          <a href={`#${id}`} className="no-underline hover:underline">
            {children}
          </a>
        </h3>
      );
    },
  };

  return (
    <article className="prose prose-invert prose-sm max-w-none prose-headings:tracking-tight prose-a:text-accent-soft prose-code:text-accent-soft prose-pre:bg-canvas prose-pre:border prose-pre:border-canvas-border/80">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </article>
  );
}
