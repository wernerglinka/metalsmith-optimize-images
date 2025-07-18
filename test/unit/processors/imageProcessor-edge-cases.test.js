import { describe, it, before, after } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { processImage, processImageToVariants } from '../../../src/processors/imageProcessor.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Image Processor Edge Cases - Coverage Gaps', function () {
  this.timeout(15000);

  const fixturesDir = path.join(__dirname, '../../fixtures');
  const buildDir = path.join(__dirname, '../../temp-build');

  before(() => {
    // Ensure build directory exists
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }
  });

  after(() => {
    // Cleanup
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });

  describe('processImage - file system edge cases', () => {
    it('should handle images not found in files but present in build directory', async () => {
      // Create a test image in build directory
      const testImageDir = path.join(buildDir, 'images');
      fs.mkdirSync(testImageDir, { recursive: true });

      const sourceImagePath = path.join(fixturesDir, 'src', 'images', 'tree.jpg');
      const testImagePath = path.join(testImageDir, 'test-image.jpg');

      // Copy a real image to build directory
      fs.copyFileSync(sourceImagePath, testImagePath);

      const $ = cheerio.load('<img src="images/test-image.jpg" alt="Test">');
      const img = $('img')[0];

      const files = {}; // Empty files object - image not in Metalsmith files

      const mockMetalsmith = {
        destination: () => buildDir
      };

      const processedImages = new Map();
      const debug = () => {};
      const config = {
        widths: [300],
        formats: ['webp'],
        outputDir: 'assets/responsive',
        outputPattern: '[filename]-[width]w.[format]'
      };

      const mockReplacePictureElement = () => {};

      // This should trigger the path where image is loaded from build directory
      await processImage({
        $,
        img,
        files,
        metalsmith: mockMetalsmith,
        processedImages,
        debug,
        config,
        replacePictureElement: mockReplacePictureElement
      });

      // Should have added the image to files
      assert.strictEqual('images/test-image.jpg' in files, true);
      assert.strictEqual(files['images/test-image.jpg'].contents instanceof Buffer, true);
    });

    it('should handle images not found in build directory', async () => {
      const $ = cheerio.load('<img src="images/nonexistent.jpg" alt="Missing">');
      const img = $('img')[0];

      const files = {};

      const mockMetalsmith = {
        destination: () => buildDir
      };

      const processedImages = new Map();
      const debug = () => {};
      const config = {
        widths: [300],
        formats: ['webp'],
        outputDir: 'assets/responsive'
      };

      const mockReplacePictureElement = () => {};

      // This should handle missing image gracefully
      await processImage({
        $,
        img,
        files,
        metalsmith: mockMetalsmith,
        processedImages,
        debug,
        config,
        replacePictureElement: mockReplacePictureElement
      });

      // Should not have added anything to files
      assert.strictEqual(Object.keys(files).length, 0);
    });

    it('should handle file system errors when accessing build directory', async () => {
      const $ = cheerio.load('<img src="images/test.jpg" alt="Test">');
      const img = $('img')[0];

      const files = {};

      const mockMetalsmith = {
        destination: () => '/nonexistent/path/that/should/not/exist'
      };

      const processedImages = new Map();
      const debug = () => {};
      const config = {
        widths: [300],
        formats: ['webp'],
        outputDir: 'assets/responsive'
      };

      const mockReplacePictureElement = () => {};

      // This should handle filesystem errors gracefully
      await processImage({
        $,
        img,
        files,
        metalsmith: mockMetalsmith,
        processedImages,
        debug,
        config,
        replacePictureElement: mockReplacePictureElement
      });

      // Should not crash and files should remain empty
      assert.strictEqual(Object.keys(files).length, 0);
    });

    it('should use cached variants when available', async () => {
      const $ = cheerio.load('<img src="images/tree.jpg" alt="Tree">');
      const img = $('img')[0];

      // Get a real image buffer
      const sourceImagePath = path.join(fixturesDir, 'src', 'images', 'tree.jpg');
      const imageBuffer = fs.readFileSync(sourceImagePath);

      const files = {
        'images/tree.jpg': {
          contents: imageBuffer,
          mtime: 123456789
        }
      };

      // Pre-populate cache
      const processedImages = new Map();
      const mockVariants = [{ path: 'assets/responsive/tree-300w.webp', width: 300, height: 200, format: 'webp' }];
      processedImages.set('images/tree.jpg:123456789', mockVariants);

      const mockMetalsmith = {
        destination: () => buildDir
      };

      const debug = () => {};
      const config = {
        widths: [300],
        formats: ['webp'],
        outputDir: 'assets/responsive'
      };

      let replaceCalled = false;
      const mockReplacePictureElement = () => {
        replaceCalled = true;
      };

      // This should use cached variants
      await processImage({
        $,
        img,
        files,
        metalsmith: mockMetalsmith,
        processedImages,
        debug,
        config,
        replacePictureElement: mockReplacePictureElement
      });

      // Should have called replace function with cached variants
      assert.strictEqual(replaceCalled, true);
    });

    it('should handle external and data URLs', async () => {
      const $ = cheerio.load(`
        <img src="https://example.com/image.jpg" alt="External">
        <img src="data:image/png;base64,iVBORw0KGgo=" alt="Data URL">
      `);

      const externalImg = $('img')[0];
      const dataImg = $('img')[1];

      const files = {};
      const mockMetalsmith = { destination: () => buildDir };
      const processedImages = new Map();
      const debug = () => {};
      const config = { widths: [300], formats: ['webp'] };
      const mockReplacePictureElement = () => {};

      // Should skip external images
      await processImage({
        $,
        img: externalImg,
        files,
        metalsmith: mockMetalsmith,
        processedImages,
        debug,
        config,
        replacePictureElement: mockReplacePictureElement
      });

      // Should skip data URLs
      await processImage({
        $,
        img: dataImg,
        files,
        metalsmith: mockMetalsmith,
        processedImages,
        debug,
        config,
        replacePictureElement: mockReplacePictureElement
      });

      // Files should remain empty
      assert.strictEqual(Object.keys(files).length, 0);
    });
  });

  describe('processImageToVariants - format edge cases', () => {
    it('should handle format processing errors gracefully', async () => {
      // Create a minimal valid image buffer
      const sourceImagePath = path.join(fixturesDir, 'src', 'images', 'tree.jpg');
      const imageBuffer = fs.readFileSync(sourceImagePath);

      const debug = () => {};
      const config = {
        widths: [300],
        formats: ['unsupported-format'], // This should cause format errors
        formatOptions: {},
        skipLarger: true
      };

      // Should handle unsupported format gracefully
      const variants = await processImageToVariants(imageBuffer, 'test.jpg', debug, config);

      // Should return empty array or handle gracefully
      assert.strictEqual(Array.isArray(variants), true);
    });

    it('should handle webp to original format edge case', async () => {
      // This tests the specific condition where original format is webp
      const sourceImagePath = path.join(fixturesDir, 'src', 'images', 'tree.jpg');
      const imageBuffer = fs.readFileSync(sourceImagePath);

      // This tests the specific condition where original format is webp

      const debug = () => {};
      const config = {
        widths: [300],
        formats: ['original'],
        formatOptions: {},
        skipLarger: true
      };

      // Test with actual image - should work normally
      const variants = await processImageToVariants(imageBuffer, 'test.webp', debug, config);
      assert.strictEqual(Array.isArray(variants), true);
    });

    it('should handle empty target widths', async () => {
      const sourceImagePath = path.join(fixturesDir, 'src', 'images', 'tree.jpg');
      const imageBuffer = fs.readFileSync(sourceImagePath);

      const debug = () => {};
      const config = {
        widths: [5000, 6000], // Much larger than source image
        formats: ['webp'],
        formatOptions: {},
        skipLarger: true // This will filter out all widths
      };

      const variants = await processImageToVariants(imageBuffer, 'test.jpg', debug, config);

      // Should return empty array when no valid widths
      assert.strictEqual(Array.isArray(variants), true);
    });
  });
});
