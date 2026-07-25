/**
 * Metalsmith plugin for generating responsive images with optimal formats
 * @module metalsmith-optimize-images
 */

/**
 * @typedef {Object} Options
 * @property {number[]} [widths=[320, 640, 960, 1280, 1920]] - Array of image widths to generate
 * @property {string[]} [formats=['avif', 'webp', 'original']] - Array of image formats to generate (in order of preference)
 * @property {Object} [formatOptions] - Format-specific compression settings
 * @property {Object} [formatOptions.avif] - AVIF compression options
 * @property {Object} [formatOptions.webp] - WebP compression options
 * @property {Object} [formatOptions.jpeg] - JPEG compression options
 * @property {Object} [formatOptions.png] - PNG compression options
 * @property {string} [htmlPattern='**\/*.html'] - Glob pattern to match HTML files
 * @property {string} [imgSelector='img:not([data-no-responsive])'] - CSS selector for images to process
 * @property {string} [outputDir='assets/images/responsive'] - Output directory for processed images
 * @property {string} [outputPattern='[filename]-[width]w-[hash].[format]'] - Output naming pattern
 * @property {boolean} [skipLarger=true] - Whether to skip generating sizes larger than original
 * @property {boolean} [lazy=true] - Whether to add loading="lazy" to images
 * @property {boolean} [dimensionAttributes=true] - Whether to add width/height attributes
 * @property {string} [sizes] - Default sizes attribute
 * @property {number} [concurrency=5] - Maximum number of images to process in parallel
 * @property {boolean} [generateMetadata=false] - Whether to generate a metadata JSON file
 * @property {boolean} [isProgressive=false] - Whether to use progressive image loading
 * @property {Object} [placeholder] - Placeholder image settings for progressive loading
 * @property {number} [placeholder.width=50] - Placeholder image width
 * @property {number} [placeholder.quality=30] - Placeholder image quality
 * @property {number} [placeholder.blur=10] - Placeholder image blur amount
 * @property {boolean} [processUnusedImages=true] - Whether to process unused images for background use
 * @property {string} [imagePattern='**\/*.{jpg,jpeg,png,gif,webp,avif}'] - Glob pattern to find images for background processing
 * @property {string} [imageFolder='lib/assets/images'] - Folder to scan for background images, relative to source
 */

import path from 'node:path';
import fs from 'node:fs';
import * as mkdirp from 'mkdirp';
import sharp from 'sharp';
import { buildConfig } from './utils/config.js';
import { processHtmlFile, generateMetadata } from './processors/htmlProcessor.js';

/**
 * Assert that a user-supplied path option stays within a base directory.
 * Guards against `outputDir`/`cache` escaping the build via `..` segments
 * or an absolute path pointing elsewhere.
 * @param {string} base - Directory the target must resolve inside
 * @param {string} target - User-supplied path to validate
 * @param {string} label - Option name, used in the error message
 * @returns {string} The resolved, validated absolute target path
 */
function assertWithin(base, target, label) {
  const resolvedBase = path.resolve(base);
  const resolvedTarget = path.resolve(resolvedBase, target);
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new Error(`Invalid ${label}: "${target}" resolves outside the build directory`);
  }
  return resolvedTarget;
}

/**
 * Creates a responsive images plugin for Metalsmith
 * Generates multiple sizes and formats of images and replaces img tags with picture elements
 *
 * @param {Options} [options={}] - Configuration options for the plugin
 * @returns {import('metalsmith').Plugin} - Metalsmith plugin function
 */
