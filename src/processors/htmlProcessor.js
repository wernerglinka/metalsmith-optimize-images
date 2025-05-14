/**
 * HTML processing utilities for replacing img tags with responsive picture elements
 */
import * as cheerio from 'cheerio';
import path from 'path';
import { processImage } from './imageProcessor.js';

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

  // Group variants by format
  const variantsByFormat = {};
  variants.forEach( ( v ) => {
    if ( !variantsByFormat[v.format] ) {
      variantsByFormat[v.format] = [];
    }
    variantsByFormat[v.format].push( v );
  } );

  // Create picture element
  const $picture = $( '<picture>' );

  // Add format-specific source elements in preference order
  config.formats.forEach( ( format ) => {
    // Skip 'original' placeholder
    if ( format === 'original' ) {
      return;
    }

    const formatVariants = variantsByFormat[format];
    if ( !formatVariants || formatVariants.length === 0 ) {
      return;
    }

    // Sort variants by width
    formatVariants.sort( ( a, b ) => a.width - b.width );

    // Create srcset string
    const srcset = formatVariants.map( ( v ) => `/${v.path} ${v.width}w` ).join( ', ' );

    // Create source element
    $( '<source>' ).attr( 'type', `image/${format}` ).attr( 'srcset', srcset ).attr( 'sizes', sizesAttr ).appendTo( $picture );
  } );

  // Add original format as last source
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

  // Create new img element
  const $newImg = $( '<img>' )
    .attr( 'src', src ) // Keep original as fallback
    .attr( 'alt', alt );

  // Add class if present
  if ( className ) {
    $newImg.attr( 'class', className );
  }

  // Add lazy loading if configured
  if ( config.lazy ) {
    $newImg.attr( 'loading', 'lazy' );
  }

  // Add width/height attributes if configured and available
  if ( config.dimensionAttributes && variants.length > 0 ) {
    // Use the largest variant as reference
    const largestVariant = [...variants].sort( ( a, b ) => b.width - a.width )[0];
    $newImg.attr( 'width', largestVariant.width );
    $newImg.attr( 'height', largestVariant.height );
  }

  // Copy any other attributes from original img
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

  // Find all images matching our selector
  const images = $( config.imgSelector );
  if ( images.length === 0 ) {
    debug( `No images found in ${htmlFile}` );
    return;
  }

  debug( `Found ${images.length} images in ${htmlFile}` );

  // Process images in parallel with a concurrency limit
  const imageChunks = [];
  for ( let i = 0; i < images.length; i += config.concurrency ) {
    imageChunks.push( Array.from( images ).slice( i, i + config.concurrency ) );
  }

  // Process all chunks in parallel
  await Promise.all(
    imageChunks.map( async ( imageChunk ) => {
      // Process images within each chunk in parallel
      await Promise.all(
        imageChunk.map( ( img ) =>
          processImage( { $, img, files, metalsmith, processedImages, debug, config, replacePictureElement } )
        )
      );
    } )
  );

  // Update file contents with modified HTML
  fileData.contents = Buffer.from( $.html() );
}

/**
 * Generate metadata file if configured
 * @param {Map} processedImages - Cache of processed images
 * @param {Object} files - Metalsmith files object
 * @param {Object} config - Plugin configuration
 */
export function generateMetadata( processedImages, files, config ) {
  const metadataObj = {};
  processedImages.forEach( ( variants, key ) => {
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
