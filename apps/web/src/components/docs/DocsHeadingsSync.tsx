'use client';

import type { DocHeading } from '@/lib/docs';
import { useDocsHeadings } from './DocsDataContext';

/** Client bridge so server pages can register TOC headings. */
export function DocsHeadingsSync({ headings }: { headings: DocHeading[] }) {
  useDocsHeadings(headings);
  return null;
}
