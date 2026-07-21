/**
 * Image processing utilities for creating responsive image variants
 * Handles the core Sharp.js operations for resizing and format conversion
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { generateHash } from '../utils/hash.js';
import { generateVariantPath } from '../utils/paths.js';

/**
 * Process an image into multiple responsive variants and formats
 * @param {Buffer} buffer - Original image buffer
 * @param {string} originalPath - Original image path
 * @param {Function} debugFn - Debug function for logging
 * @param {Object} config - Plugin configuration
 * @param {string} [cacheDir] - Absolute path to the persistent cache directory (e.g., lib/assets/images/responsive)
 * @return {Promise<Array<Object>>} - Array of generated variants
 */
export async function processImageToVariants(buffer, originalPath, debugFn, config, cacheDir) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const variants = [];
  const hash = generateHash(buffer);

  // Determine which widths to generate based on skipLarger setting
  // If skipLarger is true (default), don't generate sizes larger than original
  const targetWidths = config.skipLarger ? config.widths.filter((w) => w <= metadata.width) : config.widths;

  if (targetWidths.length === 0) {
    debugFn(`Skipping ${originalPath} - no valid target widths`);
    return [];
  }

  // Check if all variants already exist in the persistent cache directory.
  // The content hash in each filename ensures correctness — if the source image
  // changes, the hash changes, filenames differ, and the cache misses naturally.
  if (cacheDir) {
    const cached = await loadCachedVariants(originalPath, hash, targetWidths, config, cacheDir, metadata, debugFn);
    if (cached) {
      return cached;
    }
  }

  // Process all widths in parallel for better performance
  const widthPromises = targetWidths.map(async (width) => {
    // Create a Sharp instance for this width - clone to avoid conflicts
    const resized = image.clone().resize({
      width,
      withoutEnlargement: config.skipLarger // Prevents upscaling small images
    });

    // Get actual dimensions after resize (may be smaller than requested width)
    const resizedMeta = await resized.metadata();

    // Process each format in parallel for this width
    const formatPromises = config.formats.map(async (format) => {
      try {
        // Skip problematic format combinations (e.g., webp -> original doesn't make sense)
        if (format === 'original' && metadata.format.toLowerCase() === 'webp') {
          return null;
        }

        let formatted;
        const outputPath = generateVariantPath(originalPath, width, format, hash, config);

        // Apply format-specific processing with quality/compression settings
        if (format === 'original') {
          // For 'original' format, use the source image format
          const originalFormat = metadata.format.toLowerCase();
          const formatOptions = config.formatOptions[originalFormat] || {};
          formatted = resized.clone().toFormat(originalFormat, formatOptions);
        } else {
          // For specific formats (avif, webp, etc.), apply format-specific options
          const formatOptions = config.formatOptions[format] || {};
          if (format === 'avif') {
            formatted = resized.clone().avif(formatOptions);
          } else if (format === 'webp') {
            formatted = resized.clone().webp(formatOptions);
          } else if (format === 'jpeg') {
            formatted = resized.clone().jpeg(formatOptions);
          } else if (format === 'png') {
            formatted = resized.clone().png(formatOptions);
          } else {
            formatted = resized.clone()[format](formatOptions);
          }
        }

        // Generate the actual image buffer - this is where compression happens
        const formatBuffer = await formatted.toBuffer();

        return {
          path: outputPath,
          buffer: formatBuffer,
          width,
          format: format === 'original' ? metadata.format.toLowerCase() : format,
          originalFormat: metadata.format.toLowerCase(),
          size: formatBuffer.length,
          height: resizedMeta.height
        };
      } catch (err) {
        debugFn(`Error generating ${format} variant for ${originalPath} at width ${width}: ${err.message}`);
        return null;
      }
    });

    // Wait for all formats at this width to complete
    const formatResults = await Promise.all(formatPromises);
    return formatResults.filter((v) => v !== null);
  });

  // Wait for all widths to complete and flatten the results
  const widthResults = await Promise.all(widthPromises);
  variants.push(...widthResults.flat());

  // Persist newly generated variants to the cache directory so subsequent
  // builds (local or CI) can skip Sharp entirely for this image.
  if (cacheDir && variants.length > 0) {
    for (const variant of variants) {
      const cachePath = path.join(cacheDir, path.basename(variant.path));
      fs.writeFileSync(cachePath, variant.buffer);
    }
    debugFn(`Wrote ${variants.length} variants to cache for ${originalPath}`);
  }

  return variants;
}

/**
 * Loads previously generated variants from the persistent cache directory.
 * Variant files live directly in cacheDir (flat structure, no subdirectories).
 * Returns the loaded variants array, or null on any cache miss.
 * @param {string} originalPath - Original image path
 * @param {string} hash - Content hash of the source image
 * @param {number[]} targetWidths - Array of widths to check
 * @param {Object} config - Plugin configuration
 * @param {string} cacheDir - Absolute path to the cache directory (e.g., lib/assets/images/responsive)
 * @param {Object} sourceMetadata - Sharp metadata of the source image
 * @param {Function} debugFn - Debug function
 * @return {Promise<Array<Object>|null>} - Loaded variants or null on cache miss
 */
