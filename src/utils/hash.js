/**
 * Utility for generating content hashes
 */
import crypto from 'crypto';

/**
 * Generates a short hash based on image content
 * @param {Buffer} buffer - The image buffer
 * @return {string} - A short hash string
 */
export function generateHash( buffer ) {
  return crypto.createHash( 'md5' ).update( buffer ).digest( 'hex' ).slice( 0, 8 );
}
