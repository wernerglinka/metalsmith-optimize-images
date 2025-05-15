# metalsmith-optimize-images

> **⚠️: This plugin is a fully functional proof-of-concept. However, it is not yet fully tested and may contain bugs. Use with caution.**

Metalsmith plugin for generating responsive images with optimal formats

[![metalsmith:plugin][metalsmith-badge]][metalsmith-url]
[![npm: version][npm-badge]][npm-url]
[![license: MIT][license-badge]][license-url]
[![test coverage][coverage-badge]][coverage-url]
[![ESM/CommonJS][modules-badge]][npm-url]

## Features

- **Multiple image formats**: Generates AVIF and WebP variants with JPEG/PNG fallbacks
- **Responsive sizes**: Creates different image sizes for various device widths
- **Lazy loading**: Uses native browser lazy loading for better performance
- **Content-based hashing**: Adds hash to filenames for optimal caching
- **Layout shift prevention**: Adds width/height attributes
- **Parallel processing**: Processes images in parallel for faster builds
- **Metadata generation**: Creates a JSON file with image information
- **Configurable compression**: Customize compression settings per format

## Installation

```bash
npm install metalsmith-optimize-images
```

### Requirements

- Node.js 18.0.0 or newer
- Metalsmith 2.5.0 or newer

## Usage

### ESM

```javascript
import metalsmith from 'metalsmith';
import optimizeImages from 'metalsmith-optimize-images';

metalsmith.use(
  optimizeImages({
    // configuration options
    widths: [320, 640, 960, 1280, 1920],
    formats: ['avif', 'webp', 'original']
  })
);
```

### CommonJS

```javascript
const metalsmith = require('metalsmith');
const optimizeImages = require('metalsmith-optimize-images');

metalsmith.use(
  optimizeImages({
    // configuration options
    widths: [320, 640, 960, 1280, 1920],
    formats: ['avif', 'webp', 'original']
  })
);
```

## Options

| Option                | Type       | Default                               | Description                              |
| --------------------- | ---------- | ------------------------------------- | ---------------------------------------- |
| `widths`              | `number[]` | `[320, 640, 960, 1280, 1920]`         | Image sizes to generate                  |
| `formats`             | `string[]` | `['avif', 'webp', 'original']`        | Image formats in order of preference     |
| `formatOptions`       | `object`   | See below                             | Format-specific compression settings     |
| `htmlPattern`         | `string`   | `**/*.html`                           | Glob pattern to match HTML files         |
| `imgSelector`         | `string`   | `img:not([data-no-responsive])`       | CSS selector for images to process       |
| `outputDir`           | `string`   | `assets/images/responsive`            | Where to store the responsive images     |
| `outputPattern`       | `string`   | `[filename]-[width]w-[hash].[format]` | Filename pattern with tokens             |
| `skipLarger`          | `boolean`  | `true`                                | Don't upscale images                     |
| `lazy`                | `boolean`  | `true`                                | Use native lazy loading                  |
| `dimensionAttributes` | `boolean`  | `true`                                | Add width/height to prevent layout shift |
| `sizes`               | `string`   | `(max-width: 768px) 100vw, 75vw`      | Default sizes attribute                  |
| `concurrency`         | `number`   | `5`                                   | Process N images at a time               |
| `generateMetadata`    | `boolean`  | `false`                               | Generate a metadata JSON file            |

### Default Format Options

```javascript
{
  avif: { quality: 65, speed: 5 },
  webp: { quality: 80, lossless: false },
  jpeg: { quality: 85, progressive: true },
  png: { compressionLevel: 8, palette: true }
}
```

## How It Works

The plugin:

1. Scans HTML files for image tags
2. Processes each image to create multiple sizes and formats
3. Creates a content hash for each image for efficient caching
4. Replaces `<img>` tags with responsive `<picture>` elements
5. Adds width/height attributes to prevent layout shifts
6. Implements native lazy loading for better performance

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

    // Don't add lazy loading
    lazy: false
  })
);
```

### Excluding specific images

Add the `data-no-responsive` attribute to any image you don't want processed:

```html
<img src="image.jpg" data-no-responsive alt="This image won't be processed" />
```

## Debug

For debugging, use Metalsmith's debug mode:

```javascript
// Enable debug output by setting the DEBUG environment variable
// DEBUG=metalsmith-responsive-images node build.js

const metalsmith = Metalsmith(__dirname).use(optimizeImages());
// other plugins...
```

You can also use the [metalsmith-debug](https://github.com/metalsmith/metalsmith-debug) plugin:

```javascript
const debug = require('metalsmith-debug');

const metalsmith = Metalsmith(__dirname)
  .use(debug()) // Add the metalsmith-debug plugin
  .use(optimizeImages());
// other plugins...
```

Or with the CLI:

```json
{
  "plugins": {
    "metalsmith-debug": true,
    "metalsmith-optimize-images": {
      "widths": [320, 640, 960, 1280, 1920]
    }
  }
}
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
