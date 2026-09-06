#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const webRoot = path.join(__dirname, '..');
const contentDir = path.join(webRoot, 'content');
const contractsOut = path.join(contentDir, 'contracts');
const repoRoot = path.join(webRoot, '..', '..');
const docsDir = path.join(repoRoot, 'docs');
const srcDir = path.join(repoRoot, 'src');

fs.mkdirSync(contentDir, { recursive: true });

const files = [
  ['ARCHITECTURE.md', path.join(docsDir, 'ARCHITECTURE.md')],
  ['ACCOUNTING.md', path.join(docsDir, 'ACCOUNTING.md')],
  ['SECURITY.md', path.join(docsDir, 'SECURITY.md')],
  ['GLOSSARY.md', path.join(docsDir, 'GLOSSARY.md')],
  ['README.md', path.join(repoRoot, 'README.md')],
  ['RUNBOOK.md', path.join(docsDir, 'RUNBOOK.md')],
  ['SEPOLIA_LAUNCH.md', path.join(docsDir, 'SEPOLIA_LAUNCH.md')],
];

for (const [name, src] of files) {
  if (!fs.existsSync(src)) {
    console.warn('[copy-docs] skip missing', src);
    continue;
  }
  fs.copyFileSync(src, path.join(contentDir, name));
  console.log('[copy-docs]', name);
}

/** Recursively copy .sol files from repo src/ into content/contracts/, preserving relative paths. */
function copySolidityTree(fromDir, toDir, relBase = '') {
  if (!fs.existsSync(fromDir)) {
    console.warn('[copy-docs] skip missing src', fromDir);
    return 0;
  }
  let count = 0;
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const rel = relBase ? path.join(relBase, entry.name) : entry.name;
    const srcPath = path.join(fromDir, entry.name);
    if (entry.isDirectory()) {
      count += copySolidityTree(srcPath, toDir, rel);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.sol')) continue;
    const dest = path.join(toDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(srcPath, dest);
    console.log('[copy-docs] contract', rel.replace(/\\/g, '/'));
    count += 1;
  }
  return count;
}

// Refresh contracts tree so removed files do not linger
if (fs.existsSync(contractsOut)) {
  fs.rmSync(contractsOut, { recursive: true, force: true });
}
fs.mkdirSync(contractsOut, { recursive: true });
const n = copySolidityTree(srcDir, contractsOut);
console.log(`[copy-docs] copied ${n} Solidity sources → content/contracts/`);
