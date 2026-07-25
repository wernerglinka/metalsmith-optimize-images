/**
 * Source-image resolution for <img src> references.
 *
 * An image referenced from HTML may live in several places depending on how
 * the site moves static assets into the build:
 *
 * 1. The Metalsmith files object — the image is part of the file tree.
 * 2. The Metalsmith source directory — the image is copied outside the file
 *    tree at build finalization (metalsmith.statik()), so at plugin time it
 *    only exists on disk under source().
 * 3. sourcePrefix + path relative to the project directory — legacy layout
 *    where assets live next to (not inside) the source directory and a
 *    static-files plugin copies them later. Derived from the cache path.
 * 4. The build directory — a copy plugin already ran earlier in the pipeline.
 *
 * The lookups run in that order; the first hit wins. Checking source() before
 * the build directory keeps clean and incremental builds identical: what is
 * left in build/ from a previous run can never change the outcome.
 */
import path from 'node:path';
import fs from 'node:fs';

/**
 * Check that an absolute candidate path stays inside a base directory.
 * Guards against `..` segments in HTML src attributes escaping the project.
 * @param {string} base - Directory the candidate must resolve inside
 * @param {string} candidate - Path to validate
 * @return {boolean} - True when candidate is base or inside it
 */
function isWithin(base, candidate) {
  const resolvedBase = path.resolve(base);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(resolvedBase + path.sep);
}

/**
 * Try to load a file from disk into the Metalsmith files object under `key`.
 * @param {Object} files - Metalsmith files object
 * @param {string} key - Files-object key to store the image under
 * @param {string} candidate - Absolute path to try on disk
 * @param {string} base - Directory the candidate must stay inside
 * @param {Function} debug - Debug function
 * @param {string} label - Lookup name for debug output
 * @return {boolean} - True when the file was found and loaded
 */
function tryLoadFromDisk(files, key, candidate, base, debug, label) {
  try {
    if (!isWithin(base, candidate)) {
      debug(`Skipping ${label} lookup outside its base directory: ${key}`);
      return false;
    }
    if (!fs.existsSync(candidate)) {
      return false;
    }
    files[key] = {
      contents: fs.readFileSync(candidate),
      mtime: fs.statSync(candidate).mtimeMs
    };
    debug(`Resolved ${key} from ${label}: ${candidate}`);
    return true;
  } catch (err) {
    debug(`Error loading ${key} from ${label}: ${err.message}`);
    return false;
  }
}

/**
 * Resolve an image referenced from HTML, loading it into the files object
 * when it is found on disk. On success `files[normalizedSrc]` is populated.
 * @param {string} normalizedSrc - Image path with any leading slash removed
 * @param {Object} files - Metalsmith files object
 * @param {Object} metalsmith - Metalsmith instance
 * @param {string|null} sourcePrefix - Prefix mapping build paths to disk paths, or null
 * @param {Function} debug - Debug function
 * @param {Object} [stats] - Optional tracker: { resolved: Set, missed: Set }
 * @return {boolean} - True when the image is available in the files object
 */
export function resolveImage(normalizedSrc, files, metalsmith, sourcePrefix, debug, stats) {
  let found = Boolean(files[normalizedSrc]);

  // Metalsmith source directory: covers images copied outside the file tree
  // at build finalization (metalsmith.statik(['assets']) with src/assets/...)
  if (!found) {
    found = tryLoadFromDisk(
      files,
      normalizedSrc,
      path.join(metalsmith.source(), normalizedSrc),
      metalsmith.source(),
      debug,
      'source directory'
    );
  }

  // Legacy layout: assets live at sourcePrefix + normalizedSrc relative to
  // the project directory (derived from the cache path in createPlugin)
  if (!found && sourcePrefix) {
    found = tryLoadFromDisk(
      files,
      normalizedSrc,
      path.join(metalsmith.directory(), sourcePrefix, normalizedSrc),
      metalsmith.directory(),
      debug,
      'source prefix'
    );
  }

  // Build directory: a static-copy plugin already ran earlier in the pipeline
  if (!found) {
    found = tryLoadFromDisk(
      files,
      normalizedSrc,
      path.join(metalsmith.destination(), normalizedSrc),
      metalsmith.destination(),
      debug,
      'build directory'
    );
  }

  if (stats) {
    if (found) {
      stats.resolved.add(normalizedSrc);
    } else {
      stats.missed.add(normalizedSrc);
    }
  }

  if (!found) {
    debug(`Image not found: ${normalizedSrc}`);
  }

  return found;
}
