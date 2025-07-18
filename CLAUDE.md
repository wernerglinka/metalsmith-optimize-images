# metalsmith-optimize-images

## Project Overview

This is a Metalsmith plugin that generates responsive images with optimal formats (AVIF, WebP, JPEG/PNG) and multiple sizes. It replaces standard `<img>` tags with responsive `<picture>` elements or progressive loading wrappers.

## Current Status

**✅ ACHIEVED**: This plugin has reached comprehensive test coverage and is ready for broader testing.

### Recent Bug Fixes (January 2025)

- **🚫 Fixed Recursive Processing**: Resolved critical issue where background image processor was finding already-generated responsive images and reprocessing them recursively, creating malformed filenames like `image-320w-640w-960w.jpg`
- **🚫 Fixed HEIF Extension Issue**: Fixed Sharp.js AVIF processing that was sometimes generating `.heif` extensions instead of `.avif`
- **✅ Enhanced Background Image Filtering**: Added comprehensive filtering to prevent responsive variants from being treated as source images

### Test Coverage Status

- **Current**: **95.27% test coverage** (exceeds target)
- **Target**: >95% test coverage ✅ **ACHIEVED**
- **Method**: Comprehensive test suite implemented with real Metalsmith instances
- **Testing Philosophy**: Uses real Metalsmith instances instead of mocks for better integration testing
- **Clean output**: Debug statements removed from tests for professional test results

## Architecture

### Core Components

#### Main Plugin (`src/index.js`)

- Entry point that orchestrates the entire process
- Handles configuration, file discovery, and parallel processing
- Implements two-level parallelism: HTML files → Images within files
- Manages output directory creation and metadata generation

#### Image Processing (`src/processors/imageProcessor.js`)

- Core Sharp.js operations for resizing and format conversion
- Generates multiple sizes (320w, 640w, 960w, 1280w, 1920w by default)
- Supports AVIF, WebP, and original formats with configurable quality
- Implements intelligent caching to avoid reprocessing identical images
- Handles images from both Metalsmith files and build directory

#### HTML Processing (`src/processors/htmlProcessor.js`)

- Parses HTML files using Cheerio
- Finds images matching CSS selector (`img:not([data-no-responsive])`)
- Replaces `<img>` tags with responsive `<picture>` elements
- Supports both standard and progressive loading modes
- Injects CSS/JavaScript for progressive loading when needed

#### Progressive Loading (`src/processors/progressiveProcessor.js`)

- **Experimental feature** for smooth image loading
- Generates low-quality placeholders (small, blurred, compressed)
- Creates wrapper elements with intersection observer loading
- Uses modern `createImageBitmap()` for reliable format detection (AVIF/WebP support)
- Provides CSS transitions for smooth placeholder → high-res transitions
- Proper aspect ratio calculation using original image dimensions

#### Utilities

- **`config.js`**: Deep merges user options with sensible defaults
- **`hash.js`**: Generates MD5 hashes for cache-busting filenames
- **`paths.js`**: Handles filename pattern system with token replacement

## Key Features

### Standard Mode (Default)

- Generates `<picture>` elements with multiple format sources
- Browser automatically selects best supported format
- Includes `loading="lazy"` for performance
- Adds `width`/`height` attributes to prevent layout shift

### Progressive Mode (Experimental)

- Shows low-quality placeholder immediately
- Loads high-resolution image when entering viewport
- Smooth opacity transitions between placeholder and final image
- Modern `createImageBitmap()` format detection for reliable AVIF/WebP support
- Maintains correct aspect ratios using original image dimensions

### Background Image Processing (Fully Implemented)

- **Two-phase processing**: HTML-referenced images first, then unused images
- **Automatic detection**: Finds images in Metalsmith files object that weren't processed during HTML scanning
- **1x/2x variants**: Generates original size (1x) and half-size (2x) for retina displays
- **CSS integration**: Creates variants optimized for `image-set()` usage with proper retina support
- **Format optimization**: All configured formats (AVIF, WebP, original)
- **Performance control**: Can be disabled via `processUnusedImages: false`
- **Smart processing**: Uses actual image dimensions instead of arbitrary widths
- **Hashless filenames**: Background images generated without hashes for easier CSS authoring

### Performance Optimizations

- **Parallel processing**: Multiple images processed simultaneously
- **Caching**: Identical images (same file + mtime) processed once
- **Concurrency limits**: Configurable to prevent system overload
- **Lazy loading**: Native browser lazy loading support

## Configuration

### Core Settings

