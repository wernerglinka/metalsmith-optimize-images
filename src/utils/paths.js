/**
 * Path utilities for image variants
 * Handles the filename pattern system with token replacement
 */
import path from 'path';

/**
 * Generate variant filename using pattern
 * Applies token replacement to create output filenames
 * Tokens: [filename], [width], [format], [hash]
 * @param {string} originalPath - Original image path
 * @param {number} width - Target width
 * @param {string} format - Target format ('original' means keep source format)
 * @param {string} hash - Content hash for cache busting
 * @param {object} config - Plugin config options
 * @return {string} - Generated path relative to Metalsmith destination
 */
export function generateVariantPath(originalPath, width, format, hash, config) {
  const parsedPath = path.parse(originalPath);
  const originalFormat = parsedPath.ext.slice(1).toLowerCase();

  // If format is 'original', use the source format (e.g., 'jpeg' for image.jpg)
  const outputFormat = format === 'original' ? originalFormat : format;

  // Apply pattern replacements using the tokens system
  // Default pattern: '[filename]-[width]w-[hash].[format]'
  // Results in: 'image-320w-abc12345.webp'
  const outputName = config.outputPattern
    .replace('[filename]', parsedPath.name)
    .replace('[width]', width)
    .replace('[format]', outputFormat)
    .replace('[hash]', hash || '');

  return path.join(config.outputDir, outputName);
}