function optimizeImagesPlugin(options = {}) {
  // Build configuration with defaults and user options
  const config = buildConfig(options);

  /**
   * The Metalsmith plugin function
   * @param {Object} files - Metalsmith files object
   * @param {Object} metalsmith - Metalsmith instance
   * @param {Function} done - Callback function
   * @return {void}
   */
  return async function optimizeImages(files, metalsmith, done) {
    try {
      const destination = metalsmith.destination();
      const outputPath = assertWithin(destination, config.outputDir, 'outputDir');

      // Set up debug function for logging (uses 'DEBUG=metalsmith-optimize-images*' env var)
      const debug = metalsmith.debug('metalsmith-optimize-images');

      // Resolve persistent cache directory from config.
      // When set (e.g., 'lib/assets/images/responsive'), variants are read/written there
      // and the static-files plugin copies them to the build.
      let cacheDir = null;
      let sourcePrefix = null;

      if (config.cache) {
        // Normalise: cache: true → default path 'lib/<outputDir>'
        const cachePath = typeof config.cache === 'string' ? config.cache : path.join('lib', config.outputDir);

        // The boolean form assumes a lib/-based layout. Creating lib/ in a
        // project that has none (e.g. images under src/assets) is almost
        // certainly wrong — say so instead of silently making the directory.
        if (typeof config.cache !== 'string' && !fs.existsSync(path.join(metalsmith.directory(), 'lib'))) {
          console.warn(
            `metalsmith-optimize-images: cache: true defaults to "${cachePath}" but this project has no lib/ directory. ` +
              `Pass an explicit path instead, e.g. cache: 'src/${config.outputDir}'.`
          );
        }

        cacheDir = assertWithin(metalsmith.directory(), cachePath, 'cache');
        mkdirp.mkdirpSync(cacheDir);

        // Derive the source-asset prefix so the plugin can find images on disk
        // when it runs before the static-files copy.
        // e.g., cachePath='lib/assets/images/responsive', outputDir='assets/images/responsive'
        //   → sourcePrefix = 'lib/' (the part of cachePath that precedes outputDir)
        if (cachePath.endsWith(config.outputDir)) {
          sourcePrefix = cachePath.slice(0, cachePath.length - config.outputDir.length);
        }

        debug(`Persistent cache: ${cacheDir}`);
      }

      // Ensure the output directory exists where processed images will be saved
      mkdirp.mkdirpSync(outputPath);

      // Find all HTML files that match the pattern (default: **/*.html)
      // Also ensure they actually end with .html to avoid processing CSS/JS files
      const htmlFiles = Object.keys(files).filter((file) => {
        // Must match the HTML pattern
        if (!metalsmith.match(config.htmlPattern, file)) {
          return false;
        }

        // Must actually be an HTML file
        if (!file.endsWith('.html')) {
          return false;
        }

        return true;
      });

      if (htmlFiles.length === 0) {
        debug('No HTML files found');
        return done();
      }

      // Cache to avoid re-processing identical images across different HTML files
      // Key: "filepath:mtime", Value: array of processed image variants
      const processedImages = new Map();

      // Track image resolution across the whole build so a run where lookups
      // fail is reported loudly instead of only at debug level
      const stats = { resolved: new Set(), missed: new Set() };

      // Chunk HTML files to respect concurrency limit (default: 5)
      // This prevents overwhelming the system with too many parallel operations
      const chunks = [];
      for (let i = 0; i < htmlFiles.length; i += config.concurrency) {
        chunks.push(htmlFiles.slice(i, i + config.concurrency));
      }

      // Process all chunks in parallel - each chunk processes its files in parallel
      // This creates a two-level parallelism: chunk-level and file-level within chunks
      await Promise.all(
        chunks.map(async (chunk) => {
          // Process files within each chunk in parallel
          await Promise.all(
            chunk.map(async (htmlFile) => {
              // This function parses HTML, finds images, processes them, and updates the HTML
              await processHtmlFile(
                htmlFile,
                files[htmlFile],
                files,
                metalsmith,
                processedImages,
                debug,
                config,
                cacheDir,
                sourcePrefix,
                stats
              );
            })
          );
        })
      );

      // A build where image lookups failed ships untouched markup. Make that
      // visible on stdout instead of leaving it buried at debug level.
      if (stats.missed.size > 0) {
        const missedList = [...stats.missed].slice(0, 5).join(', ');
        const suffix = stats.missed.size > 5 ? ', …' : '';
        const totalFailure =
          stats.resolved.size === 0
            ? ' Every lookup failed — check where your images live relative to the Metalsmith source directory.'
            : '';
        console.warn(
          `metalsmith-optimize-images: ${stats.missed.size} image path(s) referenced in HTML could not be resolved ` +
            `and were left untouched: ${missedList}${suffix}.${totalFailure}`
        );
      }

      // Process unused images for background image support
      // This finds images that weren't processed during HTML scanning and creates variants
      // for use in CSS background-image with image-set()
      if (config.processUnusedImages) {
        await processUnusedImages(files, metalsmith, processedImages, debug, config, cacheDir);
      }

      // Optional: Generate a JSON metadata file with information about all processed images
      // Useful for debugging or integration with other tools
      if (config.generateMetadata) {
        generateMetadata(processedImages, files, config);
      }

      debug('Responsive images processing complete');
      done();
    } catch (err) {
      // Use console.error for errors to ensure they're visible even if debug mode is not enabled
      console.error(`Error in responsive images plugin: ${err.message}`);
      done(err);
    }
  };
}

