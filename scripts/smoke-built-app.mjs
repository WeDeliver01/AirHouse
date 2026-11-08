#!/usr/bin/env node
/**
 * Load the built application in a real browser and fail if it does not render.
 *
 * The journey suite runs against the Vite dev server, which serves unbundled
 * ES modules and never applies `manualChunks`. So all 38 journeys passed
 * while the production bundle rendered nothing at all: the chunks imported
 * each other in a cycle, `React.memo` came back undefined, and the page was
 * blank. Nothing in CI ever opened the built output.
 *
 * This does. Serve dist/, open it, and require that React mounted something
 * and that the console is clean.
 *
 *   node scripts/smoke-built-app.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';

const distDir = 'dist';
const PORT = Number(process.env.SMOKE_PORT || 4178);

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('smoke: dist/index.html is missing. Run the build first.');
  process.exit(2);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// Mirrors the production server: static files, then index.html for anything
// else, so an asset that is genuinely missing shows up the same way here.
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const candidate = path.join(distDir, urlPath);
  const file =
    urlPath !== '/' && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(distDir, 'index.html');

  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const { chromium } = await import('playwright');

// Use a pre-installed browser when there is one at a known path, and
// otherwise let Playwright resolve the copy it manages. That keeps this
// working both in an image that ships Chromium and in CI that installs it.
const preinstalled = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const launchOptions = { args: ['--no-sandbox'] };
if (fs.existsSync(preinstalled)) launchOptions.executablePath = preinstalled;

const browser = await chromium.launch(launchOptions);

const page = await browser.newPage();
const problems = [];

page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  // Network failures to Supabase are expected: the smoke build points at a
  // project this process cannot reach. A broken bundle is not a network error.
  if (/Failed to load resource|net::ERR_|ERR_NAME_NOT_RESOLVED/i.test(text)) return;
  problems.push(`console: ${text}`);
});
page.on('requestfailed', (request) => {
  const url = request.url();
  if (url.includes('/assets/')) problems.push(`asset failed: ${url}`);
});

let rendered = 0;

try {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  rendered = await page.evaluate(() => document.getElementById('root')?.innerHTML?.length ?? 0);
} catch (error) {
  problems.push(`navigation: ${error.message}`);
} finally {
  await browser.close();
  server.close();
}

// A mounted React tree is many kilobytes of markup; an empty or near-empty
// #root means nothing rendered, whatever the status codes said.
const MIN_RENDERED = 500;

if (rendered < MIN_RENDERED) {
  problems.unshift(`#root contains ${rendered} characters; the application did not render.`);
}

if (problems.length > 0) {
  console.error('\nsmoke: the built application does not work in a browser.\n');
  for (const problem of problems.slice(0, 10)) console.error(`  ${problem}`);
  console.error('\nThe dev server does not bundle, so the journey suite cannot');
  console.error('catch this. Check the built chunks: node scripts/check-bundle.mjs\n');
  process.exit(1);
}

console.log(`smoke: the built application renders (${rendered} characters in #root, no console errors).`);
