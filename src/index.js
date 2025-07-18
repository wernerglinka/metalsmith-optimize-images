/**
 * Metalsmith plugin for generating responsive images with optimal formats
 * @module metalsmith-optimize-images
 */

import path from 'path';
import fs from 'fs';
import * as mkdirp from 'mkdirp';
import sharp from 'sharp';
import { buildConfig } from './utils/config.js';
import { processHtmlFile, generateMetadata } from './processors/htmlProcessor.js';
import { processImageToVariants } from './processors/imageProcessor.js';
import { generateHash } from './utils/hash.js';
import { generateVariantPath } from './utils/paths.js';

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
 * @param {boolean} [options.processUnusedImages] - Whether to process unused images for background use (default: true)
 * @param {string} [options.imagePattern] - Glob pattern to find images for background processing (default: `**\/*.{jpg,jpeg,png,gif,webp,avif}`)
 * @param {string} [options.imageFolder] - Folder to scan for background images, relative to source (default: 'lib/assets/images')
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
      // Also ensure they actually end with .html to avoid processing CSS/JS files
      const htmlFiles = Object.keys( files ).filter( ( file ) => {
        // Must match the HTML pattern
        if ( !metalsmith.match( config.htmlPattern, file ) ) {
          return false;
        }
        
        // Must actually be an HTML file
        if ( !file.endsWith( '.html' ) ) {
          return false;
        }
        
        return true;
      } );

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

      // Process unused images for background image support
      // This finds images that weren't processed during HTML scanning and creates variants
      // for use in CSS background-image with image-set()
      if ( config.processUnusedImages ) {
        await processUnusedImages( files, metalsmith, processedImages, debug, config );
      }

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

/**
 * Process unused images for background image support
 * Finds images that weren't processed during HTML scanning and creates 1x/2x variants
 * for use in CSS background-image with image-set()
 * @param {Object} files - Metalsmith files object
 * @param {Object} metalsmith - Metalsmith instance
 * @param {Map} processedImages - Cache of already processed images
 * @param {Function} debug - Debug function
 * @param {Object} config - Plugin configuration
 * @return {Promise<void>} - Promise that resolves when processing is complete
 */
async function processUnusedImages( files, metalsmith, processedImages, debug, config ) {
  debug( 'Processing unused images for background image support' );

  // Get all image paths that were already processed during HTML scanning
  const processedImagePaths = new Set();
  processedImages.forEach( ( _variants, cacheKey ) => {
    const [imagePath] = cacheKey.split( ':' );
    processedImagePaths.add( imagePath );
  } );

  debug( `Processed image paths from HTML: ${Array.from( processedImagePaths ).join( ', ' )}` );

  // Find images that weren't processed during HTML scanning using hybrid approach
  const allBackgroundImages = await findUnprocessedImages( files, metalsmith, config, processedImagePaths, debug );
  debug( `Background images found to process: ${allBackgroundImages.map( img => img.path ).join( ', ' )}` );

  if ( allBackgroundImages.length === 0 ) {
    debug( 'No unused images found to process' );
    return;
  }

  debug( `Found ${allBackgroundImages.length} unused images to process for background use` );

  // Process background images one at a time
  for ( const imageObj of allBackgroundImages ) {
    try {
      debug( `Processing background image: ${imageObj.path} (source: ${imageObj.source})` );

      // Generate background variants with original size and half size
      const variants = await processBackgroundImageVariants( 
        imageObj.buffer, 
        imageObj.path, 
        debug, 
        config 
      );

      // Save all generated variants to Metalsmith files object
      variants.forEach( ( variant ) => {
        files[variant.path] = {
          contents: variant.buffer
        };
      } );

      // Cache the variants (using current timestamp as mtime for unused images)
      const cacheKey = `${imageObj.path}:${Date.now()}`;
      processedImages.set( cacheKey, variants );

      debug( `Generated ${variants.length} background variants for ${imageObj.path}` );
    } catch ( err ) {
      debug( `Error processing background image ${imageObj.path}: ${err.message}` );
    }
  }

  debug( 'Background image processing complete' );
}

