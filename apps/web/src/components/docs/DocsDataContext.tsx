'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ContractMeta, DocHeading, GuideMeta, SearchEntry } from '@/lib/docs';

type DocsData = {
  guides: GuideMeta[];
  contracts: ContractMeta[];
  searchCorpus: SearchEntry[];
  headings: DocHeading[];
  setHeadings: (h: DocHeading[]) => void;
};

const DocsDataContext = createContext<DocsData | null>(null);

export function DocsDataProvider({
  guides,
  contracts,
  searchCorpus,
  children,
}: {
  guides: GuideMeta[];
  contracts: ContractMeta[];
  searchCorpus: SearchEntry[];
  children: ReactNode;
}) {
  const [headings, setHeadings] = useState<DocHeading[]>([]);
  const value = useMemo(
    () => ({ guides, contracts, searchCorpus, headings, setHeadings }),
    [guides, contracts, searchCorpus, headings],
  );
  return <DocsDataContext.Provider value={value}>{children}</DocsDataContext.Provider>;
}

export function useDocsData(): DocsData {
  const ctx = useContext(DocsDataContext);
  if (!ctx) throw new Error('useDocsData must be used within DocsDataProvider');
  return ctx;
}

/** Register on-page headings for the right-hand TOC (clears on unmount). */
export function useDocsHeadings(headings: DocHeading[]) {
  const { setHeadings } = useDocsData();
  const key = headings.map((h) => h.id).join('|');
  useEffect(() => {
    setHeadings(headings);
    return () => setHeadings([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures heading identity
  }, [key, setHeadings]);
}
