import type { ReactNode } from 'react';
import { buildSearchIndex, getNavItems } from '@/lib/docs';
import { DocsDataProvider } from '@/components/docs/DocsDataContext';
import { DocsShell } from '@/components/docs/DocsShell';

export default function DocsLayout({ children }: { children: ReactNode }) {
  const { guides, contracts } = getNavItems();
  const searchCorpus = buildSearchIndex();

  return (
    <DocsDataProvider guides={guides} contracts={contracts} searchCorpus={searchCorpus}>
      <DocsShell>{children}</DocsShell>
    </DocsDataProvider>
  );
}
