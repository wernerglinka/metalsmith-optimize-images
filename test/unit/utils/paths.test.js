import { describe, it } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import { generateVariantPath } from '../../../src/utils/paths.js';

describe( 'Path utilities', () => {
  describe( 'generateVariantPath', () => {
    it( 'should generate a path with the correct structure', () => {
      const originalPath = 'images/test-image.jpg';
      const width = 300;
      const format = 'webp';
      const hash = 'abcd1234';
      const config = {
        outputDir: 'assets/responsive',
        outputPattern: '[filename]-[width]w-[hash].[format]'
      };

      const result = generateVariantPath( originalPath, width, format, hash, config );

      // Path should be correctly formatted
      assert.strictEqual( result, path.join( 'assets/responsive', 'test-image-300w-abcd1234.webp' ) );
    } );

    it( 'should handle the "original" format correctly', () => {
      const originalPath = 'images/test-image.jpg';
      const width = 300;
      const format = 'original'; // This should use the original extension
      const hash = 'abcd1234';
      const config = {
        outputDir: 'assets/responsive',
        outputPattern: '[filename]-[width]w-[hash].[format]'
      };

      const result = generateVariantPath( originalPath, width, format, hash, config );

      // Should use original extension (jpg)
      assert.strictEqual( result, path.join( 'assets/responsive', 'test-image-300w-abcd1234.jpg' ) );
    } );

    it( 'should handle different file extensions', () => {
      // Test with PNG
      const pngPath = 'images/test-image.png';
      const pngResult = generateVariantPath( pngPath, 300, 'original', 'hash123', {
        outputDir: 'assets/responsive',
        outputPattern: '[filename]-[width]w-[hash].[format]'
      } );

      assert.strictEqual( pngResult, path.join( 'assets/responsive', 'test-image-300w-hash123.png' ) );

      // Test with WebP
      const webpPath = 'images/test-image.webp';
      const webpResult = generateVariantPath( webpPath, 300, 'original', 'hash123', {
        outputDir: 'assets/responsive',
        outputPattern: '[filename]-[width]w-[hash].[format]'
      } );

      assert.strictEqual( webpResult, path.join( 'assets/responsive', 'test-image-300w-hash123.webp' ) );
    } );

    it( 'should handle different output patterns', () => {
      const originalPath = 'images/test-image.jpg';

      // Test with a simple pattern
      const simpleConfig = {
        outputDir: 'assets/responsive',
        outputPattern: '[filename]_[width].[format]'
      };

      const simpleResult = generateVariantPath( originalPath, 400, 'webp', 'hash', simpleConfig );
      assert.strictEqual( simpleResult, path.join( 'assets/responsive', 'test-image_400.webp' ) );

      // Test with a complex pattern
      const complexConfig = {
        outputDir: 'assets/responsive',
        outputPattern: 'w[width]-[hash]-[filename].[format]'
      };

      const complexResult = generateVariantPath( originalPath, 800, 'avif', 'abc123', complexConfig );
      assert.strictEqual( complexResult, path.join( 'assets/responsive', 'w800-abc123-test-image.avif' ) );
    } );

    it( 'should handle missing hash gracefully', () => {
      const originalPath = 'images/test-image.jpg';
      const config = {
        outputDir: 'assets/responsive',
        outputPattern: '[filename]-[width]w-[hash].[format]'
      };

      // Call without a hash
      const result = generateVariantPath( originalPath, 300, 'webp', undefined, config );

      // Should replace [hash] with empty string
      assert.strictEqual(
        result,
        path.join( 'assets/responsive', 'test-image-300w-.[format]'.replace( '[format]', 'webp' ) )
      );
    } );
  } );
} );
