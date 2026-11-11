#!/usr/bin/env node
/**
 * Generate optimized variants of the large static marketing images.
 *
 * WHY
 * ---
 * public/images/hero-property.png and campaigns-hero.png are 1408x768
 * photographs saved as PNG (2MB each) and loaded eagerly as a full-bleed CSS
 * background-image on the pages every visitor lands on first. A browser pays
 * for all 2MB before the hero paints, on every visit, because `public/` is
 * served with no cache-busting hash.
 *
 * This generates a WebP variant of each source at build time. The CSS then
 * asks for the WebP first via `image-set()`, falling back to the original
 * PNG/JPG for the handful of browsers that still don't understand it. Output
 * goes to public/images/generated, which is gitignored and regenerated here
 * — the PNGs/JPGs in public/images stay the single point of truth.
 *
 * Runs before both `npm run dev` and `npm run build`. Skipped when the
 * output is already newer than its source, so repeated runs cost nothing.
 */
import sharp from 'sharp';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'public', 'images');
const OUT_DIR = path.join(SRC_DIR, 'generated');

// Decorative, full-bleed backgrounds referenced directly from page CSS
// (see src/pages/public/Home.jsx and Campaigns.jsx). Not a build-time import,
// so Vite never touches these — this script is the only thing that does.
const SOURCES = ['hero-property.png', 'campaigns-hero.png', 'why-platform-bg.png', 'cta-property.jpg'];

async function isStale(src, out) {
  try {
    const [s, o] = await Promise.all([stat(src), stat(out)]);
    return s.mtimeMs > o.mtimeMs;
  } catch {
    return true; // output does not exist yet
  }
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const name of SOURCES) {
    const src = path.join(SRC_DIR, name);
    const base = path.basename(name, path.extname(name));
    const out = path.join(OUT_DIR, `${base}.webp`);

    try {
      await stat(src);
    } catch {
      console.warn(`  skipping ${name}: source not found`);
      continue;
    }

    if (!(await isStale(src, out))) continue;

    const before = (await stat(src)).size;
    await sharp(src).webp({ quality: 78 }).toFile(out);
    const after = (await stat(out)).size;
    console.log(
      `  ${path.relative(ROOT, out)} (${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB)`,
    );
  }
}

run().catch((err) => {
  console.error('Image optimization failed:', err);
  process.exit(1);
});