/**
 * Process unused images for background image support
 * Finds images that weren't processed during HTML scanning and creates 1x/2x variants
 * for use in CSS background-image with image-set()
 * @param {Object} files - Metalsmith files object
 * @param {Object} metalsmith - Metalsmith instance
 * @param {Map} processedImages - Cache of already processed images
 * @param {Function} debug - Debug function
 * @param {Object} config - Plugin configuration
 * @return {Promise<void>} - Promise that resolves when processing is complete
 */
async function processUnusedImages(files, metalsmith, processedImages, debug, config, cacheDir) {
  debug('Processing unused images for background image support');

  // Get all image paths that were already processed during HTML scanning
  const processedImagePaths = new Set();
  processedImages.forEach((_variants, cacheKey) => {
    const [imagePath] = cacheKey.split(':');
    processedImagePaths.add(imagePath);
  });

  debug(`Processed image paths from HTML: ${Array.from(processedImagePaths).join(', ')}`);

  // Find images that weren't processed during HTML scanning using hybrid approach
  const allBackgroundImages = await findUnprocessedImages(files, metalsmith, config, processedImagePaths, debug);
  debug(`Background images found to process: ${allBackgroundImages.map((img) => img.path).join(', ')}`);

  if (allBackgroundImages.length === 0) {
    debug('No unused images found to process');
    return;
  }

  debug(`Found ${allBackgroundImages.length} unused images to process for background use`);

  // Process background images in parallel for better performance
  await Promise.all(
    allBackgroundImages.map(async (imageObj) => {
      try {
        debug(`Processing background image: ${imageObj.path} (source: ${imageObj.source})`);

        // Generate background variants with original size and half size
        const variants = await processBackgroundImageVariants(imageObj.buffer, imageObj.path, debug, config, cacheDir);

        // When cache is configured, variant files are written to cacheDir by
        // processBackgroundImageVariants and the static-files plugin copies them.
        // Otherwise, add them to the files object directly.
        if (!cacheDir) {
          variants.forEach((variant) => {
            files[variant.path] = {
              contents: variant.buffer
            };
          });
        }

        // Cache the variants (using current timestamp as mtime for unused images)
        const cacheKey = `${imageObj.path}:${Date.now()}`;
        processedImages.set(cacheKey, variants);

        debug(`Generated ${variants.length} background variants for ${imageObj.path}`);
      } catch (err) {
        debug(`Error processing background image ${imageObj.path}: ${err.message}`);
      }
    })
  );

  debug('Background image processing complete');
}

/**
 * Check whether a files-object path is a generated responsive variant
 * (or the metadata manifest) rather than a source image
 * @param {string} filePath - Files-object key
 * @param {Object} config - Plugin configuration
 * @return {boolean} - True when the path should be excluded from background processing
 */
function isResponsiveVariant(filePath, config) {
  return (
    filePath.startsWith(`${config.outputDir}/`) ||
    filePath.includes('/responsive/') ||
    filePath.includes('responsive-images-manifest.json') ||
    /-\d+w(-[a-f0-9]+)?\.(avif|webp|jpg|jpeg|png)$/i.test(filePath)
  );
}