/**
 * Find images that weren't processed during HTML scanning
 * Uses a hybrid approach: scans filesystem first, then falls back to Metalsmith files object
 * @param {Object} files - Metalsmith files object
 * @param {Object} metalsmith - Metalsmith instance
 * @param {Object} config - Plugin configuration
 * @param {Set} processedImagePaths - Set of already processed image paths
 * @param {Function} debug - Debug function
 * @return {Promise<Array>} - Array of unprocessed image objects with {path, buffer}
 */
async function findUnprocessedImages( files, metalsmith, config, processedImagePaths, debug ) {
  const unprocessedImages = [];
  const sourceImagesDir = path.join( metalsmith.source(), 'lib/assets/images' );
  
  debug( `Looking for unprocessed images using hybrid approach` );
  
  // Method 1: Scan filesystem (for real testbed scenario)
  try {
    debug( `Attempting to scan source directory: ${sourceImagesDir}` );
    debug( `Source directory exists: ${fs.existsSync( sourceImagesDir )}` );
    debug( `Metalsmith source: ${metalsmith.source()}` );
    debug( `Metalsmith destination: ${metalsmith.destination()}` );
    
    if ( fs.existsSync( sourceImagesDir ) ) {
      debug( `Scanning source directory: ${sourceImagesDir}` );
      
      const scanDirectory = ( dir, relativePath = '' ) => {
        const items = fs.readdirSync( dir );
        debug( `Found ${items.length} items in ${dir}` );
        
        for ( const item of items ) {
          if ( item === '.DS_Store' ) continue;
          
          const fullPath = path.join( dir, item );
          const itemRelativePath = path.join( relativePath, item );
          
          if ( fs.statSync( fullPath ).isDirectory() ) {
            debug( `Scanning subdirectory: ${item}` );
            scanDirectory( fullPath, itemRelativePath );
          } else {
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
            if ( imageExtensions.some( ext => item.toLowerCase().endsWith( ext ) ) ) {
              // Skip if this is in the responsive output directory
              if ( itemRelativePath.startsWith( 'responsive/' ) || 
                   itemRelativePath.includes( '/responsive/' ) ||
                   fullPath.includes( config.outputDir ) ) {
                debug( `Skipping responsive variant: ${itemRelativePath}` );
                continue;
              }
              
              const buildPath = path.join( 'assets/images', itemRelativePath );
              const normalizedBuildPath = buildPath.replace( /\\/g, '/' );
              
              debug( `Found filesystem image: ${item} -> ${normalizedBuildPath}` );
              debug( `Already processed? ${processedImagePaths.has( normalizedBuildPath )}` );
              
              if ( !processedImagePaths.has( normalizedBuildPath ) ) {
                debug( `Found unprocessed filesystem image: ${itemRelativePath}` );
                const imageBuffer = fs.readFileSync( fullPath );
                unprocessedImages.push( {
                  path: itemRelativePath,
                  buffer: imageBuffer,
                  source: 'filesystem'
                } );
              }
            }
          }
        }
      };
      
      scanDirectory( sourceImagesDir );
    } else {
      debug( `Source directory does not exist, trying alternative paths...` );
      
      // Try alternative paths
      const altPaths = [
        path.join( metalsmith.source(), 'assets/images' ),
        path.join( metalsmith.source(), 'images' ),
        path.join( metalsmith.destination(), 'assets/images' ),
        path.join( process.cwd(), 'lib/assets/images' ),
        path.join( process.cwd(), 'src/assets/images' )
      ];
      
      for ( const altPath of altPaths ) {
        debug( `Trying alternative path: ${altPath} - exists: ${fs.existsSync( altPath )}` );
        if ( fs.existsSync( altPath ) ) {
          debug( `Found images at alternative path: ${altPath}` );
          
          // Scan the found alternative path
          const scanAlternativeDirectory = ( dir, relativePath = '' ) => {
            const items = fs.readdirSync( dir );
            debug( `Found ${items.length} items in alternative path ${dir}` );
            
            for ( const item of items ) {
              if ( item === '.DS_Store' ) continue;
              
              const fullPath = path.join( dir, item );
              const itemRelativePath = path.join( relativePath, item );
              
              if ( fs.statSync( fullPath ).isDirectory() ) {
                debug( `Scanning alternative subdirectory: ${item}` );
                scanAlternativeDirectory( fullPath, itemRelativePath );
              } else {
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
                if ( imageExtensions.some( ext => item.toLowerCase().endsWith( ext ) ) ) {
                  // Skip if this is in the responsive output directory
                  if ( itemRelativePath.startsWith( 'responsive/' ) || 
                       itemRelativePath.includes( '/responsive/' ) ||
                       fullPath.includes( config.outputDir ) ) {
                    debug( `Skipping responsive variant in alt scan: ${itemRelativePath}` );
                    continue;
                  }
                  
                  // For build directory, the path structure is already correct
                  const buildPath = altPath.includes( 'build' ) 
                    ? path.join( 'assets/images', itemRelativePath )
                    : path.join( 'assets/images', itemRelativePath );
                  const normalizedBuildPath = buildPath.replace( /\\/g, '/' );
                  
                  debug( `Found alternative filesystem image: ${item} -> ${normalizedBuildPath}` );
                  debug( `Already processed? ${processedImagePaths.has( normalizedBuildPath )}` );
                  
                  if ( !processedImagePaths.has( normalizedBuildPath ) ) {
                    debug( `Found unprocessed alternative filesystem image: ${itemRelativePath}` );
                    const imageBuffer = fs.readFileSync( fullPath );
                    unprocessedImages.push( {
                      path: itemRelativePath,
                      buffer: imageBuffer,
                      source: 'filesystem-alt'
                    } );
                  }
                }
              }
            }
          };
          
          scanAlternativeDirectory( altPath );
          break; // Stop after finding and scanning the first valid path
        }
      }
    }
  } catch ( err ) {
    debug( `Error scanning filesystem: ${err.message}` );
  }
  
  // Method 2: Scan Metalsmith files object (for test scenarios and edge cases)
  debug( `Scanning Metalsmith files object` );
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
  
  Object.keys( files ).forEach( filePath => {
    // Skip if not an image
    if ( !imageExtensions.some( ext => filePath.toLowerCase().endsWith( ext ) ) ) {
      return;
    }
    
    // Skip if it's already a responsive variant (comprehensive checks)
    if ( filePath.startsWith( config.outputDir + '/' ) ||
         filePath.includes( '/responsive/' ) ||
         filePath.includes( 'responsive-images-manifest.json' ) ||
         filePath.match( /-\d+w(-[a-f0-9]+)?\.(avif|webp|jpg|jpeg|png)$/i ) ) {
      debug( `Skipping responsive variant in files object: ${filePath}` );
      return;
    }
    
    // Skip if already processed during HTML scanning
    if ( processedImagePaths.has( filePath ) ) {
      debug( `Skipping already processed files object image: ${filePath}` );
      return;
    }
    
    // Check if we already found this image from filesystem scan
    const isAlreadyFound = unprocessedImages.some( img => {
      // For files object images starting with 'images/', check if filesystem found the same file
      if ( filePath.startsWith( 'images/' ) ) {
        const relativePath = filePath.replace( 'images/', '' );
        return img.path === relativePath;
      }
      return false;
    } );
    
    if ( !isAlreadyFound ) {
      debug( `Found unprocessed files object image: ${filePath}` );
      unprocessedImages.push( {
        path: filePath,
        buffer: files[filePath].contents,
        source: 'files'
      } );
    }
  } );
  
  debug( `Found ${unprocessedImages.length} unprocessed images total` );
  return unprocessedImages;
}

