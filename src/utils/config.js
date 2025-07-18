/**
 * Configuration utility for the plugin
 * Handles merging user options with sensible defaults
 */

/**
 * Deep merge for objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @return {Object} - Merged result
 */
/*
function deepMerge( target, source ) {
  const result = { ...target };

  for ( const key in source ) {
    if ( source[key] instanceof Object && key in target && target[key] instanceof Object ) {
      result[key] = deepMerge( target[key], source[key] );
    } else {
      result[key] = source[key];
    }
  }

  return result;
}
*/

// Modern functional approach to deep merge - handles nested objects properly
// This is needed for formatOptions and placeholder options which are nested objects
const deepMerge = ( target, source ) =>
  Object.keys( source ).reduce(
    ( acc, key ) => ( {
      ...acc,
      [key]: source[key]?.constructor === Object ? deepMerge( target[key] || {}, source[key] ) : source[key]
    } ),
    { ...target }
  );

/**
 * Builds configuration with sensible defaults
 * @param {Object} options - User provided plugin options
 * @return {Object} - Complete config with defaults
 */
export function buildConfig( options = {} ) {
  // Default configuration with sensible defaults
  const defaults = {
    // Responsive breakpoints to generate
    widths: [320, 640, 960, 1280, 1920],

    // Formats to generate in order of preference (first is most preferred)
    formats: ['avif', 'webp', 'original'],

    // Format-specific compression settings
    formatOptions: {
      avif: { quality: 65, speed: 5 }, // Better compression but slower
      webp: { quality: 80, lossless: false },
      jpeg: { quality: 85, progressive: true },
      png: { compressionLevel: 8, palette: true }
    },

    // Which HTML files to process
    htmlPattern: '**/*.html',

    // CSS selector for images to process
    imgSelector: 'img:not([data-no-responsive])',

    // Output directory for processed images (relative to Metalsmith destination)
    outputDir: 'assets/images/responsive',

    // Output naming pattern
    // Available tokens: [filename], [width], [format], [hash]
    outputPattern: '[filename]-[width]w-[hash].[format]',

    // Whether to skip generating sizes larger than original
    skipLarger: true,

    // Add loading="lazy" to images
    lazy: true,

    // Add width and height attributes to prevent layout shift
    dimensionAttributes: true,

    // Default sizes attribute value for responsive images
    sizes: '(max-width: 768px) 100vw, 75vw',

    // Maximum number of images to process in parallel
    concurrency: 5,

    // Whether to generate a metadata JSON file
    generateMetadata: false,

    // Progressive loading options
    isProgressive: false, // TODO: Debug timeout issue in tests

    // Placeholder image settings for progressive loading
    placeholder: {
      width: 50,
      quality: 30,
      blur: 10
    },

    // Background image processing settings
    processUnusedImages: true, // Process images not found in HTML for background use
    imagePattern: '**/*.{jpg,jpeg,png,gif,webp,avif}' // Pattern to find images for background processing
  };

  // Special handling for formatOptions to ensure deep merging
  // This allows users to override specific format settings without losing defaults
  // e.g., { formatOptions: { jpeg: { quality: 90 } } } only changes JPEG quality
  if ( options && options.formatOptions ) {
    options = {
      ...options,
      formatOptions: deepMerge( defaults.formatOptions, options.formatOptions )
    };
  }

  // Special handling for placeholder options to ensure deep merging
  // Allows partial placeholder config like { placeholder: { width: 100 } }
  if ( options && options.placeholder ) {
    options = {
      ...options,
      placeholder: deepMerge( defaults.placeholder, options.placeholder )
    };
  }

  // Merge the defaults with user options
  return { ...defaults, ...( options || {} ) };
}
