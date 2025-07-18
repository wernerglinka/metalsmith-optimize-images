/**
 * Utility for generating content hashes
 * Used for cache-busting - ensures filenames change when image content changes
 */
import crypto from 'crypto';

/**
 * Generates a short hash based on image content
 * Creates an 8-character hash for cache-busting in filenames
 * @param {Buffer} buffer - The image buffer
 * @return {string} - A short hash string (8 characters)
 */
export function generateHash(buffer) {
  // MD5 is sufficient for cache-busting (not cryptographic security)
  // Only use first 8 characters to keep filenames manageable
  return crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8);
}
