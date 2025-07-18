import { describe, it, after } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../../src/index.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Background Image Processing', function () {
  this.timeout(30000);

  const fixturesDir = path.join(__dirname, '../fixtures');
  const buildDir = path.join(__dirname, '../build-background');

  after(() => {
    // Cleanup
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });

  it('should process unused images for background use', (done) => {
    const metalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    // Add an image that's NOT referenced in HTML
    metalsmith.use((files, metalsmith, done) => {
      // Create an HTML file that doesn't reference our test image
      files['test.html'] = {
        contents: Buffer.from('<h1>Hello World</h1><p>No images here</p>')
      };

      // The tree.jpg image exists in fixtures but won't be referenced in HTML
      // So it should be processed as a background image
      done();
    });

    metalsmith.use(
      optimizeImages({
        widths: [320, 640, 960], // These are for HTML images
        formats: ['webp', 'original'],
        processUnusedImages: true,
        imagePattern: '**/*.{jpg,jpeg,png,gif,webp,avif}',
        isProgressive: false
      })
    );

    metalsmith.build((err, files) => {
      if (err) {
        return done(err);
      }

      // Should have processed the unused tree.jpg image
      const backgroundVariants = Object.keys(files).filter(
        (file) => file.includes('tree-') && file.includes('assets/images/responsive/')
      );

      // Should have created background variants (1x and 2x for each format)
      assert.strictEqual(backgroundVariants.length > 0, true, 'Should have created background variants');

      // Check that we have both formats
      const webpVariants = backgroundVariants.filter((file) => file.includes('.webp'));
      const originalVariants = backgroundVariants.filter((file) => file.includes('.jpg'));

      assert.strictEqual(webpVariants.length > 0, true, 'Should have WebP variants');
      assert.strictEqual(originalVariants.length > 0, true, 'Should have original format variants');

      // Should have 1x and 2x variants (original size and half size)
      // The exact number depends on the image dimensions, but should be at least 2 per format
      assert.strictEqual(backgroundVariants.length >= 2, true, 'Should have at least 2 background variants');

      done();
    });
  });

  it('should skip background processing when disabled', (done) => {
    const metalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    // Create an HTML file that doesn't reference the tree.jpg image
    metalsmith.use((files, metalsmith, done) => {
      // Clear existing files first
      Object.keys(files).forEach((key) => {
        if (key.endsWith('.html')) {
          delete files[key];
        }
      });

      files['test-disabled.html'] = {
        contents: Buffer.from('<h1>Hello World</h1>')
      };
      done();
    });

    metalsmith.use(
      optimizeImages({
        widths: [320],
        formats: ['original'],
        processUnusedImages: false, // Disabled
        isProgressive: false,
        htmlPattern: '**/*.html'
      })
    );

    metalsmith.build((err, files) => {
      if (err) {
        return done(err);
      }

      // Should NOT have processed any background images
      const backgroundVariants = Object.keys(files).filter((file) => file.includes('assets/images/responsive/'));

      assert.strictEqual(backgroundVariants.length, 0, 'Should not have created background variants when disabled');

      done();
    });
  });

  it('should not reprocess images already used in HTML', (done) => {
    const metalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    // Add an HTML file that DOES reference our test image
    metalsmith.use((files, metalsmith, done) => {
      files['test.html'] = {
        contents: Buffer.from('<img src="images/tree.jpg" alt="Tree">')
      };
      done();
    });

    metalsmith.use(
      optimizeImages({
        widths: [320, 640],
        formats: ['webp', 'original'],
        processUnusedImages: true,
        isProgressive: false
      })
    );

    metalsmith.build((err, files) => {
      if (err) {
        return done(err);
      }

      // Should have processed the image for HTML use (with standard widths)
      const htmlVariants = Object.keys(files).filter(
        (file) => file.includes('tree-') && file.includes('assets/images/responsive/')
      );

      assert.strictEqual(htmlVariants.length > 0, true, 'Should have created HTML variants');

      // Should have variants for both configured widths (320, 640) and both formats
      // That's 4 variants total (320w webp, 320w jpg, 640w webp, 640w jpg)
      assert.strictEqual(htmlVariants.length >= 4, true, 'Should have HTML variants for configured widths');

      done();
    });
  });

  it('should handle background image processing errors gracefully', (done) => {
    const metalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    // Add an invalid image that will cause processing errors
    metalsmith.use((files, metalsmith, done) => {
      files['test.html'] = {
        contents: Buffer.from('<h1>Hello World</h1>')
      };

      // Add invalid image data
      files['images/invalid.jpg'] = {
        contents: Buffer.from('not an image'),
        mtime: Date.now()
      };

      done();
    });

    metalsmith.use(
      optimizeImages({
        widths: [320, 640],
        formats: ['webp', 'original'],
        processUnusedImages: true,
        isProgressive: false
      })
    );

    metalsmith.build((err) => {
      // Should complete without throwing errors
      assert.strictEqual(err, null, 'Should handle background processing errors gracefully');
      done();
    });
  });
});
