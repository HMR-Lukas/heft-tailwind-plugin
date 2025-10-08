import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const rel = (root, p) => path.relative(root, p).replaceAll(path.sep, '/');

async function safeRead(p) { try { return await fs.readFile(p, 'utf8'); } catch { return ''; } }

async function discover(root) {
  const start = path.join(root, 'src');
  const found = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/(^|[\\/])(lib|dist|temp|node_modules)([\\/]|$)/i.test(p)) continue;
        await walk(p);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('tailwind.css') && !e.name.endsWith('.generated.css')) {
        const txt = await safeRead(p);
        if (/@import\s+["']tailwindcss["']/.test(txt)) {
          found.push({ inFile: p, outFile: p.replace(/\.css$/, '.generated.css') });
        }
      }
    }
  }
  await walk(start);
  return found;
}

async function buildOne({ inFile, outFile, log, root }) {
  const cssIn = await fs.readFile(inFile, 'utf8');
  const result = await postcss([tailwind()]).process(cssIn, { from: inFile, to: outFile, map: false });

  const prev = await safeRead(outFile);
  if (prev !== result.css) {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, result.css, 'utf8');
    log(`[tailwind] Wrote ${rel(root, outFile)} (${result.css.length} bytes)`);
  } else {
    log(`[tailwind] Skipped write (no changes) for ${rel(root, outFile)}`);
  }
}

export async function runAsync(options = {}) {
  const { heftTaskSession, heftConfiguration } = options;
  const log = (heftTaskSession?.logger?.terminal?.writeLine?.bind(heftTaskSession.logger.terminal)) ?? console.log;
  const root = heftConfiguration?.buildFolderPath ?? process.cwd();

  const pairs = await discover(root);
  if (pairs.length === 0) {
    log('[tailwind] No tailwind.css with @import "tailwindcss" found under src/. Nothing to do.');
    return;
  }
  log(`[tailwind] Auto-discovery: ${pairs.length} file(s).`);
  for (const p of pairs) {
    log(`[tailwind] Building ${rel(root, p.inFile)} → ${rel(root, p.outFile)}`);
    await buildOne({ ...p, log, root });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAsync().catch(err => { console.error('[tailwind] Error:', err); process.exit(1); });
}
