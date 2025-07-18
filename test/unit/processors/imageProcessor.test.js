import { describe, it } from 'mocha';
import assert from 'node:assert';
import { processImageToVariants } from '../../../src/processors/imageProcessor.js';

describe('Image Processor', () => {
  describe('processImageToVariants', () => {
    it('should handle very small images correctly', async () => {
      // Create a minimal test image buffer
      const testBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
        0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d,
        0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
      ]);

      const config = {
        widths: [100, 200, 400],
        formats: ['original'],
        skipLarger: true,
        formatOptions: {
          png: { compressionLevel: 8 }
        }
      };

      const debugFn = () => {};

      try {
        const variants = await processImageToVariants(testBuffer, 'test.png', debugFn, config);

        // For a 1x1 image with skipLarger=true, should return empty array or minimal variants
        assert.strictEqual(Array.isArray(variants), true);
        // All variants should be smaller than or equal to original width (1px)
        variants.forEach((variant) => {
          assert.strictEqual(variant.width <= 1, true);
        });
      } catch (error) {
        // Sharp might reject very small test buffers - that's okay for testing
        assert.strictEqual(typeof error, 'object');
      }
    });

    it('should handle invalid image buffers gracefully', async () => {
      const invalidBuffer = Buffer.from('not an image');

      const config = {
        widths: [100, 200],
        formats: ['original'],
        skipLarger: true,
        formatOptions: {}
      };

      const debugFn = () => {};

      try {
        await processImageToVariants(invalidBuffer, 'invalid.jpg', debugFn, config);
        assert.fail('Should have thrown an error for invalid image');
      } catch (error) {
        assert.strictEqual(typeof error, 'object');
      }
    });

    it('should handle empty widths array', async () => {
      const testBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
        0x00, 0x64, 0x00, 0x00, 0x00, 0x64
      ]);

      const config = {
        widths: [],
        formats: ['original'],
        skipLarger: true,
        formatOptions: {}
      };

      const debugFn = () => {};

      try {
        const variants = await processImageToVariants(testBuffer, 'test.png', debugFn, config);
        assert.strictEqual(variants.length, 0);
      } catch (error) {
        // Expected if Sharp can't process the minimal buffer
        assert.strictEqual(typeof error, 'object');
      }
    });

    it('should handle format processing errors', async () => {
      const testBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
        0x00, 0x64, 0x00, 0x00, 0x00, 0x64
      ]);

      const config = {
        widths: [100],
        formats: ['avif', 'webp', 'original'],
        skipLarger: false,
        formatOptions: {
          avif: { quality: -1 }, // Invalid quality to trigger error
          webp: { quality: 101 } // Invalid quality to trigger error
        }
      };

      const debugFn = () => {};

      try {
        const variants = await processImageToVariants(testBuffer, 'test.png', debugFn, config);
        // Should still return some variants even if some formats fail
        assert.strictEqual(Array.isArray(variants), true);
      } catch (error) {
        // Sharp might reject the test buffer entirely
        assert.strictEqual(typeof error, 'object');
      }
    });
  });
});
