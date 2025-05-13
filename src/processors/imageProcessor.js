/**
 * Image processing utilities for creating responsive image variants
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { generateHash } from '../utils/hash.js';
import { generateVariantPath } from '../utils/paths.js';

/**
 * Process an image into multiple responsive variants and formats
 * @param {Buffer} buffer - Original image buffer
 * @param {string} originalPath - Original image path
 * @param {Function} debugFn - Debug function for logging
 * @param {Object} config - Plugin configuration
 * @return {Promise<Array<Object>>} - Array of generated variants
 */
export async function processImageToVariants(buffer, originalPath, debugFn, config) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const variants = [];
  const hash = generateHash(buffer);

  // Determine which widths to generate
  const targetWidths = config.skipLarger ? config.widths.filter((w) => w <= metadata.width) : config.widths;

  if (targetWidths.length === 0) {
    debugFn(`Skipping ${originalPath} - no valid target widths`);
    return [];
  }

  // Process all widths in parallel
  const widthPromises = targetWidths.map(async (width) => {
    // Resize image (reused for all formats at this width)
    const resized = image.clone().resize({
      width,
      withoutEnlargement: config.skipLarger
    });

    // Get dimensions for this width (for dimension attributes)
    const resizedMeta = await resized.metadata();

    // Process each format in parallel for this width
    const formatPromises = config.formats.map(async (format) => {
      try {
        // Skip formats that make no sense (like webp -> original)
        if (format === 'original' && metadata.format.toLowerCase() === 'webp') {
          return null;
        }

        let formatted;
        const outputPath = generateVariantPath(originalPath, width, format, hash, config);

        // Apply format-specific processing
        if (format === 'original') {
          const originalFormat = metadata.format.toLowerCase();
          const formatOptions = config.formatOptions[originalFormat] || {};
          formatted = resized.clone().toFormat(originalFormat, formatOptions);
        } else {
          const formatOptions = config.formatOptions[format] || {};
          formatted = resized.clone()[format](formatOptions);
        }

        // Generate the image buffer
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
  replacePictureElement
}) {
  const $img = $(img);
  const src = $img.attr('src');

  if (!src || src.startsWith('http') || src.startsWith('data:')) {
    debug(`Skipping external or data URL: ${src}`);
    return;
  }

  // Normalize src path to match Metalsmith files object keys
  // Remove leading slash if present
  const normalizedSrc = src.startsWith('/') ? src.slice(1) : src;

  // Image not in files, try to load it from the build directory
  if (!files[normalizedSrc]) {
    try {
      const destination = metalsmith.destination();
      const imagePath = path.join(destination, normalizedSrc);

      if (fs.existsSync(imagePath)) {
        // Load the image contents from the build directory
        const imageBuffer = fs.readFileSync(imagePath);

        // Get modification time for cache busting
        const mtime = fs.statSync(imagePath).mtimeMs;

        // Add it to files so the plugin can process it
        files[normalizedSrc] = {
          contents: imageBuffer,
          mtime
        };
      } else {
        debug(`Image not found in build: ${normalizedSrc}`);
        return;
      }
    } catch (err) {
      debug(`Error processing image from build directory: ${err.message}`);
      return;
    }
  }

  // Create a cache key that includes the file path and modification time
  const fileMtime = files[normalizedSrc].mtime || Date.now();
  const cacheKey = `${normalizedSrc}:${fileMtime}`;

  // Check if we've already processed this image
  if (processedImages.has(cacheKey)) {
    debug(`Using cached variants for ${normalizedSrc}`);
    const variants = processedImages.get(cacheKey);
    replacePictureElement($, $img, variants, config);
    return;
  }

  debug(`Processing image: ${normalizedSrc}`);

  try {
    // Process image to generate variants
    const variants = await processImageToVariants(files[normalizedSrc].contents, normalizedSrc, debug, config);

    // Save variants to Metalsmith files
    variants.forEach((variant) => {
      files[variant.path] = {
        contents: variant.buffer
      };
    });

    // Cache variants for this image
    processedImages.set(cacheKey, variants);

    // Replace img with picture element
    replacePictureElement($, $img, variants, config);
  } catch (err) {
    debug(`Error processing image: ${err.message}`);
  }
}
