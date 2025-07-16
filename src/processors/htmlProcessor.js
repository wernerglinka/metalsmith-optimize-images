/**
 * HTML processing utilities for replacing img tags with responsive picture elements
 * Handles both standard and progressive loading modes
 */
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs';
import { processImage, processImageToVariants } from './imageProcessor.js';
import {
  generatePlaceholder,
  createProgressiveWrapper,
  createStandardPicture,
  progressiveImageCSS,
  progressiveImageLoader
} from './progressiveProcessor.js';

/**
 * Replace an img element with a responsive picture element
 * @param {Object} $ - Cheerio instance
 * @param {Object} $img - Cheerio image element
 * @param {Array<Object>} variants - Generated image variants
 * @param {Object} config - Plugin configuration
 */
export function replacePictureElement( $, $img, variants, config ) {
  if ( variants.length === 0 ) {
    return;
  }

  // Get original img attributes
  const src = $img.attr( 'src' );
  const alt = $img.attr( 'alt' ) || '';
  const className = $img.attr( 'class' ) || '';
  const sizesAttr = $img.attr( 'sizes' ) || config.sizes;

  // Group variants by format for creating <source> elements
  const variantsByFormat = {};
  variants.forEach( ( v ) => {
    if ( !variantsByFormat[v.format] ) {
      variantsByFormat[v.format] = [];
    }
    variantsByFormat[v.format].push( v );
  } );

  // Create picture element that will contain all formats
  const $picture = $( '<picture>' );

  // Add format-specific source elements in preference order (avif, webp, then original)
  // Browser will use the first format it supports
  config.formats.forEach( ( format ) => {
    // Skip 'original' placeholder - it's handled separately
    if ( format === 'original' ) {
      return;
    }

    const formatVariants = variantsByFormat[format];
    if ( !formatVariants || formatVariants.length === 0 ) {
      return;
    }

    // Sort variants by width for proper srcset ordering
    formatVariants.sort( ( a, b ) => a.width - b.width );

    // Create srcset string: "path 320w, path 640w, path 960w"
    const srcset = formatVariants.map( ( v ) => `/${v.path} ${v.width}w` ).join( ', ' );

    // Create source element with format type and srcset
    $( '<source>' ).attr( 'type', `image/${format}` ).attr( 'srcset', srcset ).attr( 'sizes', sizesAttr ).appendTo( $picture );
  } );

  // Add original format as last source (fallback for browsers that don't support modern formats)
  const originalFormat = Object.keys( variantsByFormat ).find( ( f ) => f !== 'avif' && f !== 'webp' );

  if ( originalFormat && variantsByFormat[originalFormat] ) {
    const formatVariants = variantsByFormat[originalFormat];
    formatVariants.sort( ( a, b ) => a.width - b.width );

    const srcset = formatVariants.map( ( v ) => `/${v.path} ${v.width}w` ).join( ', ' );

    $( '<source>' )
      .attr( 'type', `image/${originalFormat}` )
      .attr( 'srcset', srcset )
      .attr( 'sizes', sizesAttr )
      .appendTo( $picture );
  }

  // Create new img element that serves as the final fallback
  const $newImg = $( '<img>' )
    .attr( 'src', src ) // Keep original as fallback for very old browsers
    .attr( 'alt', alt );

  // Preserve original class attribute if present
  if ( className ) {
    $newImg.attr( 'class', className );
  }

  // Add native lazy loading if configured (improves performance)
  if ( config.lazy ) {
    $newImg.attr( 'loading', 'lazy' );
  }

  // Add width/height attributes to prevent layout shift (CLS)
  if ( config.dimensionAttributes && variants.length > 0 ) {
    // Use the largest variant as reference for dimensions
    const largestVariant = [...variants].sort( ( a, b ) => b.width - a.width )[0];
    $newImg.attr( 'width', largestVariant.width );
    $newImg.attr( 'height', largestVariant.height );
  }

  // Copy any other attributes from original img (except ones we handle specially)
  for ( const attrib in $img[0].attribs ) {
    if ( !['src', 'alt', 'class', 'width', 'height', 'sizes'].includes( attrib ) ) {
      $newImg.attr( attrib, $img.attr( attrib ) );
    }
  }

  // Add img to picture element
  $newImg.appendTo( $picture );

  // Replace original img with picture element
  $img.replaceWith( $picture );
}

