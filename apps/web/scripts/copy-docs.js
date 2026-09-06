#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const webRoot = path.join(__dirname, '..');
const contentDir = path.join(webRoot, 'content');
const repoRoot = path.join(webRoot, '..', '..');
const docsDir = path.join(repoRoot, 'docs');

fs.mkdirSync(contentDir, { recursive: true });

const files = [
  ['ARCHITECTURE.md', path.join(docsDir, 'ARCHITECTURE.md')],
  ['ACCOUNTING.md', path.join(docsDir, 'ACCOUNTING.md')],
  ['SECURITY.md', path.join(docsDir, 'SECURITY.md')],
  ['GLOSSARY.md', path.join(docsDir, 'GLOSSARY.md')],
  ['README.md', path.join(repoRoot, 'README.md')],
  ['RUNBOOK.md', path.join(docsDir, 'RUNBOOK.md')],
];

for (const [name, src] of files) {
  if (!fs.existsSync(src)) {
    console.warn('[copy-docs] skip missing', src);
    continue;
  }
  fs.copyFileSync(src, path.join(contentDir, name));
  console.log('[copy-docs]', name);
}
