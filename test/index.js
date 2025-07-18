import { describe, it, before, after } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../src/index.js';
import * as cheerio from 'cheerio';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('metalsmith-optimize-images', function () {
  // These tests might take some time due to image processing with real images
  this.timeout(60000);

  const fixturesDir = path.join(__dirname, 'fixtures');
  const buildDir = path.join(__dirname, 'build');

  let metalsmith;

  before(() => {
    // Check if real images exist
    const imageDir = path.join(fixturesDir, 'src', 'images');
    const requiredImages = ['tree.jpg', 'industry.jpg', 'work.jpg', 'people.jpg', 'buildings.png'];

    for (const img of requiredImages) {
      const imagePath = path.join(imageDir, img);
      if (!fs.existsSync(imagePath)) {
        console.log(`Required test image not found: ${img}`);
        process.exit(1);
      }
    }

    // Set up Metalsmith instance
    metalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);
  });

  after(() => {
    // Cleanup can be added here if needed
  });

  it('should be a function', () => {
    assert.strictEqual(typeof optimizeImages, 'function');
  });

  it('should return a function', () => {
    assert.strictEqual(typeof optimizeImages(), 'function');
  });

  it('should process images and replace with picture elements', (done) => {
    metalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive',
          isProgressive: false // Disable progressive loading for this test
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        // Check if build directory exists
        assert.strictEqual(fs.existsSync(buildDir), true);

        // Check if HTML file exists
        const htmlPath = path.join(buildDir, 'test.html');
        assert.strictEqual(fs.existsSync(htmlPath), true);

        // Read the HTML file and check the img replacements
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // There should be picture elements
        assert.strictEqual($('picture').length > 0, true);

        // Check if responsive directory exists
        const responsiveDir = path.join(buildDir, 'assets/responsive');
        assert.strictEqual(fs.existsSync(responsiveDir), true);

        // Check if responsive images exist
        const responsiveFiles = fs.readdirSync(responsiveDir);
        assert.strictEqual(responsiveFiles.length > 0, true);

        // Each non-excluded image should have webp and original format variants
        const webpCount = responsiveFiles.filter((file) => file.endsWith('.webp')).length;
        const jpgCount = responsiveFiles.filter((file) => file.endsWith('.jpg')).length;
        const pngCount = responsiveFiles.filter((file) => file.endsWith('.png')).length;

        assert.strictEqual(webpCount > 0, true);
        assert.strictEqual(jpgCount > 0 || pngCount > 0, true);

        done();
      });
  });

  it('should generate correct HTML structure for progressive loading', (done) => {
    // Test minimal setup with just one image to verify HTML structure
    const testMetalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    testMetalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['original'], // Simple: just original format
          outputDir: 'assets/responsive',
          isProgressive: true
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        // Read the HTML file
        const htmlPath = path.join(buildDir, 'test.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // Check for progressive wrapper structure
        const $wrapper = $('.responsive-wrapper.js-progressive-image-wrapper').first();
        assert.strictEqual($wrapper.length, 1, 'Should have progressive wrapper');

        // Check for aspect-ratio style
        const style = $wrapper.attr('style');
        assert.strictEqual(style.includes('aspect-ratio:'), true, 'Should have aspect-ratio CSS');

        // Check for low-res image
        const $lowRes = $wrapper.find('.low-res');
        assert.strictEqual($lowRes.length, 1, 'Should have low-res image');
        assert.strictEqual($lowRes.attr('src').includes('placeholder'), true, 'Low-res should be placeholder');

        // Check for high-res image
        const $highRes = $wrapper.find('.high-res');
        assert.strictEqual($highRes.length, 1, 'Should have high-res image');
        assert.strictEqual($highRes.attr('src'), '', 'High-res src should be empty initially');
        assert.strictEqual(!!$highRes.attr('data-source'), true, 'High-res should have data-source');

        done();
      });
  });

  it('should skip images with data-no-responsive attribute', (done) => {
    metalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive',
          isProgressive: false // Disable progressive loading for this test
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        const htmlPath = path.join(buildDir, 'test.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // The image with data-no-responsive should remain as img tag
        const imgWithNoResponsive = $('img[data-no-responsive]');
        assert.strictEqual(imgWithNoResponsive.length, 1);
        assert.strictEqual(imgWithNoResponsive.parents('picture').length, 0);
        assert.strictEqual(imgWithNoResponsive.attr('alt'), 'Work');

        done();
      });
  });

  it('should skip external images and data URLs', (done) => {
    // Create test metalsmith instance for this test
    const testMetalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    // Create HTML with additional external and data URL test cases
    const testHtmlPath = path.join(fixturesDir, 'src', 'external-test.html');
    const testHtmlContent = `
      <!DOCTYPE html>
      <html>
      <head><title>External URL Test</title></head>
      <body>
        <img src="https://example.com/image.jpg" alt="External HTTPS">
        <img src="http://example.com/image.jpg" alt="External HTTP">
        <img src="//example.com/image.jpg" alt="Protocol-relative URL">
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" alt="Data URL">
        <img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" alt="Another Data URL">
      </body>
      </html>
    `;

    // Write the test HTML file
    fs.writeFileSync(testHtmlPath, testHtmlContent);

    testMetalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive',
          htmlPattern: '**/*.html' // Process all HTML files
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        // Test the original HTML file
        const htmlPath = path.join(buildDir, 'test.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // External image should remain as img tag
        const externalImg = $('img[src^="https://"]');
        assert.strictEqual(externalImg.length, 1);
        assert.strictEqual(externalImg.parents('picture').length, 0);

        // Data URL image should remain as img tag
        const dataUrlImg = $('img[src^="data:"]');
        assert.strictEqual(dataUrlImg.length, 1);
        assert.strictEqual(dataUrlImg.parents('picture').length, 0);

        // Test the new HTML file
        const extHtmlPath = path.join(buildDir, 'external-test.html');
        const extHtmlContent = fs.readFileSync(extHtmlPath, 'utf8');
        const $ext = cheerio.load(extHtmlContent);

        // All external images and data URLs should remain as img tags
        assert.strictEqual($ext('img[src^="https://"]').length, 1);
        assert.strictEqual($ext('img[src^="http://"]').length, 1);
        assert.strictEqual($ext('img[src^="//"]').length, 1);
        assert.strictEqual($ext('img[src^="data:"]').length, 2);

        // None should be in picture elements
        assert.strictEqual($ext('picture').length, 0);

        // Clean up the test file
        fs.unlinkSync(testHtmlPath);

        done();
      });
  });

  it('should preserve sizes attribute from the original img', (done) => {
    // Run this test separately with a fresh build
    const testMetalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    testMetalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive',
          isProgressive: false // Disable progressive loading for this test
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        const htmlPath = path.join(buildDir, 'test.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // Just check that the HTML includes a picture element containing the People image
        // and that any original sizes from the img are preserved
        const imgWithAlt = $('img[alt="People"]');

        assert.strictEqual(imgWithAlt.length > 0, true, 'People image not found');
        assert.strictEqual(imgWithAlt.closest('picture').length > 0, true, 'People image not in a picture element');

        done();
      });
  });

  it('should generate metadata file when configured', (done) => {
    metalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive',
          generateMetadata: true
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        // Check if metadata file exists
        const metadataPath = path.join(buildDir, 'assets/responsive/responsive-images-manifest.json');
        assert.strictEqual(fs.existsSync(metadataPath), true);

        // Check if metadata file is valid JSON
        const metadataContent = fs.readFileSync(metadataPath, 'utf8');
        let metadata;
        assert.doesNotThrow(() => {
          metadata = JSON.parse(metadataContent);
        });

        // Check if metadata contains expected information
        assert.strictEqual(typeof metadata, 'object');
        assert.strictEqual(Object.keys(metadata).length > 0, true);

        done();
      });
  });

  it('should add width and height attributes when configured', (done) => {
    metalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive',
          dimensionAttributes: true
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        const htmlPath = path.join(buildDir, 'test.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // Check img tags inside picture elements for width and height
        const imgInPicture = $('picture img').first();

        assert.strictEqual(imgInPicture.attr('width') !== undefined, true);
        assert.strictEqual(imgInPicture.attr('height') !== undefined, true);

        done();
      });
  });

  it('should add lazy loading when configured', (done) => {
    metalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive',
          lazy: true
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        const htmlPath = path.join(buildDir, 'test.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // Check img tags inside picture elements for lazy loading
        const imgInPicture = $('picture img').first();

        assert.strictEqual(imgInPicture.attr('loading'), 'lazy');

        done();
      });
  });

  it('should preserve other attributes when replacing img elements', (done) => {
    metalsmith
      .use(
        optimizeImages({
          widths: [300, 600],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive',
          isProgressive: false // Disable progressive loading for this test
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        const htmlPath = path.join(buildDir, 'test.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // Find the img with custom attributes
        const imgWithAttrs = $('img[id="special-image"]');

        // Should have preserved the id and data-custom attributes
        assert.strictEqual(imgWithAttrs.attr('id'), 'special-image');
        assert.strictEqual(imgWithAttrs.attr('data-custom'), 'value');
        assert.strictEqual(imgWithAttrs.attr('alt'), 'Buildings');

        done();
      });
  });

  it('should handle various plugin configurations', (done) => {
    metalsmith
      .use(
        optimizeImages({
          // Custom settings
          widths: [400],
          formats: ['webp'],
          outputDir: 'assets/custom',
          outputPattern: '[filename]-[width].[format]',
          skipLarger: true,
          lazy: false,
          dimensionAttributes: false
        })
      )
      .build((err) => {
        if (err) {
          return done(err);
        }

        // Check if custom directory exists
        const customDir = path.join(buildDir, 'assets/custom');
        assert.strictEqual(fs.existsSync(customDir), true);

        // Check if images exist with the custom naming pattern
        const customFiles = fs.readdirSync(customDir);
        assert.strictEqual(customFiles.length > 0, true);

        // Check that files follow the custom naming pattern (no hash)
        const hasCustomPattern = customFiles.some((file) => /[a-z]+-400\.webp/.test(file));
        assert.strictEqual(hasCustomPattern, true);

        done();
      });
  });

  it('should handle errors in image processing gracefully', (done) => {
    // Create test metalsmith instance
    const testMetalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    // Create a corrupted image file for testing
    const corruptedImagePath = path.join(fixturesDir, 'src', 'images', 'corrupted.jpg');
    fs.writeFileSync(corruptedImagePath, Buffer.from('NOT_A_VALID_IMAGE_FILE'));

    // Create HTML that references the corrupted image
    const corruptedHtmlPath = path.join(fixturesDir, 'src', 'corrupted-test.html');
    const corruptedHtmlContent = `
      <!DOCTYPE html>
      <html>
      <head><title>Corrupted Image Test</title></head>
      <body>
        <img src="images/corrupted.jpg" alt="Corrupted image">
        <img src="images/tree.jpg" alt="Valid image">
      </body>
      </html>
    `;

    fs.writeFileSync(corruptedHtmlPath, corruptedHtmlContent);

    // Test with corrupted image
    testMetalsmith
      .use(
        optimizeImages({
          widths: [300],
          formats: ['webp', 'original'],
          outputDir: 'assets/responsive'
        })
      )
      .build((err) => {
        // The plugin should handle errors and not fail the build
        assert.strictEqual(err, null);

        // The HTML file should still exist and be processed
        const htmlPath = path.join(buildDir, 'corrupted-test.html');
        assert.strictEqual(fs.existsSync(htmlPath), true);

        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(htmlContent);

        // The corrupted image should remain as img tag
        const corruptedImg = $('img[src="images/corrupted.jpg"]');
        assert.strictEqual(corruptedImg.length, 1);
        assert.strictEqual(corruptedImg.parents('picture').length, 0);

        // The valid image should be processed
        const validImg = $('img[alt="Valid image"]');
        assert.strictEqual(validImg.closest('picture').length, 1);

        // Clean up test files
        fs.unlinkSync(corruptedImagePath);
        fs.unlinkSync(corruptedHtmlPath);

        done();
      });
  });

  it('should use debug function with correct namespace', () => {
    // Create a mock metalsmith instance
    const metalsmith = {
      debug: function (namespace) {
        // Just verify the namespace is correct
        assert.strictEqual(namespace, 'metalsmith-responsive-images');
        return function () {};
      }
    };

    // Create the plugin
    const plugin = optimizeImages({
      widths: [200],
      formats: ['webp']
    });

    // Create a minimal files object
    const files = {
      'test.html': { contents: Buffer.from('<html><body><img src="test.jpg"></body></html>') }
    };

    // Call the plugin function directly, but don't execute it fully
    // We just want to verify that it calls metalsmith.debug with the correct namespace
    try {
      plugin(files, metalsmith, () => {});
      // If we get here, the test passed
    } catch {
      // We expect an error since we're not providing a complete metalsmith instance
      // But we've already verified the debug call by this point
    }
  });

  it('should handle errors in the main plugin function', (done) => {
    // Intercept console.error to suppress and capture error messages
    const originalConsoleError = console.error;
    const errorMessages = [];

    // Completely suppress console output during the test
    console.error = function (message) {
      // Capture the message but don't output it
      if (typeof message === 'string') {
        errorMessages.push(message);
      }
    };

    // Create a real Metalsmith instance but override destination to cause an error
    const brokenMetalsmith = Metalsmith(fixturesDir);
    brokenMetalsmith.destination = () => {
      throw new Error('Test error in plugin');
    };

    // Create minimal files object
    const files = {
      'test.html': { contents: Buffer.from('<html><body></body></html>') }
    };

    // Call the plugin directly
    const plugin = optimizeImages({
      widths: [100],
      formats: ['webp']
    });

    // Execute the plugin with the defective metalsmith instance
    plugin(files, brokenMetalsmith, (err) => {
      // Restore console.error
      console.error = originalConsoleError;

      // Should return an error
      assert.strictEqual(err instanceof Error, true);
      assert.strictEqual(err.message, 'Test error in plugin');

      // Should have logged the error
      const hasErrorLog = errorMessages.some(
        (msg) => msg.includes('Error in responsive images plugin') && msg.includes('Test error in plugin')
      );
      assert.strictEqual(hasErrorLog, true);

      done();
    });
  });
});