/**
 * Process an HTML file to replace img tags with responsive picture elements
 * @param {string} htmlFile - Path to HTML file
 * @param {Object} fileData - File data object
 * @param {Object} files - Metalsmith files object
 * @param {Object} metalsmith - Metalsmith instance
 * @param {Map} processedImages - Cache of processed images
 * @param {Function} debug - Debug function
 * @param {Object} config - Plugin configuration
 * @return {Promise<void>} - Promise that resolves when the HTML file is processed
 */
export async function processHtmlFile( htmlFile, fileData, files, metalsmith, processedImages, debug, config ) {
  debug( `Processing HTML file: ${htmlFile}` );
  const content = fileData.contents.toString();

  // Parse HTML
  const $ = cheerio.load( content );

  // Find all images matching our selector (default: img:not([data-no-responsive]))
  const images = $( config.imgSelector );
  if ( images.length === 0 ) {
    debug( `No images found in ${htmlFile}` );
    return;
  }

  debug( `Found ${images.length} images in ${htmlFile}` );

  // Process images in parallel with a concurrency limit to prevent overwhelming the system
  const imageChunks = [];
  for ( let i = 0; i < images.length; i += config.concurrency ) {
    imageChunks.push( Array.from( images ).slice( i, i + config.concurrency ) );
  }

  // Process all chunks in parallel - each chunk processes its images in parallel
  await Promise.all(
    imageChunks.map( async ( imageChunk ) => {
      // Process images within each chunk in parallel
      await Promise.all(
        imageChunk.map( ( img ) =>
          config.isProgressive
            ? processProgressiveImage( { $, img, files, metalsmith, processedImages, debug, config } )
            : processImage( { $, img, files, metalsmith, processedImages, debug, config, replacePictureElement } )
        )
      );
    } )
  );

  // Inject progressive loading CSS and JavaScript if needed
  if ( config.isProgressive ) {
    injectProgressiveAssets( $ );
  }

  // Update file contents with modified HTML (converts back to Buffer)
  fileData.contents = Buffer.from( $.html() );
}

/**
 * Generate metadata file if configured
 * Creates a JSON manifest with information about all processed images
 * Useful for debugging or integration with other tools
 * @param {Map} processedImages - Cache of processed images
 * @param {Object} files - Metalsmith files object
 * @param {Object} config - Plugin configuration
 */
export function generateMetadata( processedImages, files, config ) {
  const metadataObj = {};
  processedImages.forEach( ( variants, key ) => {
    // Extract the original path from the cache key (path:mtime)
    const [path] = key.split( ':' );
    metadataObj[path] = variants.map( ( v ) => ( {
      path: v.path,
      width: v.width,
      height: v.height,
      format: v.format,
      size: v.size
    } ) );
  } );

  const metadataPath = path.join( config.outputDir, 'responsive-images-manifest.json' );
  files[metadataPath] = {
    contents: Buffer.from( JSON.stringify( metadataObj, null, 2 ) )
  };
}

/**
 * Process a single image with progressive loading
 * Creates low-quality placeholders and high-resolution images with smooth transitions
 * @param {Object} context - Processing context
 * @return {Promise<void>} - Promise that resolves when the image is processed
 */
