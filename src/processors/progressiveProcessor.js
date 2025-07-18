/**
 * Progressive image loading processor
 * Handles placeholder generation and smooth loading transitions
 */
import sharp from 'sharp';
import path from 'path';

/**
 * Generate placeholder image for progressive loading
 * Creates a small, blurred, low-quality version for instant display
 * @param {string} imagePath - Original image path
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} placeholderConfig - Placeholder configuration (width, quality, blur)
 * @param {Object} metalsmith - Metalsmith instance
 * @return {Promise<Object>} Placeholder data with path and contents
 */
export async function generatePlaceholder( imagePath, imageBuffer, placeholderConfig, metalsmith ) {
  const { width, quality, blur } = placeholderConfig;

  try {
    // Get original image dimensions for aspect ratio calculation
    const image = sharp( imageBuffer );
    const metadata = await image.metadata();

    // Process image: resize to small width, blur heavily, compress heavily
    const processed = await image
      .resize( width ) // Default: 50px wide
      .blur( blur ) // Default: 10px blur
      .jpeg( { quality } ) // Default: 30% quality
      .toBuffer();

    const fileName = `${path.basename( imagePath, path.extname( imagePath ) )}-placeholder.jpg`;
    const outputPath = path.join( 'assets/images/responsive', fileName );

    return {
      path: outputPath,
      contents: processed,
      fileName,
      originalWidth: metadata.width,
      originalHeight: metadata.height
    };
  } catch ( error ) {
    metalsmith.debug( 'metalsmith-optimize-images' )( `Error generating placeholder for ${imagePath}: ${error.message}` );
    throw error;
  }
}

/**
 * Create progressive wrapper HTML structure
 * Creates a container with both placeholder and high-res images for smooth transitions
 * @param {Object} $ - Cheerio instance
 * @param {Object} $img - Original img element
 * @param {Array} variants - Generated image variants
 * @param {Object} placeholderData - Placeholder image data
 * @param {Object} config - Plugin configuration
 * @return {Object} Cheerio element for progressive wrapper
 */
export function createProgressiveWrapper( $, $img, variants, placeholderData, _config ) {
  // Get original attributes
  const alt = $img.attr( 'alt' ) || '';
  const className = $img.attr( 'class' ) || '';

  // Group variants by format - use only original format for progressive mode
  // Progressive mode focuses on smooth loading rather than format optimization
  const variantsByFormat = {};
  variants.forEach( ( v ) => {
    if ( !variantsByFormat[v.format] ) {
      variantsByFormat[v.format] = [];
    }
    variantsByFormat[v.format].push( v );
  } );

  // Get original format variants (skip AVIF/WebP for progressive mode)
  // JavaScript will handle format detection dynamically
  const originalFormat = Object.keys( variantsByFormat ).find( ( f ) => f !== 'avif' && f !== 'webp' );
  const originalVariants = originalFormat ? variantsByFormat[originalFormat] : [];

  if ( originalVariants.length === 0 ) {
    return $img.clone(); // Fallback if no variants
  }

  // Calculate aspect ratio using original image dimensions to prevent layout shift
  // Fallback to variant dimensions if placeholderData doesn't have original dimensions
  let aspectRatio;
  if ( placeholderData.originalWidth && placeholderData.originalHeight ) {
    aspectRatio = `${placeholderData.originalWidth}/${placeholderData.originalHeight}`;
  } else {
    // Fallback: use the largest variant for most accurate aspect ratio
    const largestVariant = [...originalVariants].sort( ( a, b ) => b.width - a.width )[0];
    aspectRatio = `${largestVariant.width}/${largestVariant.height}`;
  }

  // Find middle-sized variant for high-res image (good balance of quality/size)
  const highResVariant = originalVariants[Math.floor( originalVariants.length / 2 )];

  // Create wrapper div with modern CSS aspect-ratio
  const $wrapper = $( '<div>' )
    .addClass( 'responsive-wrapper js-progressive-image-wrapper' )
    .attr( 'style', `aspect-ratio: ${aspectRatio}` );

  // Add class from original image if present
  if ( className ) {
    $wrapper.addClass( className );
  }

  // Create low-res image (placeholder) - shown immediately
  const $lowRes = $( '<img>' ).addClass( 'low-res' ).attr( 'src', `/${placeholderData.path}` ).attr( 'alt', alt );

  // Create high-res image (empty with data source) - loaded by JavaScript
  const $highRes = $( '<img>' )
    .addClass( 'high-res' )
    .attr( 'src', '' )
    .attr( 'alt', alt )
    .attr( 'data-source', `/${highResVariant.path}` );

  // Assemble the progressive wrapper
  $lowRes.appendTo( $wrapper );
  $highRes.appendTo( $wrapper );

  return $wrapper;
}

/**
 * Create standard picture element HTML
 * Fallback function for when progressive loading fails
 * @param {Object} $ - Cheerio instance
 * @param {Object} $img - Original img element
 * @param {Array} variants - Generated image variants
 * @param {Object} config - Plugin configuration
 * @return {Object} Cheerio element for picture
 */