/**
 * Recursively scan an image folder on disk for unprocessed source images
 * @param {string} dir - Absolute directory to scan
 * @param {string} relativePath - Path of dir relative to the scan root
 * @param {Object} ctx - Shared scan context
 * @param {Object} ctx.metalsmith - Metalsmith instance
 * @param {Object} ctx.config - Plugin configuration
 * @param {Set} ctx.processedImagePaths - Build paths already processed from HTML
 * @param {Array} ctx.unprocessedImages - Accumulator for found images
 * @param {Set} ctx.seen - Paths already claimed by the filesystem scan
 * @param {Function} ctx.debug - Debug function
 * @return {void}
 */
function scanImageFolder(dir, relativePath, ctx) {
  const { metalsmith, config, processedImagePaths, unprocessedImages, seen, debug } = ctx;

  for (const item of fs.readdirSync(dir)) {
    if (item === '.DS_Store') {
      continue;
    }

    const fullPath = path.join(dir, item);
    const itemRelativePath = path.join(relativePath, item);

    if (fs.statSync(fullPath).isDirectory()) {
      scanImageFolder(fullPath, itemRelativePath, ctx);
      continue;
    }

    const relPosix = itemRelativePath.replace(/\\/g, '/');

    // Only files matching the configured image pattern
    if (metalsmith.match(config.imagePattern, [relPosix]).length === 0) {
      continue;
    }

    // Skip previously generated variants living inside the scanned folder
    if (
      relPosix.startsWith('responsive/') ||
      relPosix.includes('/responsive/') ||
      fullPath.includes(config.outputDir)
    ) {
      debug(`Skipping responsive variant: ${relPosix}`);
      continue;
    }

    // Map the on-disk location to its build path to compare against images
    // already processed from HTML (static copies land under assets/images)
    const buildPath = path.join('assets/images', itemRelativePath).replace(/\\/g, '/');
    if (processedImagePaths.has(buildPath)) {
      debug(`Skipping already processed image: ${buildPath}`);
      continue;
    }

    // Remember both spellings so the files-object pass doesn't re-add it
    seen.add(buildPath);
    seen.add(path.join(config.imageFolder, itemRelativePath).replace(/\\/g, '/'));

    debug(`Found unprocessed filesystem image: ${relPosix}`);
    unprocessedImages.push({
      path: itemRelativePath,
      buffer: fs.readFileSync(fullPath),
      source: 'filesystem'
    });
  }
}

/**
 * Find images that weren't processed during HTML scanning.
 * Scans config.imageFolder under the Metalsmith source directory, then the
 * Metalsmith files object. Never scans the build directory: what a previous
 * build left in build/ must not change this build's output.
 * @param {Object} files - Metalsmith files object
 * @param {Object} metalsmith - Metalsmith instance
 * @param {Object} config - Plugin configuration
 * @param {Set} processedImagePaths - Set of already processed image paths
 * @param {Function} debug - Debug function
 * @return {Promise<Array>} - Array of unprocessed image objects with {path, buffer}
 */
async function findUnprocessedImages(files, metalsmith, config, processedImagePaths, debug) {
  const unprocessedImages = [];
  const seen = new Set();

  // Method 1: scan the configured image folder under the source directory
  // (covers assets copied outside the file tree by statik/static-files)
  const imageDir = path.join(metalsmith.source(), config.imageFolder);
  try {
    if (fs.existsSync(imageDir)) {
      debug(`Scanning image folder: ${imageDir}`);
      scanImageFolder(imageDir, '', { metalsmith, config, processedImagePaths, unprocessedImages, seen, debug });
    } else {
      debug(`Image folder does not exist, skipping filesystem scan: ${imageDir}`);
    }
  } catch (err) {
    debug(`Error scanning image folder: ${err.message}`);
  }

  // Method 2: images already in the Metalsmith files object
  for (const filePath of metalsmith.match(config.imagePattern, Object.keys(files))) {
    if (isResponsiveVariant(filePath, config)) {
      debug(`Skipping responsive variant in files object: ${filePath}`);
      continue;
    }

    if (processedImagePaths.has(filePath)) {
      debug(`Skipping already processed files object image: ${filePath}`);
      continue;
    }

    if (seen.has(filePath)) {
      continue;
    }

    debug(`Found unprocessed files object image: ${filePath}`);
    unprocessedImages.push({
      path: filePath,
      buffer: files[filePath].contents,
      source: 'files'
    });
  }

  debug(`Found ${unprocessedImages.length} unprocessed images total`);
  return unprocessedImages;
}

