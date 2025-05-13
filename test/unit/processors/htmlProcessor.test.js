import { describe, it, beforeEach } from 'mocha';
import assert from 'node:assert';
import * as cheerio from 'cheerio';
import { replacePictureElement, generateMetadata } from '../../../src/processors/htmlProcessor.js';

describe('HTML processing utilities', () => {
  describe('replacePictureElement', () => {
    let $, $img, config;

    beforeEach(() => {
      // Create a fresh cheerio environment for each test
      $ = cheerio.load('<img src="test-image.jpg" alt="Test Image">');
      $img = $('img');

      // Basic config for testing
      config = {
        sizes: '(max-width: 768px) 100vw, 75vw',
        lazy: true,
        dimensionAttributes: true,
        formats: ['avif', 'webp', 'original']
      };
    });

    it('should create a picture element with appropriate sources', () => {
      // Create some sample variants
      const variants = [
        {
          format: 'webp',
          width: 300,
          height: 200,
          path: 'assets/responsive/test-300.webp'
        },
        {
          format: 'webp',
          width: 600,
          height: 400,
          path: 'assets/responsive/test-600.webp'
        },
        {
          format: 'jpeg',
          width: 300,
          height: 200,
          path: 'assets/responsive/test-300.jpg',
          originalFormat: 'jpeg'
        },
        {
          format: 'jpeg',
          width: 600,
          height: 400,
          path: 'assets/responsive/test-600.jpg',
          originalFormat: 'jpeg'
        }
      ];

      // Replace the img with a picture element
      replacePictureElement($, $img, variants, config);

      // Check that a picture element was created
      const $picture = $('picture');
      assert.strictEqual($picture.length, 1);

      // Check sources
      const $sources = $picture.find('source');
      assert.strictEqual($sources.length, 2); // One for webp, one for jpeg

      // Check webp source
      const $webpSource = $sources.filter('[type="image/webp"]');
      assert.strictEqual($webpSource.length, 1);
      assert.strictEqual($webpSource.attr('sizes'), config.sizes);
      assert.ok($webpSource.attr('srcset').includes('/assets/responsive/test-300.webp 300w'));
      assert.ok($webpSource.attr('srcset').includes('/assets/responsive/test-600.webp 600w'));

      // Check jpeg source
      const $jpegSource = $sources.filter('[type="image/jpeg"]');
      assert.strictEqual($jpegSource.length, 1);
      assert.strictEqual($jpegSource.attr('sizes'), config.sizes);
      assert.ok($jpegSource.attr('srcset').includes('/assets/responsive/test-300.jpg 300w'));
      assert.ok($jpegSource.attr('srcset').includes('/assets/responsive/test-600.jpg 600w'));

      // Check img element
      const $newImg = $picture.find('img');
      assert.strictEqual($newImg.length, 1);
      assert.strictEqual($newImg.attr('src'), 'test-image.jpg');
      assert.strictEqual($newImg.attr('alt'), 'Test Image');
      assert.strictEqual($newImg.attr('loading'), 'lazy');
      assert.strictEqual($newImg.attr('width'), '600');
      assert.strictEqual($newImg.attr('height'), '400');
    });

    it('should handle empty variants array', () => {
      // This should not throw and should not modify the img
      replacePictureElement($, $img, [], config);

      // The img should still be there and not wrapped in a picture
      assert.strictEqual($('img').length, 1);
      assert.strictEqual($('picture').length, 0);
    });

    it('should preserve custom attributes from the original img', () => {
      // Add some custom attributes to the img
      $img.attr('id', 'special-img');
      $img.attr('class', 'responsive-img highlighted');
      $img.attr('data-custom', 'value');

      const variants = [
        {
          format: 'webp',
          width: 300,
          height: 200,
          path: 'assets/responsive/test-300.webp'
        },
        {
          format: 'jpeg',
          width: 300,
          height: 200,
          path: 'assets/responsive/test-300.jpg',
          originalFormat: 'jpeg'
        }
      ];

      replacePictureElement($, $img, variants, config);

      // Check that attributes were preserved
      const $newImg = $('picture img');
      assert.strictEqual($newImg.attr('id'), 'special-img');
      assert.strictEqual($newImg.attr('class'), 'responsive-img highlighted');
      assert.strictEqual($newImg.attr('data-custom'), 'value');
    });

    it('should respect configuration options', () => {
      // Test with different config values
      config.lazy = false;
      config.dimensionAttributes = false;
      config.sizes = '(max-width: 500px) 100vw, 50vw';

      const variants = [
        {
          format: 'webp',
          width: 300,
          height: 200,
          path: 'assets/responsive/test-300.webp'
        },
        {
          format: 'jpeg',
          width: 300,
          height: 200,
          path: 'assets/responsive/test-300.jpg',
          originalFormat: 'jpeg'
        }
      ];

      replacePictureElement($, $img, variants, config);

      // Check that config changes were respected
      const $newImg = $('picture img');
      const $source = $('picture source').first();

      // No lazy loading
      assert.strictEqual($newImg.attr('loading'), undefined);

      // No width/height
      assert.strictEqual($newImg.attr('width'), undefined);
      assert.strictEqual($newImg.attr('height'), undefined);

      // Custom sizes
      assert.strictEqual($source.attr('sizes'), '(max-width: 500px) 100vw, 50vw');
    });

    it('should use custom sizes attribute from img if present', () => {
      // Add a custom sizes attribute to the img
      $img.attr('sizes', '(max-width: 600px) 90vw, 60vw');

      const variants = [
        {
          format: 'webp',
          width: 300,
          height: 200,
          path: 'assets/responsive/test-300.webp'
        }
      ];

      replacePictureElement($, $img, variants, config);

      // Check that the source uses the img's sizes attribute, not the config
      const $source = $('picture source');
      assert.strictEqual($source.attr('sizes'), '(max-width: 600px) 90vw, 60vw');
    });
  });

  describe('generateMetadata', () => {
    it('should generate correct metadata JSON', () => {
      // Sample processed images map
      const processedImages = new Map();

      // Add some sample data
      processedImages.set('image1.jpg:12345', [
        {
          path: 'assets/responsive/image1-300.webp',
          width: 300,
          height: 200,
          format: 'webp',
          size: 10240
        },
        {
          path: 'assets/responsive/image1-300.jpg',
          width: 300,
          height: 200,
          format: 'jpeg',
          size: 15360
        }
      ]);

      processedImages.set('image2.png:67890', [
        {
          path: 'assets/responsive/image2-400.webp',
          width: 400,
          height: 300,
          format: 'webp',
          size: 20480
        }
      ]);

      // Files object to be modified
      const files = {};

      // Config
      const config = {
        outputDir: 'assets/responsive'
      };

      // Generate metadata
      generateMetadata(processedImages, files, config);

      // Check that metadata file was created
      const metadataPath = 'assets/responsive/responsive-images-manifest.json';
      assert.ok(files[metadataPath]);

      // Parse the metadata JSON
      const metadata = JSON.parse(files[metadataPath].contents.toString());

      // Check structure
      assert.strictEqual(Object.keys(metadata).length, 2);
      assert.ok(metadata['image1.jpg']);
      assert.ok(metadata['image2.png']);

      // Check content
      assert.strictEqual(metadata['image1.jpg'].length, 2);
      assert.strictEqual(metadata['image2.png'].length, 1);

      // Check specific values
      assert.strictEqual(metadata['image1.jpg'][0].path, 'assets/responsive/image1-300.webp');
      assert.strictEqual(metadata['image1.jpg'][0].width, 300);
      assert.strictEqual(metadata['image1.jpg'][0].height, 200);
      assert.strictEqual(metadata['image1.jpg'][0].format, 'webp');
      assert.strictEqual(metadata['image1.jpg'][0].size, 10240);

      assert.strictEqual(metadata['image2.png'][0].path, 'assets/responsive/image2-400.webp');
    });

    it('should handle empty processedImages map', () => {
      const processedImages = new Map();
      const files = {};
      const config = {
        outputDir: 'assets/responsive'
      };

      generateMetadata(processedImages, files, config);

      // Metadata file should still be created with empty object
      const metadataPath = 'assets/responsive/responsive-images-manifest.json';
      assert.ok(files[metadataPath]);

      const metadata = JSON.parse(files[metadataPath].contents.toString());
      assert.deepStrictEqual(metadata, {});
    });
  });
});
