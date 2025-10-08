const fs = require('node:fs/promises');
const path = require('node:path');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');

const rel = (root, p) => path.relative(root, p).replace(/\\/g, '/');
async function safeRead(p){ try { return await fs.readFile(p,'utf8'); } catch { return ''; } }
async function exists(p){ try { await fs.access(p); return true; } catch { return false; } }

async function resolveProjectRoot({ heftRoot, log }) {
  const candidates = [];
  if (heftRoot) candidates.push(heftRoot);
  candidates.push(process.cwd());
  const tried = new Set();
  const pushIfNew = (p) => { const k = path.resolve(p); if (!tried.has(k)) { tried.add(k); candidates.push(k); } };

  const climb = (start) => {
    let cur = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      pushIfNew(cur);
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  };
  if (heftRoot) climb(heftRoot);
  climb(process.cwd());

  for (const cand of candidates) {
    const srcDir = path.join(cand, 'src');
    if (await exists(srcDir)) {
      return cand;
    }
  }

  const fallback = candidates[0] || process.cwd();
  log(`WARN: Could not find a folder containing "src". Falling back to: ${fallback}`);
  return fallback;
}

async function discover(root, log = () => {}) {
  const start = path.join(root, 'src');
  if (!(await exists(start))) {
    log(`WARN: folder not found: ${rel(root, start)}`);
    return [];
  }

  const out = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      log(`WARN: cannot read ${rel(root, dir)}: ${e.message}`);
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/(^|[\\/])(lib|dist|temp|node_modules)([\\/]|$)/i.test(p)) continue;
        await walk(p);
      } else if (e.isFile()) {
        const lower = e.name.toLowerCase();
        if (!lower.endsWith('.css') || lower.endsWith('.generated.css')) continue;
        const txt = await safeRead(p);
        if (/@import\s+['"]tailwindcss['"]/i.test(txt)) {
          out.push({ inFile: p, outFile: p.replace(/\.css$/i, '.generated.css') });
        }
      }
    }
  }

  await walk(start);
  return out;
}

async function buildOne({ inFile, outFile, log, root }) {
  const cssIn = await fs.readFile(inFile, 'utf8');
  const result = await postcss([ tailwind() ]).process(cssIn, { from: inFile, to: outFile, map: false });

  const prev = await safeRead(outFile);
  if (prev !== result.css) {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, result.css, 'utf8');
    log(`Wrote ${rel(root, outFile)} (${result.css.length} bytes)`);
  } else {
    log(`No changes. Skipped write for ${rel(root, outFile)}`);
  }
}

async function runAutoDiscoveryBuild({ root: heftRoot, log }) {
  const projectRoot = await resolveProjectRoot({ heftRoot, log });
  // log(`Searching in ${path.join(projectRoot, 'src')}`);

  const pairs = await discover(projectRoot, log);
  if (pairs.length === 0) {
    log('No tailwind.css with @import "tailwindcss" found in project. Skipping ...');
    return;
  }

  for (const p of pairs) {
    log(`Building ${rel(projectRoot, p.inFile)} → ${rel(projectRoot, p.outFile)}`);
    await buildOne({ ...p, log, root: projectRoot });
  }
}

module.exports = { runAutoDiscoveryBuild };
