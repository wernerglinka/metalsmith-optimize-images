# metalsmith-optimize-images

Metalsmith plugin for generating responsive images with optimal formats

[![metalsmith:plugin][metalsmith-badge]][metalsmith-url]
[![npm: version][npm-badge]][npm-url]
[![license: MIT][license-badge]][license-url]
[![test coverage][coverage-badge]][coverage-url]
[![ESM/CommonJS][modules-badge]][npm-url]

> This Metalsmith plugin is under active development. The API is stable, but breaking changes may occur before reaching 1.0.0.

> **Breaking change in 0.12.0**: When the persistent cache is enabled (`cache: true`), this plugin must now run **before** `metalsmith-static-files` in the pipeline, not after. The plugin writes variants to the source tree and the static-files plugin copies them to the build. See [Usage](#usage) for details.

## Features

- **Multiple image formats**: Generates AVIF and WebP variants with JPEG/PNG fallbacks
- **Responsive sizes**: Creates different image sizes for various device widths
- **Persistent cache**: Writes variants to a source-tree directory so subsequent builds (and CI) skip Sharp entirely
- **Background image support**: Automatically processes unused images for CSS `image-set()` backgrounds
- **Progressive loading**: Optional progressive image loading with low-quality placeholders
- **Lazy loading**: Uses native browser lazy loading
- **Content-based hashing**: Adds hash to filenames for optimal caching
- **Layout shift prevention**: Adds width/height attributes
- **Parallel processing**: Processes images in parallel
- **Metadata generation**: Creates a JSON manifest with image information and variants
- **Configurable compression**: Customize compression settings per format
- **ESM and CommonJS support**:
  - ESM: `import optimizeImages from 'metalsmith-optimize-images'`
  - CommonJS: `const optimizeImages = require('metalsmith-optimize-images')`

## Installation

```bash
npm install metalsmith-optimize-images
```

## Usage

When the persistent cache is enabled the plugin should run **before** the static-files copy so that newly generated variants land in the cache directory and get picked up by the copy step. When the cache is disabled the plugin should run **after** assets are copied, since it needs the images to already be in the Metalsmith files object.

### With persistent cache (recommended)

```javascript
metalsmith
  .use(
    optimizeImages({
      cache: true,
      widths: [320, 640, 960, 1280, 1920],
      formats: ['avif', 'webp', 'original']
      
    })
  )
  .use(
    assets({
      source: 'lib/assets/',
      destination: 'assets/'
    })
  );
```

### Without cache (original behaviour)

```javascript
metalsmith
  .use(
    assets({
      source: 'lib/assets/',
      destination: 'assets/'
    })
  )
  .use(
    optimizeImages({
      widths: [320, 640, 960, 1280, 1920],
      formats: ['avif', 'webp', 'original']
    })
  );
```

## Theory of Operation

Understanding the full lifecycle helps explain why the plugin is structured the way it is and how the cache eliminates redundant work.

### The problem

Sharp-based image processing is expensive. A typical site with 20 source images, five responsive widths, and three output formats generates 300 variant files. On a cold build this can take 30 seconds or more. On a CI host like Netlify the build starts from a clean checkout every time, so without intervention that cost is paid on every deploy even when no images changed.

### How the cache solves it

The plugin can persist generated variants into a directory inside the source tree, for example `lib/assets/images/responsive/`. Because this directory is committed to git, CI clones already contain every variant that was generated on a previous build. The plugin checks the cache before calling Sharp: if a variant file already exists it is read from disk instead. Only genuinely new or changed images trigger Sharp processing.

### Build pipeline flow

The cache changes where the plugin sits in the Metalsmith pipeline. Without the cache the plugin runs after the static-files copy because it needs images to be in the Metalsmith files object. With the cache enabled the plugin runs **before** the static-files copy:

```
Source images on disk (lib/assets/images/)
        │
        ▼
 ┌──────────────────────┐
 │  optimize-images      │  Reads source images from disk via sourcePrefix.
 │  (runs first)         │  Checks cache dir for existing variants.
 │                       │  Generates missing variants with Sharp.
 │                       │  Writes new variants to cache dir.
 │                       │  Rewrites HTML: <img> → <picture>.
 │                       │  Does NOT add variants to files object.
 └──────────────────────┘
        │
        ▼
 ┌──────────────────────┐
 │  metalsmith-static    │  Copies lib/assets/ → build/assets/.
 │  (runs second)        │  This includes the responsive/ cache dir,
 │                       │  so all variants end up in the build.
 └──────────────────────┘
        │
        ▼
   Final build output
```

### Source image discovery

When the plugin runs before the static-files copy, source images are not yet in the Metalsmith files object. The plugin derives a `sourcePrefix` from the cache path to locate them on disk. For example, if `cache` resolves to `lib/assets/images/responsive` and `outputDir` is `assets/images/responsive`, the prefix is `lib/`. An HTML reference to `assets/images/hero.jpg` maps to `lib/assets/images/hero.jpg` on disk.

### Cache invalidation

HTML images include a content hash in their filenames (e.g., `hero-640w-a1b2c3d4.webp`). When a source image changes, its hash changes, the expected filename differs from anything on disk, and the cache misses naturally. Old variants with the previous hash remain in the cache directory but are harmless — they simply stop being referenced in HTML.

Background images use deterministic filenames without hashes (e.g., `hero-960w.webp`) for easier CSS authoring. This means the cache cannot detect content changes for background images automatically. If a background source image changes content without changing its filename, delete the cache directory to force regeneration.

### What gets committed to git

The cache directory (e.g., `lib/assets/images/responsive/`) should be committed to the repository. It contains only generated variant files — binary images that are a deterministic function of the source images and plugin configuration. Committing them trades repository size for build speed. A typical site adds 50-100 MB to the repo but saves 30+ seconds on every CI build.

## Options

| Option                | Type               | Default                               | Description                                                                    |
| --------------------- | ------------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| `cache`               | `boolean\|string`  | `false`                               | Persistent cache. `true` uses `lib/<outputDir>`, string sets a custom path     |
| `widths`              | `number[]`         | `[320, 640, 960, 1280, 1920]`         | Image sizes to generate                                                        |
| `formats`             | `string[]`         | `['avif', 'webp', 'original']`        | Image formats in order of preference                                           |
| `formatOptions`       | `object`           | See below                             | Format-specific compression settings                                           |
| `htmlPattern`         | `string`           | `**/*.html`                           | Glob pattern to match HTML files                                               |
| `imgSelector`         | `string`           | `img:not([data-no-responsive])`       | CSS selector for images to process                                             |
| `outputDir`           | `string`           | `assets/images/responsive`            | Where to store the responsive images                                           |
| `outputPattern`       | `string`           | `[filename]-[width]w-[hash].[format]` | Filename pattern with tokens                                                   |
| `skipLarger`          | `boolean`          | `true`                                | Don't upscale images                                                           |
| `lazy`                | `boolean`          | `true`                                | Use native lazy loading                                                        |
| `dimensionAttributes` | `boolean`          | `true`                                | Add width/height to prevent layout shift                                       |
| `sizes`               | `string`           | `(max-width: 768px) 100vw, 75vw`      | Default sizes attribute                                                        |
| `concurrency`         | `number`           | `5`                                   | Process N images at a time                                                     |
| `generateMetadata`    | `boolean`          | `false`                               | Generate a metadata JSON file at `{outputDir}/responsive-images-manifest.json` |
| `isProgressive`       | `boolean`          | `false`                               | Enable progressive image loading                                               |
| `placeholder`         | `object`           | See below                             | Placeholder image settings                                                     |
| `processUnusedImages` | `boolean`          | `true`                                | Process unused images for background use                                       |

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

1. Scans HTML files for image tags matching the configured selector
2. Processes each image to create multiple sizes and formats using Sharp
3. Creates a content hash for each image for cache-busting filenames
4. Replaces `<img>` tags with responsive `<picture>` elements
5. Adds width/height attributes to prevent layout shifts
6. Implements native lazy loading for better performance

**Phase 2: Background Images (when `processUnusedImages: true`)**

1. Finds images that weren't processed in Phase 1
2. Generates 1x/2x variants (half size and original size) for retina displays
3. Creates all configured formats (AVIF, WebP, original)
4. Uses deterministic filenames without hashes for easier CSS authoring
5. Suitable for use with CSS `image-set()` for background images

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

### With persistent cache

```javascript
metalsmith.use(
  optimizeImages({
    cache: true
  })
);
```

This writes variants to `lib/assets/images/responsive/` (derived from `lib/` + the default `outputDir`). Commit this directory to git so CI builds skip Sharp entirely.

### Custom cache path

```javascript
metalsmith.use(
  optimizeImages({
    cache: 'lib/assets/images/responsive'
  })
);
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

## Supported File Types

The plugin automatically processes raster images and skips vector graphics:

### Processed
- **JPEG** (`.jpg`, `.jpeg`)
- **PNG** (`.png`)
- **GIF** (`.gif`)
- **WebP** (`.webp`)
- **AVIF** (`.avif`)

### Automatically Skipped
- **SVG** (`.svg`) — vector graphics that scale perfectly at any resolution
- **External URLs** (http/https)
- **Data URLs** (`data:image/...`)
- **Images with `data-no-responsive` attribute**

## Background Images

The plugin automatically processes images that aren't referenced in HTML for use as CSS background images. This feature is enabled by default (`processUnusedImages: true`).

### How Background Processing Works

After processing HTML-referenced images, the plugin:

1. Scans the Metalsmith files object and filesystem for all images
2. Excludes already-processed images (those found during HTML scanning)
3. Excludes responsive variants (generated images in the outputDir)
4. Generates 1x/2x variants using actual image dimensions:
   - **1x variant**: Half the original size for regular displays
   - **2x variant**: Original image size for retina displays (sharper on high-DPI screens)
5. Creates all formats (AVIF, WebP, original) for optimal browser support

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

Background images are generated without hashes for easier CSS authoring. HTML images still include hashes for cache-busting.

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
    widths: [320, 640, 960, 1280, 1920],
    formats: ['avif', 'webp', 'original'],
    processUnusedImages: true,
    generateMetadata: true
  })
);
```

## Progressive Loading

### Overview

Progressive loading provides a smooth user experience by:

1. Showing a low-quality placeholder instantly
2. Fading from placeholder to high-quality image
3. Only loading high-resolution images when they enter the viewport
4. Automatically serving the best supported format

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

## Test Coverage

88 tests covering all major functionality including unit tests for utilities, integration tests with real Metalsmith instances, cache persistence tests, and edge case coverage.

## License

MIT

## Development transparency

Portions of this project were developed with the assistance of AI tools including Claude and Claude Code. These tools were used to:

- Generate or refactor code
- Assist with documentation
- Troubleshoot bugs and explore alternative approaches

All AI-assisted code has been reviewed and tested to ensure it meets project standards. See the included [CLAUDE.md](CLAUDE.md) file for more details.

[npm-badge]: https://img.shields.io/npm/v/metalsmith-optimize-images.svg
[npm-url]: https://www.npmjs.com/package/metalsmith-optimize-images
[metalsmith-badge]: https://img.shields.io/badge/metalsmith-plugin-green.svg?longCache=true
[metalsmith-url]: https://metalsmith.io
[license-badge]: https://img.shields.io/github/license/wernerglinka/metalsmith-optimize-images
[license-url]: LICENSE
[coverage-badge]: https://img.shields.io/badge/test%20coverage-93%25-brightgreen
[coverage-url]: https://github.com/wernerglinka/metalsmith-optimize-images/actions/workflows/test.yml
[modules-badge]: https://img.shields.io/badge/modules-ESM%2FCJS-blue