async function loadCachedVariants(originalPath, hash, targetWidths, config, cacheDir, sourceMetadata, debugFn) {
  const expected = [];

  for (const width of targetWidths) {
    for (const format of config.formats) {
      if (format === 'original' && sourceMetadata.format.toLowerCase() === 'webp') {
        continue;
      }
      const variantPath = generateVariantPath(originalPath, width, format, hash, config);
      const fullPath = path.join(cacheDir, path.basename(variantPath));
      expected.push({ variantPath, fullPath, width, format });
    }
  }

  // Quick existence check — bail on first miss
  for (const ev of expected) {
    if (!fs.existsSync(ev.fullPath)) {
      return null;
    }
  }

  // All variants found on disk, load them
  debugFn(`Loading ${expected.length} cached variants for ${originalPath}`);

  // Compute height from the source aspect ratio instead of calling sharp().metadata()
  // on every cached file — avoids spinning up Sharp entirely on cache hits.
  const aspectRatio = sourceMetadata.height / sourceMetadata.width;

  const variants = expected.map((ev) => {
    const buffer = fs.readFileSync(ev.fullPath);
    const resolvedFormat = ev.format === 'original' ? sourceMetadata.format.toLowerCase() : ev.format;

    return {
      path: ev.variantPath,
      buffer,
      width: ev.width,
      format: resolvedFormat,
      originalFormat: sourceMetadata.format.toLowerCase(),
      size: buffer.length,
      height: Math.round(ev.width * aspectRatio)
    };
  });

  return variants;
}

/**
 * Process a single image
 * @param {Object} context - Processing context
 * @param {Object} context.$ - Cheerio instance
 * @param {Object} context.img - Image DOM element
 * @param {Object} context.files - Metalsmith files object
 * @param {Object} context.metalsmith - Metalsmith instance
 * @param {Map} context.processedImages - Cache of processed images
 * @param {Function} context.debug - Debug function
 * @param {Object} context.config - Plugin configuration
 * @param {Function} context.replacePictureElement - Function to replace img with picture
 * @param {string|null} context.cacheDir - Resolved absolute path to persistent cache, or null
 * @param {string|null} context.sourcePrefix - Prefix to map build paths to source asset paths on disk, or null
 * @return {Promise<void>} - Promise that resolves when the image is processed
 */
export async function processImage({
  $,
  img,
  files,
  metalsmith,
  processedImages,
  debug,
  config,
  replacePictureElement,
  cacheDir,
  sourcePrefix
}) {
  const $img = $(img);
  const src = $img.attr('src');

  if (!src || src.startsWith('http') || src.startsWith('data:')) {
    debug(`Skipping external or data URL: ${src}`);
    return;
  }

  // Skip SVG files - they are vector graphics that don't need responsive raster variants
  if (src.toLowerCase().endsWith('.svg')) {
    debug(`Skipping SVG file (vector graphics don't need responsive variants): ${src}`);
    return;
  }

  // Normalize src path to match Metalsmith files object keys
  // Remove leading slash if present (HTML paths vs Metalsmith file keys)
  const normalizedSrc = src.startsWith('/') ? src.slice(1) : src;

  // Image not in Metalsmith files object — try alternative locations on disk
  if (!files[normalizedSrc]) {
    let loaded = false;

    // When cache is configured and the plugin runs before the static-files copy,
    // source images live on disk at sourcePrefix + normalizedSrc
    if (sourcePrefix && !loaded) {
      try {
        const sourcePath = path.resolve(metalsmith.directory(), sourcePrefix, normalizedSrc);
        if (fs.existsSync(sourcePath)) {
          files[normalizedSrc] = {
            contents: fs.readFileSync(sourcePath),
            mtime: fs.statSync(sourcePath).mtimeMs
          };
          loaded = true;
        }
      } catch (err) {
        debug(`Error loading source image from ${sourcePrefix}: ${err.message}`);
      }
    }

    // Fallback: try the build directory (handles post-static-copy scenario)
    if (!loaded) {
      try {
        const destination = metalsmith.destination();
        const imagePath = path.join(destination, normalizedSrc);

        // Security: Ensure resolved path stays within destination directory
        const resolvedPath = path.resolve(imagePath);
        const resolvedDestination = path.resolve(destination);
        if (!resolvedPath.startsWith(resolvedDestination + path.sep)) {
          debug(`Skipping path traversal attempt: ${normalizedSrc}`);
          return;
        }

        if (fs.existsSync(imagePath)) {
          files[normalizedSrc] = {
            contents: fs.readFileSync(imagePath),
            mtime: fs.statSync(imagePath).mtimeMs
          };
          loaded = true;
        }
      } catch (err) {
        debug(`Error loading image from build directory: ${err.message}`);
      }
    }

    if (!loaded) {
      debug(`Image not found: ${normalizedSrc}`);
      return;
    }
  }

  // Create a cache key that includes the file path and modification time
  // This prevents reprocessing the same image multiple times in a single build
  const fileMtime = files[normalizedSrc].mtime || Date.now();
  const cacheKey = `${normalizedSrc}:${fileMtime}`;

  // Check if we've already processed this exact image (same file + mtime)
  if (processedImages.has(cacheKey)) {
    debug(`Using cached variants for ${normalizedSrc}`);
    const variants = processedImages.get(cacheKey);
    replacePictureElement($, $img, variants, config);
    return;
  }

  debug(`Processing image: ${normalizedSrc}`);

  try {
    // Process image to generate all variants (different sizes and formats)
    const variants = await processImageToVariants(
      files[normalizedSrc].contents,
      normalizedSrc,
      debug,
      config,
      cacheDir
    );

    // When cache is configured, variant files are written to cacheDir by
    // processImageToVariants and the static-files plugin copies them to the build.
    // When cache is NOT configured, add variants to the files object directly.
    if (!cacheDir) {
      variants.forEach((variant) => {
        files[variant.path] = {
          contents: variant.buffer
        };
      });
    }

    // Cache variants for this image to avoid reprocessing
    processedImages.set(cacheKey, variants);

    // Replace the original <img> tag with a responsive <picture> element
    replacePictureElement($, $img, variants, config);
  } catch (err) {
    debug(`Error processing image: ${err.message}`);
  }
}
