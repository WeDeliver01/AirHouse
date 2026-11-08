#!/usr/bin/env node
/**
 * Refuse to ship a bundle whose chunks import each other in a cycle.
 *
 * Manual chunk splitting (vite.config.js `manualChunks`) decides which
 * modules land in which file. Get it wrong and the chunks reference each
 * other circularly; ES modules in a cycle evaluate one side before the
 * other's exports exist, so a library reading `React.memo` at module scope
 * gets `undefined` and the application renders nothing:
 *
 *   Uncaught TypeError: Cannot read properties of undefined (reading 'memo')
 *
 * This shipped. Every server-side check passed -- the HTML and the assets
 * returned 200, the proxy, TLS and health checks were all correct -- because
 * the failure is entirely in the browser. Nothing in the test suite looked at
 * the built output, so nothing caught it.
 *
 * Runs as part of `npm run build`, so a cyclic bundle never reaches an image.
 */
import fs from 'fs';
import path from 'path';

const distDir = process.argv[2] || 'dist';
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error(`check-bundle: ${assetsDir} does not exist. Run the build first.`);
  process.exit(2);
}

/** Strip Rollup's content hash so chunks are named as the config names them. */
const chunkName = (file) => file.replace(/-[A-Za-z0-9_-]{8,}\.js$/, '');

const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
const graph = new Map();

for (const file of files) {
  const source = fs.readFileSync(path.join(assetsDir, file), 'utf8');
  const targets = new Set();

  // STATIC imports and re-exports only -- `from"./x.js"` and `import"./x.js"`.
  //
  // Dynamic `import("./x.js")` is deliberately excluded. Lazily loaded route
  // chunks import shared components back out of the entry chunk all the time,
  // which looks like a cycle in a naive graph but is not one: a dynamic import
  // is evaluated later, on demand, so neither side can observe the other
  // half-initialised. Only static cycles produce the undefined-export failure
  // this check exists for.
  const staticImport = /(?:\bfrom|(?:^|[;}\s])import)\s*["']\.\/([A-Za-z0-9_.-]+\.js)["']/g;

  for (const match of source.matchAll(staticImport)) {
    const target = match[1];
    if (target !== file) targets.add(chunkName(target));
  }

  graph.set(chunkName(file), targets);
}

/** Every cycle reachable in the chunk graph, as a path of chunk names. */
function findCycles(g) {
  const cycles = [];
  const seen = new Set();
  const onPath = new Set();
  const stack = [];

  function walk(node) {
    if (onPath.has(node)) {
      const start = stack.indexOf(node);
      const cycle = stack.slice(start).concat(node);
      const key = [...cycle].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push(cycle);
      }
      return;
    }
    if (stack.includes(node)) return;

    onPath.add(node);
    stack.push(node);
    for (const next of g.get(node) || []) walk(next);
    stack.pop();
    onPath.delete(node);
  }

  for (const node of g.keys()) walk(node);
  return cycles;
}

const cycles = findCycles(graph);

if (cycles.length > 0) {
  console.error('\ncheck-bundle: the built chunks import each other in a cycle.\n');
  for (const cycle of cycles) console.error(`  ${cycle.join(' -> ')}`);
  console.error('\nThe browser will evaluate one of these before the other is');
  console.error('initialised, and the page will render nothing at all.');
  console.error('\nFix manualChunks in vite.config.js so a chunk never imports a');
  console.error('chunk that imports it back. Keep a library and its dependencies');
  console.error('together, and give separate chunks only to leaves.\n');
  process.exit(1);
}

// A referenced file that is not in the build would be served as index.html by
// the SPA fallback, with a 200 and a text/html content type, which the browser
// refuses as a module script. Same blank page, different cause.
const indexHtml = path.join(distDir, 'index.html');
const missing = [];

if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    const referenced = path.join(distDir, match[1]);
    if (!fs.existsSync(referenced)) missing.push(match[1]);
  }
}

if (missing.length > 0) {
  console.error('\ncheck-bundle: index.html references files that were not built:\n');
  for (const file of missing) console.error(`  ${file}`);
  console.error('\nThese would be served as index.html by the SPA fallback, and');
  console.error('the browser refuses an HTML response as a module script.\n');
  process.exit(1);
}

console.log(`check-bundle: ${graph.size} chunks, no cycles, all references resolve.`);
