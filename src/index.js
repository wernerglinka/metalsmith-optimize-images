/**
 * Metalsmith plugin for generating responsive images with optimal formats
 * @module metalsmith-optimize-images
 */

import path from 'path';
import * as mkdirp from 'mkdirp';
import { buildConfig } from './utils/config.js';
import { processHtmlFile, generateMetadata } from './processors/htmlProcessor.js';

/**
 * Creates a responsive images plugin for Metalsmith
 * Generates multiple sizes and formats of images and replaces img tags with picture elements
 *
 * @param {Object} options - Configuration options for the plugin
 * @param {number[]} [options.widths] - Array of image widths to generate
 * @param {string[]} [options.formats] - Array of image formats to generate (in order of preference)
 * @param {Object} [options.formatOptions] - Format-specific compression settings
 * @param {Object} [options.formatOptions.avif] - AVIF compression options
 * @param {Object} [options.formatOptions.webp] - WebP compression options
 * @param {Object} [options.formatOptions.jpeg] - JPEG compression options
 * @param {Object} [options.formatOptions.png] - PNG compression options
 * @param {string} [options.htmlPattern] - Glob pattern to match HTML files
 * @param {string} [options.imgSelector] - CSS selector for images to process
 * @param {string} [options.outputDir] - Output directory for processed images
 * @param {string} [options.outputPattern] - Output naming pattern
 * @param {boolean} [options.skipLarger] - Whether to skip generating sizes larger than original
 * @param {boolean} [options.lazy] - Whether to add loading="lazy" to images
 * @param {boolean} [options.dimensionAttributes] - Whether to add width/height attributes
 * @param {string} [options.sizes] - Default sizes attribute
 * @param {number} [options.concurrency] - Maximum number of images to process in parallel
 * @param {boolean} [options.generateMetadata] - Whether to generate a metadata JSON file
 * @param {boolean} [options.isProgressive] - Whether to use progressive image loading (default: true)
 * @param {Object} [options.placeholder] - Placeholder image settings for progressive loading
 * @param {number} [options.placeholder.width] - Placeholder image width (default: 50)
 * @param {number} [options.placeholder.quality] - Placeholder image quality (default: 30)
 * @param {number} [options.placeholder.blur] - Placeholder image blur amount (default: 10)
 * @return {Function} - Metalsmith plugin function
 */
function optimizeImagesPlugin( options = {} ) {
  // Build configuration with defaults and user options
  const config = buildConfig( options );

  /**
   * The Metalsmith plugin function
   * @param {Object} files - Metalsmith files object
   * @param {Object} metalsmith - Metalsmith instance
   * @param {Function} done - Callback function
   * @return {void}
   */
  return async function optimizeImages( files, metalsmith, done ) {
    try {
      const destination = metalsmith.destination();
      const outputPath = path.join( destination, config.outputDir );

      // Set up debug function for logging (uses 'DEBUG=metalsmith-optimize-images*' env var)
      const debug = metalsmith.debug( 'metalsmith-optimize-images' );

      // Ensure the output directory exists where processed images will be saved
      mkdirp.mkdirpSync( outputPath );

      // Find all HTML files that match the pattern (default: **/*.html)
      const htmlFiles = Object.keys( files ).filter( ( file ) => metalsmith.match( config.htmlPattern, file ) );

      if ( htmlFiles.length === 0 ) {
        debug( 'No HTML files found' );
        return done();
      }

      // Cache to avoid re-processing identical images across different HTML files
      // Key: "filepath:mtime", Value: array of processed image variants
      const processedImages = new Map();

      // Chunk HTML files to respect concurrency limit (default: 5)
      // This prevents overwhelming the system with too many parallel operations
      const chunks = [];
      for ( let i = 0; i < htmlFiles.length; i += config.concurrency ) {
        chunks.push( htmlFiles.slice( i, i + config.concurrency ) );
      }

      // Process all chunks in parallel - each chunk processes its files in parallel
      // This creates a two-level parallelism: chunk-level and file-level within chunks
      await Promise.all(
        chunks.map( async ( chunk ) => {
          // Process files within each chunk in parallel
          await Promise.all(
            chunk.map( async ( htmlFile ) => {
              // This function parses HTML, finds images, processes them, and updates the HTML
              await processHtmlFile( htmlFile, files[htmlFile], files, metalsmith, processedImages, debug, config );
            } )
          );
        } )
      );

      // Optional: Generate a JSON metadata file with information about all processed images
      // Useful for debugging or integration with other tools
      if ( config.generateMetadata ) {
        generateMetadata( processedImages, files, config );
      }

      debug( 'Responsive images processing complete' );
      done();
    } catch ( err ) {
      // Use console.error for errors to ensure they're visible even if debug mode is not enabled
      console.error( `Error in responsive images plugin: ${err.message}` );
      done( err );
    }
  };
}

export default optimizeImagesPlugin;