```javascript
{
  widths: [320, 640, 960, 1280, 1920],           // Responsive breakpoints
  formats: ['avif', 'webp', 'original'],         // Format preference order
  htmlPattern: '**/*.html',                      // Files to process
  imgSelector: 'img:not([data-no-responsive])',  // Image selector
  outputDir: 'assets/images/responsive',         // Output directory
  outputPattern: '[filename]-[width]w-[hash].[format]', // Naming pattern
  skipLarger: true,                              // Don't upscale images
  lazy: true,                                    // Add loading="lazy"
  dimensionAttributes: true,                     // Add width/height
  concurrency: 5,                                // Parallel processing limit
  generateMetadata: false,                       // JSON manifest file
  isProgressive: false,                          // Progressive loading mode
  processUnusedImages: true                      // Process images not found in HTML
}
```

### Format Options

```javascript
formatOptions: {
  avif: { quality: 65, speed: 5 },
  webp: { quality: 80, lossless: false },
  jpeg: { quality: 85, progressive: true },
  png: { compressionLevel: 8, palette: true }
}
```

### Progressive Loading Settings

```javascript
placeholder: {
  width: 50,      // Placeholder width in pixels
  quality: 30,    // JPEG quality for placeholder
  blur: 10        // Blur radius for placeholder
}
```

## Token System

The `outputPattern` supports these tokens:

- `[filename]` - Original filename without extension
- `[width]` - Target width (e.g., 320, 640)
- `[format]` - Output format (avif, webp, jpeg, png)
- `[hash]` - 8-character MD5 hash for cache-busting

Example: `[filename]-[width]w-[hash].[format]` → `hero-640w-abc12345.webp`

## Integration Notes

### Plugin Order

**CRITICAL**: This plugin must run:

1. **After** assets are copied (images must be available)
2. **Before** final HTML processing or minification

```javascript
metalsmith
  .use(assets({ source: 'lib/assets/', destination: 'assets/' }))
  .use(
    optimizeImages({
      /* config */
    })
  )
  .use(
    htmlMinifier({
      /* config */
    })
  );
```

### Debug Mode

Enable debug logging:

```bash
DEBUG=metalsmith-optimize-images* npm run build
```

## Testing Philosophy

### Real Instances Over Mocks

This project follows a strict policy of **minimizing mocking** in favor of using real Metalsmith instances:

- ✅ **Real Metalsmith instances** in all integration tests
- ✅ **API compatibility** - tests break when Metalsmith API changes
- ✅ **Complete behavior** - tests verify actual plugin integration
- ✅ **Future-proof** - catches breaking changes automatically

### Current Test Coverage: 96.06%

- **76 tests** covering all major functionality
- **Unit tests** for utilities and pure functions
- **Integration tests** with real Metalsmith workflow
- **Edge case coverage** for error handling and unusual configurations
- **Performance tests** for parallel processing

## Future Improvements

### Performance Enhancements

- Implement more sophisticated caching (cross-build persistence)
- Optimize memory usage for large image batches
- Add support for image optimization workers

### Feature Additions

- Support for additional formats (WebP2, JPEG XL when available)
- Configurable placeholder generation strategies
- Integration with CDN providers
- Support for art direction with different images per breakpoint

## Troubleshooting

### Common Issues

1. **Images not found**: Ensure assets plugin runs before this plugin
2. **Memory issues**: Reduce concurrency setting for large images
3. **Progressive loading not working**: Check browser console for JavaScript errors
4. **Aspect ratio issues**: Verify placeholder generation includes original dimensions

### Debug Workflow

1. Enable debug logging with `DEBUG=metalsmith-optimize-images*`
2. Check generated metadata file if `generateMetadata: true`
3. Verify output directory contains expected image variants
4. Test responsive behavior in browser dev tools

## Development Notes

### Code Organization

- Each processor handles a specific aspect (image, HTML, progressive)
- Utilities are pure functions for testability
- Configuration uses deep merge for nested options
- All async operations use Promise.all for parallelism

### Testing Approach ✅ **IMPLEMENTED**

- **Unit tests** for utilities and pure functions (100% coverage)
- **Integration tests** with real Metalsmith instances (96.06% coverage)
- **Edge case testing** for error conditions and unusual inputs
- **Mock minimization** - always use real Metalsmith instances when available
- **Performance validation** for parallel processing scenarios

### Code Quality Standards

- **ESLint compliance** with strict rules
- **No unused variables** (enforced with \_prefix for intentional unused args)
- **Comprehensive comments** added to all source files for maintainability
- **Type safety** through JSDoc annotations

This plugin represents a comprehensive approach to responsive image optimization in static site generation, balancing performance, developer experience, and browser compatibility.
