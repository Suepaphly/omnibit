import fs from 'fs';
import path from 'path';

export type DocSlug =
  | 'readme'
  | 'architecture'
  | 'accounting'
  | 'security'
  | 'glossary'
  | 'runbook';

export const DOC_META: { slug: DocSlug; file: string; title: string }[] = [
  { slug: 'readme', file: 'README.md', title: 'README' },
  { slug: 'architecture', file: 'ARCHITECTURE.md', title: 'Architecture' },
  { slug: 'accounting', file: 'ACCOUNTING.md', title: 'Accounting' },
  { slug: 'security', file: 'SECURITY.md', title: 'Security' },
  { slug: 'glossary', file: 'GLOSSARY.md', title: 'Glossary' },
  { slug: 'runbook', file: 'RUNBOOK.md', title: 'Runbook' },
];

export function contentDir(): string {
  return path.join(process.cwd(), 'content');
}

export function readDoc(slug: DocSlug): string {
  const meta = DOC_META.find((d) => d.slug === slug);
  if (!meta) return '# Not found';
  const p = path.join(contentDir(), meta.file);
  if (!fs.existsSync(p)) {
    return `# ${meta.title}\n\n_Content file missing. Run prebuild copy-docs._`;
  }
  return fs.readFileSync(p, 'utf8');
}
