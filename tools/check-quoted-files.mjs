// Compares every file that the site quotes in a titled code block with the starter repository.
// Each non-comment line of a quoted block must appear in the file, in the same order; comments,
// whitespace and "…" lines are ignored, and diff blocks are skipped.
//   node tools/check-quoted-files.mjs <docs-content-dir> <starter-dir>
import fs from 'node:fs';
import path from 'node:path';

const [contentDir, starterDir] = process.argv.slice(2);
if (!contentDir || !starterDir) {
  console.error('usage: node tools/check-quoted-files.mjs <docs-content-dir> <starter-dir>');
  process.exit(2);
}

// Files that participants create during the labs, and the starter file each one comes from.
const createdInLabs = {
  'evals/release-notes.eval.yaml': 'lab-files/lab-3/release-notes.eval.yaml',
  '.github/workflows/evals.yml': 'lab-files/lab-7/evals.yml',
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.mdx') ? [path.join(dir, e.name)] : [],
  );
const norm = (line) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('//')) return '';
  return line.replace(/\s+#\s.*$/, '').replace(/\s+/g, ' ').trim();
};

let checked = 0;
let problems = 0;
for (const page of walk(contentDir)) {
  const source = fs.readFileSync(page, 'utf8');
  const blocks = source.matchAll(/^[ \t]*```(\w+)([^\n]*)\n([\s\S]*?)\n[ \t]*```/gm);
  for (const [, lang, meta, body] of blocks) {
    const title = meta.match(/title="([^"]+)"/)?.[1];
    if (!title || lang === 'diff') continue;
    const quoted = title.replace(/\s*\(.*\)$/, '');
    const file = path.join(starterDir, createdInLabs[quoted] ?? quoted);
    if (!fs.existsSync(file)) {
      console.log(`MISSING  ${path.relative(contentDir, page)}: ${title}`);
      problems++;
      continue;
    }
    const fileLines = fs.readFileSync(file, 'utf8').split('\n').map(norm).filter(Boolean);
    const blockLines = body.split('\n').map(norm).filter((l) => l && l !== '…');
    let i = 0;
    const missing = [];
    for (const line of blockLines) {
      let j = i;
      while (j < fileLines.length && fileLines[j] !== line) j++;
      if (j === fileLines.length) missing.push(line);
      else i = j + 1;
    }
    checked++;
    if (missing.length) {
      problems++;
      console.log(`DIFFERS  ${path.relative(contentDir, page)}: ${title}`);
      for (const line of missing.slice(0, 5)) console.log(`         not in the file (or out of order): ${line}`);
    }
  }
}
console.log(`${checked} quoted file(s) checked, ${problems} problem(s).`);
process.exit(problems ? 1 : 0);