async function processProgressiveImage( { $, img, files, metalsmith, processedImages, debug, config } ) {
  const $img = $( img );
  const src = $img.attr( 'src' );

  debug( `Starting progressive processing for: ${src}` );

  if ( !src || src.startsWith( 'http' ) || src.startsWith( 'data:' ) ) {
    debug( `Skipping external or data URL: ${src}` );
    return;
  }

  // Normalize src path to match Metalsmith files object keys
  const normalizedSrc = src.startsWith( '/' ) ? src.slice( 1 ) : src;

  // Image not in files, try to load it from the build directory (same logic as processImage)
  if ( !files[normalizedSrc] ) {
    try {
      const destination = metalsmith.destination();
      const imagePath = path.join( destination, normalizedSrc );

      if ( fs.existsSync( imagePath ) ) {
        // Load the image contents from the build directory
        const imageBuffer = fs.readFileSync( imagePath );

        // Get modification time for cache busting
        const mtime = fs.statSync( imagePath ).mtimeMs;

        // Add it to files so the plugin can process it
        files[normalizedSrc] = {
          contents: imageBuffer,
          mtime
        };
      } else {
        debug( `Image not found in build: ${normalizedSrc}` );
        return;
      }
    } catch ( err ) {
      debug( `Error processing image from build directory: ${err.message}` );
      return;
    }
  }

  // Create a cache key
  const fileMtime = files[normalizedSrc].mtime || Date.now();
  const cacheKey = `${normalizedSrc}:${fileMtime}`;

  // Check if we've already processed this image
  if ( processedImages.has( cacheKey ) ) {
    debug( `Using cached variants for ${normalizedSrc}` );
    const { variants, placeholderData } = processedImages.get( cacheKey );
    const $wrapper = createProgressiveWrapper( $, $img, variants, placeholderData, config );
    $img.replaceWith( $wrapper );
    return;
  }

  debug( `Processing progressive image: ${normalizedSrc}` );

  try {
    // Process image to generate all variants (sizes and formats)
    const variants = await processImageToVariants( files[normalizedSrc].contents, normalizedSrc, debug, config );

    // Generate low-quality placeholder image for smooth loading transitions
    const placeholderData = await generatePlaceholder(
      normalizedSrc,
      files[normalizedSrc].contents,
      config.placeholder,
      metalsmith
    );

    // Save all variants to Metalsmith files
    variants.forEach( ( variant ) => {
      files[variant.path] = {
        contents: variant.buffer
      };
    } );

    // Save placeholder to files
    files[placeholderData.path] = {
      contents: placeholderData.contents
    };

    // Cache variants and placeholder for this image
    processedImages.set( cacheKey, { variants, placeholderData } );

    // Create progressive wrapper with placeholder and high-res image
    const $wrapper = createProgressiveWrapper( $, $img, variants, placeholderData, config );
    $img.replaceWith( $wrapper );
  } catch ( err ) {
    debug( `Error processing progressive image: ${err.message}` );

    // Fallback to standard processing if progressive loading fails
    try {
      const variants = await processImageToVariants( files[normalizedSrc].contents, normalizedSrc, debug, config );

      variants.forEach( ( variant ) => {
        files[variant.path] = {
          contents: variant.buffer
        };
      } );

      const $picture = createStandardPicture( $, $img, variants, config );
      $img.replaceWith( $picture );
    } catch ( fallbackErr ) {
      debug( `Fallback processing also failed: ${fallbackErr.message}` );
    }
  }
}

/**
 * Inject progressive loading CSS and JavaScript assets
 * Only injects if progressive images are actually present on the page
 * @param {Object} $ - Cheerio instance
 */
function injectProgressiveAssets( $ ) {
  // Check if progressive images exist on this page
  const hasProgressiveImages = $( '.js-progressive-image-wrapper' ).length > 0;

  if ( !hasProgressiveImages ) {
    return;
  }

  // Inject CSS styles for progressive loading (only once per page)
  if ( !$( '#progressive-image-styles' ).length ) {
    $( 'head' ).append( `<style id="progressive-image-styles">${progressiveImageCSS}</style>` );
  }

  // Inject JavaScript for intersection observer and loading logic (only once per page)
  if ( !$( '#progressive-image-loader' ).length ) {
    $( 'body' ).append( `<script id="progressive-image-loader">${progressiveImageLoader}</script>` );
  }
}
