'use client';

import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import solidity from 'react-syntax-highlighter/dist/esm/languages/prism/solidity';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';

SyntaxHighlighter.registerLanguage('solidity', solidity);

export function SolidityViewer({
  source,
  fileLabel,
}: {
  source: string;
  fileLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-sm text-slate-300">
        <p className="font-medium text-accent-soft">Protocol source</p>
        <p className="mt-1 text-slate-400">
          Read-only copy of on-chain Solidity from the repo <code className="text-accent-soft">src/</code> tree
          (<span className="font-mono text-xs text-slate-300">{fileLabel}</span>). This is the public contract
          source for review — not a live deployment address list.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-canvas-border/90 bg-[#282c34] shadow-panel">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <span className="font-mono text-xs text-slate-400">{fileLabel}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Solidity</span>
        </div>
        <SyntaxHighlighter
          language="solidity"
          style={oneDark}
          showLineNumbers
          wrapLongLines={false}
          customStyle={{
            margin: 0,
            padding: '1rem 0.75rem',
            background: 'transparent',
            fontSize: '0.8rem',
            lineHeight: 1.55,
            maxHeight: '70vh',
            overflow: 'auto',
          }}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: '#636d83',
            userSelect: 'none',
          }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono), ui-monospace, monospace' } }}
        >
          {source}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
