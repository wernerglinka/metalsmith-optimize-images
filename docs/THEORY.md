# Theory of Operation

This document explains how `metalsmith-optimize-images` works and why it is
built the way it is. The README covers usage (including a detailed cache
walkthrough); this covers the design and its invariants.

## Problem

Shipping one large `<img>` per photo wastes bandwidth: browsers download more
pixels and older byte-heavy formats than they need. The modern answer is a
`<picture>` element offering several widths in several formats (AVIF, WebP,
with a JPEG/PNG fallback) so the browser picks the smallest file it supports at
the right size. Producing all those variants by hand is impractical, and doing
it with Sharp on every build is slow — a site with 20 images × 5 widths × 3
formats is 300 files and tens of seconds of work. The plugin automates variant
generation and rewrites the HTML, while a persistent cache keeps repeat builds
(especially clean CI checkouts) from paying the Sharp cost again.

## Pipeline

The plugin is orchestrated by `src/index.js` and decomposed into processors and
utilities:

1. **Config** (`utils/config.js`) deep-merges user options over defaults so
   nested `formatOptions`/`placeholder` can be partially overridden.
2. **HTML processing** (`processors/htmlProcessor.js`) parses each matched HTML
   file with Cheerio, finds `<img>` elements matching `imgSelector`, and for
   each one drives image generation and replaces the tag with a `<picture>` (or
   a progressive-loading wrapper).
3. **Image processing** (`processors/imageProcessor.js`) runs Sharp to produce
   each width×format variant, honoring `skipLarger`, per-format compression
   options, and the cache.
4. **Background images**: after HTML-referenced images are done, images in the
   files object that were never referenced are processed for CSS `image-set()`
   use (1x/2x, hashless filenames).
5. **Progressive loading** (`processors/progressiveProcessor.js`) optionally
   emits a low-quality placeholder plus injected client JS/CSS that swaps in the
   full image on intersection.

Two levels of parallelism (HTML files, then images within a file) are bounded
by `concurrency` so large sites don't exhaust memory or file handles.

## Key decisions

- **Content hashing for HTML images, deterministic names for backgrounds.**
  HTML variant filenames include an MD5 content hash (`hero-640w-a1b2c3d4.webp`)
  so a changed source yields a new filename and the cache misses naturally.
  Background images intentionally omit the hash for easier CSS authoring, which
  means their cache cannot auto-detect content changes — a documented trade-off
  (delete the cache dir to force regeneration).
- **The persistent cache moves the plugin earlier in the pipeline.** With the
  cache on, variants are written into a committed source-tree directory and the
  plugin runs *before* the static-files copy (which then ships the cache dir).
  With the cache off, it runs *after* assets are copied because it needs images
  in the files object. This positional difference is the main integration
  subtlety and is spelled out in the README.
- **`sourcePrefix` bridges disk and build paths.** When running before the copy,
  source images aren't in the files object yet, so the plugin derives a prefix
  from the cache path to read them from disk and map HTML references correctly.
- **Skip what doesn't benefit.** SVGs (vector), external/data URLs, and elements
  opting out via `data-no-responsive` are left untouched.

## Invariants and failure modes

- **No recursive reprocessing.** Generated responsive variants must never be
  treated as source images; background-image discovery filters them out, so
  filenames like `image-320w-640w.jpg` cannot occur.
- **AVIF stays `.avif`.** Sharp's AVIF output is normalized to the `.avif`
  extension rather than `.heif`.
- **Cache read before Sharp.** If an expected variant file already exists it is
  read from disk; Sharp runs only for genuinely missing/changed variants.
- **Errors propagate.** Processing failures route to the plugin callback so a
  broken image fails the build rather than silently emitting partial output.
- **Options are deep-merged into fresh objects**, never mutating the caller's
  options.

## Testing philosophy

Tests use **real Metalsmith instances and real Sharp/filesystem operations**
rather than mocks, so they exercise actual image generation and catch
integration breaks. Because real image processing is slow, the test timeout is
raised (60s) relative to the ecosystem default. Unit tests cover the pure
utilities (hashing, path tokens, config merge); integration tests run full
builds against fixtures.
