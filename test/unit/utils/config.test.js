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
  });
});
