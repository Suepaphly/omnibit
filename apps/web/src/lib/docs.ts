import fs from 'fs';
import path from 'path';

export type GuideSlug =
  | 'readme'
  | 'architecture'
  | 'accounting'
  | 'security'
  | 'glossary'
  | 'runbook';

export type DocHeading = { id: string; text: string; level: 2 | 3 };

export type GuideMeta = {
  kind: 'guide';
  slug: GuideSlug;
  /** URL path segments after /docs */
  segments: string[];
  href: string;
  file: string;
  title: string;
};

export type ContractMeta = {
  kind: 'contract';
  /** Relative path under content/contracts, e.g. core/AccretiveIndex.sol */
  relPath: string;
  /** URL segments e.g. ['contracts', 'core', 'AccretiveIndex'] */
  segments: string[];
  href: string;
  title: string;
  file: string;
};

export type NavItem = GuideMeta | ContractMeta;

export type SearchEntry = {
  href: string;
  title: string;
  section: 'Guides' | 'Contracts';
  body: string;
};

export const GUIDE_META: GuideMeta[] = [
  { kind: 'guide', slug: 'readme', segments: ['readme'], href: '/docs/readme', file: 'README.md', title: 'README' },
  {
    kind: 'guide',
    slug: 'architecture',
    segments: ['architecture'],
    href: '/docs/architecture',
    file: 'ARCHITECTURE.md',
    title: 'Architecture',
  },
  {
    kind: 'guide',
    slug: 'accounting',
    segments: ['accounting'],
    href: '/docs/accounting',
    file: 'ACCOUNTING.md',
    title: 'Accounting',
  },
  {
    kind: 'guide',
    slug: 'security',
    segments: ['security'],
    href: '/docs/security',
    file: 'SECURITY.md',
    title: 'Security',
  },
  {
    kind: 'guide',
    slug: 'glossary',
    segments: ['glossary'],
    href: '/docs/glossary',
    file: 'GLOSSARY.md',
    title: 'Glossary',
  },
  {
    kind: 'guide',
    slug: 'runbook',
    segments: ['runbook'],
    href: '/docs/runbook',
    file: 'RUNBOOK.md',
    title: 'Runbook',
  },
];

/** @deprecated Use GUIDE_META */
export const DOC_META = GUIDE_META;

export function contentDir(): string {
  return path.join(process.cwd(), 'content');
}

export function contractsDir(): string {
  return path.join(contentDir(), 'contracts');
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function extractHeadings(md: string): DocHeading[] {
  const out: DocHeading[] = [];
  const seen = new Map<string, number>();
  for (const line of md.split('\n')) {
    const m = /^(#{2,3})\s+(.+)$/.exec(line);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    const text = m[2].replace(/\s+#+\s*$/, '').trim();
    let id = slugifyHeading(text);
    if (!id) continue;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    out.push({ id, text: text.replace(/[*_`]/g, ''), level });
  }
  return out;
}

function walkSolFiles(dir: string, base = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSolFiles(full, rel));
    } else if (entry.isFile() && entry.name.endsWith('.sol')) {
      results.push(rel.replace(/\\/g, '/'));
    }
  }
  return results.sort((a, b) => a.localeCompare(b));
}

export function listContracts(): ContractMeta[] {
  return walkSolFiles(contractsDir()).map((relPath) => {
    const withoutExt = relPath.replace(/\.sol$/i, '');
    const segments = ['contracts', ...withoutExt.split('/')];
    const title = path.basename(withoutExt);
    return {
      kind: 'contract' as const,
      relPath,
      segments,
      href: `/docs/${segments.join('/')}`,
      title,
      file: relPath,
    };
  });
}

export function getNavItems(): { guides: GuideMeta[]; contracts: ContractMeta[] } {
  return { guides: GUIDE_META, contracts: listContracts() };
}

export function readGuide(slug: GuideSlug): string {
  const meta = GUIDE_META.find((d) => d.slug === slug);
  if (!meta) return '# Not found';
  const p = path.join(contentDir(), meta.file);
  if (!fs.existsSync(p)) {
    return `# ${meta.title}\n\n_Content file missing. Run prebuild copy-docs._`;
  }
  return fs.readFileSync(p, 'utf8');
}

/** @deprecated Use readGuide */
export function readDoc(slug: GuideSlug): string {
  return readGuide(slug);
}

export function readContract(relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..') || path.isAbsolute(normalized)) return null;
  const p = path.join(contractsDir(), normalized);
  const resolved = path.resolve(p);
  if (!resolved.startsWith(path.resolve(contractsDir()))) return null;
  if (!fs.existsSync(resolved) || !resolved.endsWith('.sol')) return null;
  return fs.readFileSync(resolved, 'utf8');
}

export function resolveDoc(segments: string[]): NavItem | null {
  if (segments.length === 0) return null;
  if (segments[0] === 'contracts') {
    if (segments.length < 2) return null;
    const withoutExt = segments.slice(1).join('/');
    const relPath = `${withoutExt}.sol`;
    const contracts = listContracts();
    return contracts.find((c) => c.relPath === relPath) ?? null;
  }
  if (segments.length === 1) {
    return GUIDE_META.find((g) => g.slug === segments[0]) ?? null;
  }
  return null;
}

export function buildSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const g of GUIDE_META) {
    const body = readGuide(g.slug);
    entries.push({
      href: g.href,
      title: g.title,
      section: 'Guides',
      body: body.slice(0, 12000),
    });
  }
  for (const c of listContracts()) {
    const src = readContract(c.relPath) ?? '';
    entries.push({
      href: c.href,
      title: c.file,
      section: 'Contracts',
      body: src.slice(0, 8000),
    });
  }
  return entries;
}

export function guideStaticParams(): { slug: string[] }[] {
  return GUIDE_META.map((g) => ({ slug: g.segments }));
}

export function contractStaticParams(): { slug: string[] }[] {
  return listContracts().map((c) => ({ slug: c.segments }));
}

export function allDocStaticParams(): { slug: string[] }[] {
  return [...guideStaticParams(), ...contractStaticParams()];
}
