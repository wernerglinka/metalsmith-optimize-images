# metalsmith-optimize-images

> **🚀 Release Candidate**: This plugin has achieved comprehensive test coverage (95.27%) and is ready for production testing. Recent critical bug fixes have resolved recursive processing and AVIF format issues. Feedback welcome before 1.0.0 release!

Metalsmith plugin for generating responsive images with optimal formats

[![metalsmith:plugin][metalsmith-badge]][metalsmith-url]
[![npm: version][npm-badge]][npm-url]
[![license: MIT][license-badge]][license-url]
[![test coverage][coverage-badge]][coverage-url]
[![ESM/CommonJS][modules-badge]][npm-url]
[![Known Vulnerabilities](https://snyk.io/test/npm/metalsmith-optimize-images/badge.svg)](https://snyk.io/test/npm/metalsmith-optimize-images)

## Features

- **Multiple image formats**: Generates AVIF and WebP variants with JPEG/PNG fallbacks
- **Responsive sizes**: Creates different image sizes for various device widths
- **Background image support**: Automatically processes unused images for CSS `image-set()` backgrounds
- **Progressive loading**: Optional progressive image loading with low-quality placeholders
- **Lazy loading**: Uses native browser lazy loading for better performance
- **Content-based hashing**: Adds hash to filenames for optimal caching
- **Layout shift prevention**: Adds width/height attributes
- **Parallel processing**: Processes images in parallel for faster builds
- **Metadata generation**: Creates a JSON manifest with image information and variants
- **Configurable compression**: Customize compression settings per format
- **ESM and CommonJS support**:
  - ESM: `import optimizeImages from 'metalsmith-optimize-images'`
  - CommonJS: `const optimizeImages = require('metalsmith-optimize-images')`

## Installation

```bash
npm install metalsmith-optimize-images
```

## Requirements

- Node.js >=18.0.0
- Metalsmith >=2.5.0

## Platform Testing Status

- ✅ **macOS**: Fully tested and working
- 🔄 **Windows**: Seeking community feedback on Sharp.js compatibility
- 🔄 **Linux**: Seeking validation across different distributions
- 🔄 **CI/CD**: Testing in various containerized environments

**Help us reach 1.0.0**: If you test this plugin on Windows, Linux, or in production environments, please [share your experience](https://github.com/wernerglinka/metalsmith-optimize-images/issues)!

## Usage

> This plugin **must** be run after assets are copied but before any final HTML processing.

```javascript
metalsmith
  .use(
    assets({
      source: 'lib/assets/', // Where to find assets
      destination: 'assets/' // Where to copy assets
    })
  )
  .use(
    optimizeImages({
      // configuration options
      widths: [320, 640, 960, 1280, 1920],
      formats: ['avif', 'webp', 'original']
    })
  );
```

## Options

| Option                | Type       | Default                               | Description                                                                    |
| --------------------- | ---------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `widths`              | `number[]` | `[320, 640, 960, 1280, 1920]`         | Image sizes to generate                                                        |
| `formats`             | `string[]` | `['avif', 'webp', 'original']`        | Image formats in order of preference                                           |
| `formatOptions`       | `object`   | See below                             | Format-specific compression settings                                           |
| `htmlPattern`         | `string`   | `**/*.html`                           | Glob pattern to match HTML files                                               |
| `imgSelector`         | `string`   | `img:not([data-no-responsive])`       | CSS selector for images to process                                             |
| `outputDir`           | `string`   | `assets/images/responsive`            | Where to store the responsive images                                           |
| `outputPattern`       | `string`   | `[filename]-[width]w-[hash].[format]` | Filename pattern with tokens                                                   |
| `skipLarger`          | `boolean`  | `true`                                | Don't upscale images                                                           |
| `lazy`                | `boolean`  | `true`                                | Use native lazy loading                                                        |
| `dimensionAttributes` | `boolean`  | `true`                                | Add width/height to prevent layout shift                                       |
| `sizes`               | `string`   | `(max-width: 768px) 100vw, 75vw`      | Default sizes attribute                                                        |
| `concurrency`         | `number`   | `5`                                   | Process N images at a time                                                     |
| `generateMetadata`    | `boolean`  | `false`                               | Generate a metadata JSON file at `{outputDir}/responsive-images-manifest.json` |
| `isProgressive`       | `boolean`  | `false`                               | Enable progressive image loading                                               |
| `placeholder`         | `object`   | See below                             | Placeholder image settings                                                     |
| `processUnusedImages` | `boolean`  | `true`                                | Process unused images for background use                                       |

### Default Format Options

```javascript
{
  avif: { quality: 65, speed: 5 },
  webp: { quality: 80, lossless: false },
  jpeg: { quality: 85, progressive: true },
  png: { compressionLevel: 8, palette: true }
}
```

### Default Placeholder Options

```javascript
{
  width: 50,      // Width of placeholder image
  quality: 30,    // Quality of placeholder image
  blur: 10        // Blur amount for placeholder
}
```

## How It Works

### Standard Mode (default)

The plugin operates in two phases:

**Phase 1: HTML-Referenced Images**

1. Scans HTML files for image tags
2. Processes each image to create multiple sizes and formats
3. Creates a content hash for each image for efficient caching
4. Replaces `<img>` tags with responsive `<picture>` elements
5. Adds width/height attributes to prevent layout shifts
6. Implements native lazy loading for better performance

**Phase 2: Background Images (when `processUnusedImages: true`)**

1. Finds images that weren't processed in Phase 1
2. Generates 1x/2x variants (half size and original size) for retina displays
3. Creates all configured formats (AVIF, WebP, original)
4. Suitable for use with CSS `image-set()` for background images

### Progressive Mode (experimental)

When `isProgressive: true` is enabled:

1. Generates low-quality placeholder images (small, blurred)
2. Creates wrapper elements with both placeholder and high-resolution images
3. Uses Intersection Observer to load high-resolution images on demand
4. Implements smooth transitions between placeholder and final image
5. Uses modern `createImageBitmap()` for reliable format detection (AVIF/WebP support)
6. Maintains proper aspect ratios using original image dimensions
7. Provides CSS and JavaScript for progressive loading behavior

## Examples

### Basic usage with defaults

```javascript
metalsmith.use(optimizeImages());
```

### Custom configuration

```javascript
metalsmith.use(
  optimizeImages({
    // Generate fewer sizes
    widths: [480, 960, 1920],

    // Only use WebP and original format
    formats: ['webp', 'original'],

    // Custom quality settings
    formatOptions: {
      webp: { quality: 75, lossless: false },
      jpeg: { quality: 80, progressive: true }
    },

    // Custom selector for specific images
    imgSelector: 'img.responsive',

    // Custom output directory
    outputDir: 'images/processed',

    // Generate metadata manifest
    generateMetadata: true, // Creates images/processed/responsive-images-manifest.json

    // Don't add lazy loading
    lazy: false
  })
);
```

### Progressive loading configuration

```javascript
metalsmith.use(
  optimizeImages({
    // Enable progressive loading
    isProgressive: true,

    // Customize placeholder settings
    placeholder: {
      width: 40, // Smaller placeholder
      quality: 20, // Lower quality for faster loading
      blur: 15 // More blur for artistic effect
    },

    // Progressive mode works best with original format only
    formats: ['original']
  })
);
```

### Excluding specific images

Add the `data-no-responsive` attribute to any image you don't want processed:

```html
<img src="image.jpg" data-no-responsive alt="This image won't be processed" />
```

## Background Images

The plugin automatically processes images that aren't referenced in HTML for use as CSS background images. This feature is enabled by default (`processUnusedImages: true`).

### How Background Processing Works

After processing HTML-referenced images, the plugin:

1. **Scans the Metalsmith files object** for all images
2. **Excludes already-processed images** (those found during HTML scanning)
3. **Excludes responsive variants** (generated images in the outputDir)
4. **Generates 1x/2x variants** using actual image dimensions:
   - **1x variant**: Half the original size for regular displays
   - **2x variant**: Original image size for retina displays (sharper on high-DPI screens)
5. **Creates all formats** (AVIF, WebP, original) for optimal browser support
6. **No HTML replacement** - you manually write CSS with `image-set()`

### Using Background Images with CSS

For an image like `images/hero.jpg` (1920x1080 pixels), the plugin generates variants like:

```
assets/images/responsive/hero-960w.avif   (1x - half 960px width for regular displays)
assets/images/responsive/hero-1920w.avif  (2x - original 1920px width, sharper on retina)
assets/images/responsive/hero-960w.webp   (1x - half 960px width for regular displays)
assets/images/responsive/hero-1920w.webp  (2x - original 1920px width, sharper on retina)
assets/images/responsive/hero-960w.jpg    (1x - half 960px width for regular displays)
assets/images/responsive/hero-1920w.jpg   (2x - original 1920px width, sharper on retina)
```

**Note**: Background images are generated **without hashes** for easier CSS authoring. HTML images still include hashes for cache-busting.

Use them in CSS with `image-set()`:

```css
.hero {
  background-image: image-set(
    url('/assets/images/responsive/hero-960w.avif') 1x,
    url('/assets/images/responsive/hero-1920w.avif') 2x,
    url('/assets/images/responsive/hero-960w.webp') 1x,
    url('/assets/images/responsive/hero-1920w.webp') 2x,
    url('/assets/images/responsive/hero-960w.jpg') 1x,
    url('/assets/images/responsive/hero-1920w.jpg') 2x
  );
  background-size: cover;
  background-position: center;
}
```

### Background Image Configuration

```javascript
metalsmith.use(
  optimizeImages({
    // Standard HTML image processing
    widths: [320, 640, 960, 1280, 1920],
    formats: ['avif', 'webp', 'original'],

    // Background image processing
    processUnusedImages: true, // Enable background processing

    // Generate metadata to see all variants
    generateMetadata: true
  })
);
```

### Benefits of Background Image Processing

- **Automatic format optimization** - Browser selects best supported format
- **Retina display support** - 2x variants provide crisp images on high-DPI screens
- **Smart sizing** - Uses actual image dimensions instead of arbitrary widths
- **No manual work** - Plugin automatically finds and processes unused images in Metalsmith files object
- **Consistent workflow** - Same formats and quality settings as HTML images
- **Efficient processing** - Parallel processing of sizes and formats

## Progressive Loading

### Overview

Progressive loading provides a smooth user experience by:

1. **Immediate display**: Shows a low-quality placeholder instantly
2. **Smooth transitions**: Fades from placeholder to high-quality image
3. **Lazy loading**: Only loads high-resolution images when they enter the viewport
4. **Format optimization**: Automatically serves the best supported format

### Implementation

When progressive mode is enabled, the plugin:

- Generates small, blurred placeholder images
- Creates wrapper elements with proper aspect ratios
- Includes JavaScript for intersection observer-based loading
- Provides CSS for smooth transitions

### HTML Output

**Standard mode:**

```html
<picture>
  <source
    type="image/avif"
    srcset="image-320w.avif 320w, image-640w.avif 640w"
    sizes="(max-width: 768px) 100vw, 75vw"
  />
  <source
    type="image/webp"
    srcset="image-320w.webp 320w, image-640w.webp 640w"
    sizes="(max-width: 768px) 100vw, 75vw"
  />
  <img
    src="image-640w.jpg"
    srcset="image-320w.jpg 320w, image-640w.jpg 640w"
    sizes="(max-width: 768px) 100vw, 75vw"
    alt="Description"
    loading="lazy"
  />
</picture>
```

**Progressive mode:**

```html
<div class="responsive-wrapper js-progressive-image-wrapper" style="aspect-ratio: 1280/720">
  <img class="low-res" src="/assets/images/responsive/image-placeholder.jpg" alt="Description" />
  <img class="high-res" src="" alt="Description" data-source="/assets/images/responsive/image-960w.jpg" />
</div>
```

### CSS Requirements

The plugin provides CSS for progressive loading, but you can customize it:

```css
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
```

## Metadata Manifest

When `generateMetadata: true` is enabled, the plugin creates a JSON file at `{outputDir}/responsive-images-manifest.json` containing detailed information about all processed images:

```json
{
  "images/hero.jpg": [
    {
      "path": "assets/images/responsive/hero-320w-a1b2c3d4.avif",
      "width": 320,
      "height": 180,
      "format": "avif",
      "size": 8432
    },
    {
      "path": "assets/images/responsive/hero-320w-a1b2c3d4.webp",
      "width": 320,
      "height": 180,
      "format": "webp",
      "size": 12658
    }
  ]
}
```

This manifest is useful for:

- **Debugging**: Verify which variants were generated
- **Integration**: Use variant information in other tools
- **Performance analysis**: Compare file sizes across formats

## Debug

To enable debug logs, set the DEBUG environment variable to metalsmith-optimize-images\*:

```javascript
metalsmith.env('DEBUG', 'metalsmith-optimize-images*');
```

## CLI Usage

### Metalsmith CLI

```json
{
  "plugins": {
    "metalsmith-optimize-images": {
      "widths": [320, 640, 960, 1280, 1920],
      "formats": ["avif", "webp", "original"]
    }
  }
}
```

## Recent Updates

### Bug Fixes (January 2025)

- **🚫 Fixed Recursive Processing**: Resolved critical issue where the background image processor was finding already-generated responsive images and reprocessing them recursively, creating malformed filenames like `image-320w-640w-960w.jpg`
- **🚫 Fixed HEIF Extension Issue**: Fixed Sharp.js AVIF processing that was sometimes generating `.heif` extensions instead of `.avif`
- **✅ Enhanced Background Image Filtering**: Added comprehensive filtering to prevent responsive variants from being treated as source images

## Feedback & Testing

This plugin is approaching 1.0.0 and we'd love your feedback! Please test and report:

### Especially Needed

- **Windows compatibility**: Sharp.js native compilation and image processing
- **Large image batches**: Performance with 50+ images
- **Memory usage**: Resource consumption in your environment
- **Cross-platform consistency**: Image quality and file sizes across platforms
- **Progressive loading**: Behavior across different browsers
- **Background image processing**: Testing the new `image-set()` feature with CSS backgrounds

### Current Status

- ✅ 95.27% test coverage with comprehensive edge case handling
- ✅ Real Metalsmith integration tests (no mocks)
- ✅ Tested on macOS with Node.js 18+
- 🔄 Seeking broader platform validation

**Report issues or success stories**: [GitHub Issues](https://github.com/wernerglinka/metalsmith-optimize-images/issues)

## License

MIT

[npm-badge]: https://img.shields.io/npm/v/metalsmith-optimize-images.svg
[npm-url]: https://www.npmjs.com/package/metalsmith-optimize-images
[metalsmith-badge]: https://img.shields.io/badge/metalsmith-plugin-green.svg?longCache=true
[metalsmith-url]: https://metalsmith.io
[license-badge]: https://img.shields.io/github/license/wernerglinka/metalsmith-optimize-images
[license-url]: LICENSE
[coverage-badge]: https://img.shields.io/badge/test%20coverage-95%25-brightgreen
[coverage-url]: https://github.com/wernerglinka/metalsmith-optimize-images/actions/workflows/test.yml
[modules-badge]: https://img.shields.io/badge/modules-ESM%2FCJS-blue