/**
 * Process a background image to create 1x (original) and 2x (half-size) variants
 * for use with CSS image-set() for retina displays
 * @param {Buffer} buffer - Original image buffer
 * @param {string} originalPath - Original image path
 * @param {Function} debugFn - Debug function for logging
 * @param {Object} config - Plugin configuration
 * @param {string} [cacheDir] - Absolute path to the persistent cache directory, or null
 * @return {Promise<Array<Object>>} - Array of generated variants
 */
async function processBackgroundImageVariants(buffer, originalPath, debugFn, config, cacheDir) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const variants = [];

  // Check if background variants already exist on disk from a previous build.
  // Background filenames are deterministic (no content hash), so existence alone
  // tells us the work was already done. If a source image changes content without
  // changing filename, delete the responsive directory to force regeneration.
  if (cacheDir) {
    const cached = await loadCachedBgVariants(originalPath, metadata, config, cacheDir, debugFn);
    if (cached) {
      return cached;
    }
  }

  debugFn(`Processing background image ${originalPath}: ${metadata.width}x${metadata.height}`);

  // Create 1x (original size) and 2x (half size) variants
  const sizes = [
    { width: metadata.width, density: '1x' },
    { width: Math.round(metadata.width / 2), density: '2x' }
  ];

  // Process both sizes in parallel
  const sizePromises = sizes.map(async (size) => {
    // Create a Sharp instance for this size
    const resized = image.clone().resize({
      width: size.width,
      withoutEnlargement: true // Don't upscale images
    });

    // Process each format in parallel for this size
    const formatPromises = config.formats.map(async (format) => {
      try {
        // Skip problematic format combinations
        if (format === 'original' && metadata.format.toLowerCase() === 'webp') {
          return null;
        }

        // Determine output format and Sharp method
        let outputFormat = format;
        let sharpMethod = format;

        if (format === 'original') {
          outputFormat = metadata.format.toLowerCase();
          sharpMethod = outputFormat === 'jpeg' ? 'jpeg' : outputFormat;
        }

        // Apply format-specific processing
        let processedImage = resized.clone();
        const formatOptions = config.formatOptions[format === 'original' ? outputFormat : format] || {};

        if (sharpMethod === 'avif') {
          processedImage = processedImage.avif(formatOptions);
        } else if (sharpMethod === 'webp') {
          processedImage = processedImage.webp(formatOptions);
        } else if (sharpMethod === 'jpeg') {
          processedImage = processedImage.jpeg(formatOptions);
        } else if (sharpMethod === 'png') {
          processedImage = processedImage.png(formatOptions);
        }

        // Generate output buffer. resolveWithObject returns the real output
        // dimensions; .metadata() on the pipeline would report the input image.
        const { data: outputBuffer, info } = await processedImage.toBuffer({ resolveWithObject: true });

        // Generate variant path without hash for easier CSS usage
        const variantPath = generateBackgroundVariantPath(originalPath, size.width, outputFormat, config);

        debugFn(`Generated background variant: ${variantPath} (${size.density})`);

        return {
          path: variantPath,
          buffer: outputBuffer,
          width: info.width,
          height: info.height,
          format: outputFormat,
          density: size.density
        };
      } catch (err) {
        debugFn(`Error processing ${format} format for ${originalPath}: ${err.message}`);
        return null;
      }
    });

    const formatResults = await Promise.all(formatPromises);
    return formatResults.filter((result) => result !== null);
  });

  const sizeResults = await Promise.all(sizePromises);

  // Flatten the results
  sizeResults.forEach((formatVariants) => {
    variants.push(...formatVariants);
  });

  // Persist newly generated variants to the cache directory so subsequent
  // builds can skip Sharp entirely for these background images.
  if (cacheDir && variants.length > 0) {
    for (const variant of variants) {
      const cachePath = path.join(cacheDir, path.basename(variant.path));
      fs.writeFileSync(cachePath, variant.buffer);
    }
    debugFn(`Wrote ${variants.length} background variants to cache for ${originalPath}`);
  }

  debugFn(`Generated ${variants.length} background variants for ${originalPath}`);
  return variants;
}