export function createStandardPicture( $, $img, variants, config ) {
  // Get original attributes
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

  // Create picture element with all formats (standard mode)
  const $picture = $( '<picture>' );

  // Add format-specific source elements in preference order
  ['avif', 'webp'].forEach( ( format ) => {
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

  // Add original format as img element
  const originalFormat = Object.keys( variantsByFormat ).find( ( f ) => f !== 'avif' && f !== 'webp' );

  if ( originalFormat && variantsByFormat[originalFormat] ) {
    const formatVariants = variantsByFormat[originalFormat];
    formatVariants.sort( ( a, b ) => a.width - b.width );

    const srcset = formatVariants.map( ( v ) => `/${v.path} ${v.width}w` ).join( ', ' );
    const defaultSrc = formatVariants[Math.floor( formatVariants.length / 2 )]?.path;

    // Create new img element
    const $newImg = $( '<img>' )
      .attr( 'src', defaultSrc ? `/${defaultSrc}` : src )
      .attr( 'srcset', srcset )
      .attr( 'sizes', sizesAttr )
      .attr( 'alt', alt )
      .attr( 'loading', 'lazy' );

    // Add class if present
    if ( className ) {
      $newImg.attr( 'class', className );
    }

    // Add width/height attributes if configured and available
    if ( config.dimensionAttributes && variants.length > 0 ) {
      const largestVariant = [...variants].sort( ( a, b ) => b.width - a.width )[0];
      $newImg.attr( 'width', largestVariant.width );
      $newImg.attr( 'height', largestVariant.height );
    }

    $newImg.appendTo( $picture );
  }

  return $picture;
}

/**
 * Progressive image loader JavaScript
 * Handles intersection observer, format detection, and smooth loading transitions
 */
export const progressiveImageLoader = `
(function() {
  'use strict';
  
  // Cache for detected format support
  let bestFormat = null;
  
  // Main function called when images enter the viewport
  const loadImage = function(entries, observer) {
    for (let entry of entries) {
      if (entry.isIntersecting) {
        const thisWrapper = entry.target;
        
        // Find the high res image in the wrapper
        const thisImage = thisWrapper.querySelector('.high-res');
        const thisImageSource = thisImage.dataset.source;
        
        if (!thisImageSource) {
          console.warn('No data-source found for high-res image');
          return;
        }
        
        // Apply format based on detected support
        let finalImageSource = thisImageSource;
        
        if (bestFormat === 'avif') {
          finalImageSource = thisImageSource.replace(/\.(jpg|jpeg|png)$/i, '.avif');
        } else if (bestFormat === 'webp') {
          finalImageSource = thisImageSource.replace(/\.(jpg|jpeg|png)$/i, '.webp');
        }
        // If 'original' or null, use original (no change needed)
        
        thisImage.src = finalImageSource;
        
        // Take this image off the observe list to prevent duplicate loading
        observer.unobserve(thisWrapper);
        
        // Once the hi-res image has been loaded, add done class to trigger CSS transition
        thisImage.onload = function() {
          thisWrapper.classList.add('done');
        };
        
        // Handle loading errors gracefully
        thisImage.onerror = function() {
          thisWrapper.classList.add('error');
        };
      }
    }
  };

  const init = async function() {
    // Detect best supported format first
    bestFormat = await detectBestFormat();
    
    // Check for Intersection Observer support (not available in older browsers)
    if (!('IntersectionObserver' in window)) {
      // Fallback: load all images immediately for older browsers
      document.querySelectorAll('.js-progressive-image-wrapper').forEach(function(wrapper) {
        const img = wrapper.querySelector('.high-res');
        if (img && img.dataset.source) {
          let finalImageSource = img.dataset.source;
          
          // Apply detected format for fallback
          if (bestFormat === 'avif') {
            finalImageSource = img.dataset.source.replace(/\.(jpg|jpeg|png)$/i, '.avif');
          } else if (bestFormat === 'webp') {
            finalImageSource = img.dataset.source.replace(/\.(jpg|jpeg|png)$/i, '.webp');
          }
          
          img.src = finalImageSource;
          wrapper.classList.add('done');
        }
      });
      return;
    }

    // Create intersection observer with 50px margin (loads images slightly before they're visible)
    const observer = new IntersectionObserver(loadImage, {
      rootMargin: '50px'
    });
    
    // Loop over all image wrappers and add to intersection observer
    const allImageWrappers = document.querySelectorAll('.js-progressive-image-wrapper');
    for (let imageWrapper of allImageWrappers) {
      observer.observe(imageWrapper);
    }
  };
  
  // Format detection using createImageBitmap - more reliable than canvas encoding
  async function detectBestFormat() {
    const fallbackFormat = 'original';
    
    if (!window.createImageBitmap) return fallbackFormat;
    
    const avifData = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUEAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABYAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgSAAAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB5tZGF0EgAKBzgADlAgIGkyCR/wAABAAACvcA==';
    const webpData = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAEAAQAcJaQAA3AA/v3AgAA=';
    
    try {
      const avifBlob = await fetch(avifData).then(r => r.blob());
      await createImageBitmap(avifBlob);
      return 'avif';
    } catch {
      try {
        const webpBlob = await fetch(webpData).then(r => r.blob());
        await createImageBitmap(webpBlob);
        return 'webp';
      } catch {
        return fallbackFormat;
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
`;

/**
 * Progressive image CSS styles
 * Handles aspect ratio, positioning, and smooth transitions between placeholder and high-res images
 */
export const progressiveImageCSS = `
.responsive-wrapper {
  position: relative;
  overflow: hidden;
  background-color: #f0f0f0;
}

.responsive-wrapper .low-res {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.4s ease;
}

.responsive-wrapper .high-res {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.responsive-wrapper.done .high-res {
  opacity: 1;
}

.responsive-wrapper.done .low-res {
  opacity: 0;
}

.responsive-wrapper.error .low-res {
  filter: none;
}

/* Ensure images are responsive */
.responsive-wrapper img {
  max-width: 100%;
  height: auto;
}
`;
