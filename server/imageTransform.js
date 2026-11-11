/**
 * On-the-fly image variant endpoint: GET /img?src=&w=&f=
 *
 * Same strategy as the Delectables platform's /img endpoint: a developer's
 * uploaded property photo is stored full-size in Supabase Storage and served
 * directly today, so a thumbnail grid of a dozen listings downloads a dozen
 * multi-megabyte originals. This resizes + re-encodes on first request,
 * caches the result on disk, and serves it with an immutable long-lived
 * cache header — every later request for that (source, width, format) is a
 * disk read, not a re-fetch-and-resize.
 *
 * SSRF guard: `src` must be a public object URL under this project's own
 * Supabase Storage bucket. Nothing else is fetched, so this can never be
 * used as an open proxy to an arbitrary URL.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import sharp from 'sharp';

import { config } from './config.js';
import { RateLimiter, rateLimitMiddleware } from './rateLimit.js';

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const ALLOWED_WIDTHS = [64, 96, 128, 200, 256, 400, 600, 800, 1200, 1600, 1920];
// Guard against decompression bombs: refuse to decode absurdly large images.
const IMG_MAX_INPUT_PIXELS = 50_000_000; // ~50MP
const IMG_CACHE_MAX_BYTES = 512 * 1024 * 1024; // 512MB soft cap

const IMG_CACHE_DIR = config.imgCacheDir || path.join(os.tmpdir(), 'airhouse-img-cache');

let imgCacheWarned = false;
function warnImgCacheUnwritable(err) {
  if (imgCacheWarned) return;
  imgCacheWarned = true;
  console.error(
    `[IMG] Variant cache at ${IMG_CACHE_DIR} is NOT writable. Every image will be ` +
      're-fetched and re-encoded on every request instead of served from cache.',
    err,
  );
}

try {
  fs.mkdirSync(IMG_CACHE_DIR, { recursive: true });
  const probe = path.join(IMG_CACHE_DIR, '.write-probe');
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
} catch (err) {
  warnImgCacheUnwritable(err);
}

// Cap concurrency so image decoding can't starve the event loop or the
// container's CPU limit.
sharp.concurrency(2);
sharp.cache(false);

function snapWidth(requested) {
  if (!Number.isFinite(requested) || requested <= 0) return 800;
  for (const w of ALLOWED_WIDTHS) {
    if (w >= requested) return w;
  }
  return ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
}

/**
 * Only a public object under this project's own Supabase Storage bucket may
 * be fetched and transformed — never an arbitrary caller-supplied URL.
 */
function isAllowedSource(src) {
  if (!config.supabaseUrl) return false;
  try {
    const base = new URL(config.supabaseUrl);
    const url = new URL(src);
    return (
      url.protocol === 'https:' &&
      url.host === base.host &&
      url.pathname.startsWith('/storage/v1/object/public/')
    );
  } catch {
    return false;
  }
}

// Probabilistic LRU-ish eviction: once the cache grows past the soft cap,
// delete the oldest files (by mtime) until comfortably under it.
function maybeEvictImgCache() {
  try {
    const files = fs
      .readdirSync(IMG_CACHE_DIR)
      .map((name) => {
        const full = path.join(IMG_CACHE_DIR, name);
        try {
          const stat = fs.statSync(full);
          return { full, size: stat.size, mtime: stat.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= IMG_CACHE_MAX_BYTES) return;

    files.sort((a, b) => a.mtime - b.mtime); // oldest first
    const target = IMG_CACHE_MAX_BYTES * 0.8;
    for (const f of files) {
      if (total <= target) break;
      try {
        fs.unlinkSync(f.full);
        total -= f.size;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

// Single-flight: coalesce concurrent requests for the same uncached variant
// so a burst of identical misses triggers one decode/resize, not N.
const imgInflight = new Map();

const imgRateLimiter = new RateLimiter({ windowMs: 60_000, max: 120 });
const imgRateLimit = rateLimitMiddleware([
  { limiter: imgRateLimiter, keyFor: (req) => req.ip, scope: 'img' },
]);

export function registerImageTransformRoute(app) {
  app.get('/img', imgRateLimit, async (req, res) => {
    try {
      const src = String(req.query.src || '');
      if (!isAllowedSource(src)) {
        return res.status(400).json({ error: 'Invalid image source' });
      }

      const width = snapWidth(parseInt(String(req.query.w || ''), 10));
      const format = req.query.f === 'jpeg' ? 'jpeg' : 'webp';
      // Quality is fixed per format, not client-controllable, so the variant
      // space per source stays small (widths x formats) and can't be inflated.
      const quality = format === 'webp' ? 78 : 82;

      const ext = format === 'webp' ? 'webp' : 'jpg';
      const key = crypto.createHash('sha1').update(`${src}|${width}|${format}|${quality}`).digest('hex');
      const cacheFile = path.join(IMG_CACHE_DIR, `${key}.${ext}`);

      if (fs.existsSync(cacheFile)) {
        res.setHeader('Content-Type', format === 'webp' ? 'image/webp' : 'image/jpeg');
        res.setHeader('Cache-Control', IMMUTABLE_CACHE);
        const stream = fs.createReadStream(cacheFile);
        stream.on('error', () => {
          if (!res.headersSent) res.status(500).end();
        });
        fs.promises.utimes(cacheFile, new Date(), new Date()).catch(() => {});
        return stream.pipe(res);
      }

      let genPromise = imgInflight.get(cacheFile);
      if (!genPromise) {
        genPromise = (async () => {
          const upstream = await fetch(src);
          if (!upstream.ok) {
            const err = new Error(`Upstream fetch failed: ${upstream.status}`);
            err.status = upstream.status === 404 ? 404 : 502;
            throw err;
          }
          const original = Buffer.from(await upstream.arrayBuffer());

          let pipeline = sharp(original, { failOn: 'none', limitInputPixels: IMG_MAX_INPUT_PIXELS })
            .rotate()
            .resize({ width, withoutEnlargement: true });
          pipeline = format === 'webp' ? pipeline.webp({ quality }) : pipeline.jpeg({ quality, mozjpeg: true });

          const out = await pipeline.toBuffer();

          fs.promises
            .writeFile(cacheFile, out)
            .then(() => {
              if (Math.random() < 0.05) maybeEvictImgCache();
            })
            .catch(warnImgCacheUnwritable);

          return out;
        })();
        imgInflight.set(cacheFile, genPromise);
        // Settle-both-ways, NOT .finally(): see the equivalent note in the
        // Delectables implementation this was ported from — .finally()
        // re-raises into an unhandled rejection that can crash the process.
        genPromise.then(
          () => imgInflight.delete(cacheFile),
          () => imgInflight.delete(cacheFile),
        );
      }

      const output = await genPromise;
      res.setHeader('Content-Type', format === 'webp' ? 'image/webp' : 'image/jpeg');
      res.setHeader('Cache-Control', IMMUTABLE_CACHE);
      return res.send(output);
    } catch (error) {
      if (error?.status === 404) {
        return res.status(404).json({ error: 'Image not found' });
      }
      // Graceful fallback: let the browser load the untransformed original.
      const src = String(req.query.src || '');
      if (isAllowedSource(src)) {
        return res.redirect(302, src);
      }
      console.error('Error transforming image:', error);
      return res.status(500).json({ error: 'Failed to process image' });
    }
  });
}