/**
 * Loads previously generated background variants from the persistent cache directory.
 * Checks that every expected variant file (size × format) exists on disk.
 * Returns the loaded variants array, or null on any cache miss.
 * @param {string} originalPath - Original image path
 * @param {Object} sourceMetadata - Sharp metadata of the source image
 * @param {Object} config - Plugin configuration
 * @param {string} cacheDir - Absolute path to the persistent cache directory
 * @param {Function} debugFn - Debug function
 * @return {Promise<Array<Object>|null>} - Loaded variants or null on cache miss
 */
async function loadCachedBgVariants(originalPath, sourceMetadata, config, cacheDir, debugFn) {
  const sizes = [
    { width: sourceMetadata.width, density: '1x' },
    { width: Math.round(sourceMetadata.width / 2), density: '2x' }
  ];

  const expected = [];

  for (const size of sizes) {
    for (const format of config.formats) {
      if (format === 'original' && sourceMetadata.format.toLowerCase() === 'webp') {
        continue;
      }

      let outputFormat = format;
      if (format === 'original') {
        outputFormat = sourceMetadata.format.toLowerCase();
      }

      const variantPath = generateBackgroundVariantPath(originalPath, size.width, outputFormat, config);
      const fullPath = path.join(cacheDir, path.basename(variantPath));
      expected.push({ variantPath, fullPath, width: size.width, format: outputFormat, density: size.density });
    }
  }

  // Quick existence check — bail on first miss
  for (const ev of expected) {
    if (!fs.existsSync(ev.fullPath)) {
      return null;
    }
  }

  // All variants found on disk, load them
  debugFn(`Loading ${expected.length} cached background variants for ${originalPath}`);

  // Compute height from the source aspect ratio instead of calling sharp().metadata()
  // on every cached file — avoids spinning up Sharp entirely on cache hits.
  const aspectRatio = sourceMetadata.height / sourceMetadata.width;

  const variants = expected.map((ev) => {
    const buffer = fs.readFileSync(ev.fullPath);
    return {
      path: ev.variantPath,
      buffer,
      width: ev.width,
      height: Math.round(ev.width * aspectRatio),
      format: ev.format,
      density: ev.density
    };
  });

  return variants;
}

/**
 * Generate background image variant path without hash for easier CSS usage
 * Creates predictable filenames that can be written in CSS without knowing the hash
 * @param {string} originalPath - Original image path
 * @param {number} width - Target width
 * @param {string} format - Target format
 * @param {Object} config - Plugin configuration
 * @return {string} - Generated path without hash
 */
function generateBackgroundVariantPath(originalPath, width, format, config) {
  const parsedPath = path.parse(originalPath);
  const originalFormat = parsedPath.ext.slice(1).toLowerCase();

  // If format is 'original', use the source format
  const outputFormat = format === 'original' ? originalFormat : format;

  // Create background pattern without hash: '[filename]-[width]w.[format]'
  // Results in: 'header1-1000w.webp' instead of 'header1-1000w-abc12345.webp'
  const outputName = config.outputPattern
    .replace('[filename]', parsedPath.name)
    .replace('[width]', width)
    .replace('[format]', outputFormat)
    .replace('-[hash]', '') // Remove hash placeholder and preceding dash
    .replace('[hash]', ''); // Remove any remaining hash placeholder

  return path.join(config.outputDir, outputName);
}

// Set function name for better debugging
Object.defineProperty(optimizeImagesPlugin, 'name', {
  value: 'metalsmith-optimize-images'
});

export default optimizeImagesPlugin;