/**
 * Process a background image to create 1x (original) and 2x (half-size) variants
 * for use with CSS image-set() for retina displays
 * @param {Buffer} buffer - Original image buffer
 * @param {string} originalPath - Original image path
 * @param {Function} debugFn - Debug function for logging
 * @param {Object} config - Plugin configuration
 * @return {Promise<Array<Object>>} - Array of generated variants
 */
async function processBackgroundImageVariants( buffer, originalPath, debugFn, config ) {
  const image = sharp( buffer );
  const metadata = await image.metadata();
  const variants = [];

  debugFn( `Processing background image ${originalPath}: ${metadata.width}x${metadata.height}` );

  // Create 1x (original size) and 2x (half size) variants
  const sizes = [
    { width: metadata.width, density: '1x' },
    { width: Math.round( metadata.width / 2 ), density: '2x' }
  ];

  // Process both sizes in parallel
  const sizePromises = sizes.map( async ( size ) => {
    // Create a Sharp instance for this size
    const resized = image.clone().resize( {
      width: size.width,
      withoutEnlargement: true // Don't upscale images
    } );

    // Get actual dimensions after resize
    const resizedMeta = await resized.metadata();

    // Process each format in parallel for this size
    const formatPromises = config.formats.map( async ( format ) => {
      try {
        // Skip problematic format combinations
        if ( format === 'original' && metadata.format.toLowerCase() === 'webp' ) {
          return null;
        }

        // Determine output format and Sharp method
        let outputFormat = format;
        let sharpMethod = format;

        if ( format === 'original' ) {
          outputFormat = metadata.format.toLowerCase();
          sharpMethod = outputFormat === 'jpeg' ? 'jpeg' : outputFormat;
        }

        // Apply format-specific processing
        let processedImage = resized.clone();
        const formatOptions = config.formatOptions[format === 'original' ? outputFormat : format] || {};

        if ( sharpMethod === 'avif' ) {
          processedImage = processedImage.avif( formatOptions );
        } else if ( sharpMethod === 'webp' ) {
          processedImage = processedImage.webp( formatOptions );
        } else if ( sharpMethod === 'jpeg' ) {
          processedImage = processedImage.jpeg( formatOptions );
        } else if ( sharpMethod === 'png' ) {
          processedImage = processedImage.png( formatOptions );
        }

        // Generate output buffer
        const outputBuffer = await processedImage.toBuffer();

        // Generate variant path without hash for easier CSS usage
        const variantPath = generateBackgroundVariantPath( originalPath, size.width, outputFormat, config );

        debugFn( `Generated background variant: ${variantPath} (${size.density})` );

        return {
          path: variantPath,
          buffer: outputBuffer,
          width: resizedMeta.width,
          height: resizedMeta.height,
          format: outputFormat,
          density: size.density
        };
      } catch ( err ) {
        debugFn( `Error processing ${format} format for ${originalPath}: ${err.message}` );
        return null;
      }
    } );

    const formatResults = await Promise.all( formatPromises );
    return formatResults.filter( ( result ) => result !== null );
  } );

  const sizeResults = await Promise.all( sizePromises );
  
  // Flatten the results
  sizeResults.forEach( ( formatVariants ) => {
    variants.push( ...formatVariants );
  } );

  debugFn( `Generated ${variants.length} background variants for ${originalPath}` );
  return variants;
}

/**
 * Generate background image variant path without hash for easier CSS usage
 * Creates predictable filenames that can be written in CSS without knowing the hash
 * @param {string} originalPath - Original image path
 * @param {number} width - Target width
 * @param {string} format - Target format
 * @param {Object} config - Plugin configuration
 * @return {string} - Generated path without hash
 */
function generateBackgroundVariantPath( originalPath, width, format, config ) {
  const parsedPath = path.parse( originalPath );
  const originalFormat = parsedPath.ext.slice( 1 ).toLowerCase();
  
  // If format is 'original', use the source format
  const outputFormat = format === 'original' ? originalFormat : format;
  
  // Create background pattern without hash: '[filename]-[width]w.[format]'
  // Results in: 'header1-1000w.webp' instead of 'header1-1000w-abc12345.webp'
  const outputName = config.outputPattern
    .replace( '[filename]', parsedPath.name )
    .replace( '[width]', width )
    .replace( '[format]', outputFormat )
    .replace( '-[hash]', '' )  // Remove hash placeholder and preceding dash
    .replace( '[hash]', '' );  // Remove any remaining hash placeholder
  
  return path.join( config.outputDir, outputName );
}

export default optimizeImagesPlugin;
