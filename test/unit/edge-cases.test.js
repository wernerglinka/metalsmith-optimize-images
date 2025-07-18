import { describe, it } from 'mocha';
import assert from 'node:assert';
import { buildConfig } from '../../src/utils/config.js';

describe( 'Edge Cases and Error Handling', () => {
  it( 'should handle extreme configuration values', () => {
    const config = buildConfig( {
      widths: [1, 2, 3], // Very small
      concurrency: 1000, // Very large
      placeholder: {
        width: 1,
        quality: 1,
        blur: 0
      }
    } );

    assert.deepStrictEqual( config.widths, [1, 2, 3] );
    assert.strictEqual( config.concurrency, 1000 );
    assert.strictEqual( config.placeholder.width, 1 );
  } );

  it( 'should handle empty string configurations', () => {
    const config = buildConfig( {
      htmlPattern: '',
      imgSelector: '',
      outputDir: '',
      sizes: ''
    } );

    assert.strictEqual( config.htmlPattern, '' );
    assert.strictEqual( config.imgSelector, '' );
    assert.strictEqual( config.outputDir, '' );
    assert.strictEqual( config.sizes, '' );
  } );

  it( 'should handle boolean edge cases', () => {
    const config = buildConfig( {
      skipLarger: false,
      lazy: false,
      dimensionAttributes: false,
      generateMetadata: true,
      isProgressive: true
    } );

    assert.strictEqual( config.skipLarger, false );
    assert.strictEqual( config.lazy, false );
    assert.strictEqual( config.dimensionAttributes, false );
    assert.strictEqual( config.generateMetadata, true );
    assert.strictEqual( config.isProgressive, true );
  } );

  it( 'should handle mixed data types in arrays', () => {
    const config = buildConfig( {
      widths: ['100', 200, '300'], // Mixed strings and numbers
      formats: ['avif', '', 'webp'] // Including empty string
    } );

    assert.deepStrictEqual( config.widths, ['100', 200, '300'] );
    assert.deepStrictEqual( config.formats, ['avif', '', 'webp'] );
  } );

  it( 'should preserve object references correctly', () => {
    const customFormatOptions = { webp: { quality: 85 } };
    const config = buildConfig( {
      formatOptions: customFormatOptions
    } );

    // Should not be the same reference (deep merge creates new object)
    assert.notStrictEqual( config.formatOptions, customFormatOptions );
    assert.strictEqual( config.formatOptions.webp.quality, 85 );
  } );
} );
