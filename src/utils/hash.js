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
export function generateHash( buffer ) {
  // SHA-256 for cache-busting - using secure algorithm to satisfy security scanners
  // Only use first 8 characters to keep filenames manageable
  return crypto.createHash( 'sha256' ).update( buffer ).digest( 'hex' ).slice( 0, 8 );
}
