/**
 * Path utilities for image variants
 */
import path from 'path';

/**
 * Generate variant filename using pattern
 * @param {string} originalPath - Original image path
 * @param {number} width - Target width
 * @param {string} format - Target format
 * @param {string} hash - Content hash for cache busting
 * @param {object} config - Plugin config options
 * @return {string} - Generated path
 */
export function generateVariantPath(originalPath, width, format, hash, config) {
  const parsedPath = path.parse(originalPath);
  const originalFormat = parsedPath.ext.slice(1).toLowerCase();

  // If format is 'original', use the source format
  const outputFormat = format === 'original' ? originalFormat : format;

  // Apply pattern replacements
  const outputName = config.outputPattern
    .replace('[filename]', parsedPath.name)
    .replace('[width]', width)
    .replace('[format]', outputFormat)
    .replace('[hash]', hash || '');

  return path.join(config.outputDir, outputName);
}
