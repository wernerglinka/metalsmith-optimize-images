/**
 * Configuration utility for the plugin
 */

/**
 * Deep merge for objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @return {Object} - Merged result
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Builds configuration with sensible defaults
 * @param {Object} options - User provided plugin options
 * @return {Object} - Complete config with defaults
 */
export function buildConfig(options = {}) {
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
    generateMetadata: false
  };

  // Special handling for formatOptions to ensure deep merging
  if (options.formatOptions) {
    options = {
      ...options,
      formatOptions: deepMerge(defaults.formatOptions, options.formatOptions)
    };
  }

  // Merge the defaults with user options
  return { ...defaults, ...options };
}
