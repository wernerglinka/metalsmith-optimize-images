import { describe, it } from 'mocha';
import assert from 'node:assert';
import { buildConfig } from '../../../src/utils/config.js';

describe('Config utilities', () => {
  describe('buildConfig', () => {
    it('should provide default values when no options are provided', () => {
      const config = buildConfig();

      // Check some key default values
      assert.deepStrictEqual(config.widths, [320, 640, 960, 1280, 1920]);
      assert.deepStrictEqual(config.formats, ['avif', 'webp', 'original']);
      assert.strictEqual(config.htmlPattern, '**/*.html');
      assert.strictEqual(config.imgSelector, 'img:not([data-no-responsive])');
      assert.strictEqual(config.outputDir, 'assets/images/responsive');
      assert.strictEqual(config.skipLarger, true);
      assert.strictEqual(config.lazy, true);
      assert.strictEqual(config.dimensionAttributes, true);
      assert.strictEqual(config.sizes, '(max-width: 768px) 100vw, 75vw');
      assert.strictEqual(config.concurrency, 5);
      assert.strictEqual(config.generateMetadata, false);
    });

    it('should override default values with provided options', () => {
      const options = {
        widths: [400, 800],
        formats: ['webp', 'original'],
        outputDir: 'custom/path',
        lazy: false,
        concurrency: 3
      };

      const config = buildConfig(options);

      // Check that provided values override defaults
      assert.deepStrictEqual(config.widths, [400, 800]);
      assert.deepStrictEqual(config.formats, ['webp', 'original']);
      assert.strictEqual(config.outputDir, 'custom/path');
      assert.strictEqual(config.lazy, false);
      assert.strictEqual(config.concurrency, 3);

      // Check that unprovided values still have defaults
      assert.strictEqual(config.htmlPattern, '**/*.html');
      assert.strictEqual(config.imgSelector, 'img:not([data-no-responsive])');
      assert.strictEqual(config.skipLarger, true);
      assert.strictEqual(config.dimensionAttributes, true);
      assert.strictEqual(config.generateMetadata, false);
    });

    it('should handle format options', () => {
      const options = {
        formatOptions: {
          webp: { quality: 90, lossless: true }
          // Don't specify other formats
        }
      };

      const config = buildConfig(options);

      // Check that provided format options override defaults
      assert.deepStrictEqual(config.formatOptions.webp, { quality: 90, lossless: true });

      // Other format options should still exist
      assert.ok(config.formatOptions.avif);
      assert.ok(config.formatOptions.jpeg);
      assert.ok(config.formatOptions.png);
    });

    it('should handle empty arrays correctly', () => {
      const options = {
        widths: [],
        formats: []
      };

      const config = buildConfig(options);

      // Empty arrays should override defaults
      assert.deepStrictEqual(config.widths, []);
      assert.deepStrictEqual(config.formats, []);
    });

    it('should handle deep merging of placeholder options', () => {
      const config = buildConfig({
        placeholder: {
          width: 75,
          quality: 20
          // blur intentionally omitted to test partial merge
        }
      });

      assert.strictEqual(config.placeholder.width, 75);
      assert.strictEqual(config.placeholder.quality, 20);
      assert.strictEqual(config.placeholder.blur, 10); // Should keep default
    });

    it('should handle partial formatOptions merging', () => {
      const config = buildConfig({
        formatOptions: {
          avif: { quality: 50 }, // Override avif quality only
          jpeg: { quality: 95, progressive: false } // Override jpeg options
          // webp intentionally omitted to test partial merge
        }
      });

      assert.strictEqual(config.formatOptions.avif.quality, 50);
      assert.strictEqual(config.formatOptions.avif.speed, 5); // Should keep default
      assert.strictEqual(config.formatOptions.jpeg.quality, 95);
      assert.strictEqual(config.formatOptions.jpeg.progressive, false);
      assert.strictEqual(config.formatOptions.webp.quality, 80); // Should keep default
    });

    it('should handle null and undefined options gracefully', () => {
      const config1 = buildConfig(null);
      const config2 = buildConfig(undefined);

      assert.deepStrictEqual(config1.widths, [320, 640, 960, 1280, 1920]);
      assert.deepStrictEqual(config2.widths, [320, 640, 960, 1280, 1920]);
    });

    it('should handle progressive loading defaults', () => {
      const config = buildConfig();

      assert.strictEqual(config.isProgressive, false);
      assert.strictEqual(typeof config.placeholder, 'object');
      assert.strictEqual(config.placeholder.width, 50);
      assert.strictEqual(config.placeholder.quality, 30);
      assert.strictEqual(config.placeholder.blur, 10);
    });

    it('should override progressive loading options', () => {
      const config = buildConfig({
        isProgressive: true,
        placeholder: {
          width: 100,
          quality: 40,
          blur: 5
        }
      });

      assert.strictEqual(config.isProgressive, true);
      assert.strictEqual(config.placeholder.width, 100);
      assert.strictEqual(config.placeholder.quality, 40);
      assert.strictEqual(config.placeholder.blur, 5);
    });
  });
});
