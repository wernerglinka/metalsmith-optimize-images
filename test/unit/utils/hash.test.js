import { describe, it } from 'mocha';
import assert from 'node:assert';
import { generateHash } from '../../../src/utils/hash.js';

describe( 'Hash utilities', () => {
  describe( 'generateHash', () => {
    it( 'should generate an 8-character hash from a buffer', () => {
      const buffer = Buffer.from( 'test content' );
      const hash = generateHash( buffer );

      // Check that it's a string of the right length
      assert.strictEqual( typeof hash, 'string' );
      assert.strictEqual( hash.length, 8 );

      // Same content should generate same hash
      const buffer2 = Buffer.from( 'test content' );
      const hash2 = generateHash( buffer2 );
      assert.strictEqual( hash, hash2 );

      // Different content should generate different hash
      const buffer3 = Buffer.from( 'different content' );
      const hash3 = generateHash( buffer3 );
      assert.notStrictEqual( hash, hash3 );
    } );

    it( 'should handle empty buffers', () => {
      const buffer = Buffer.from( '' );
      const hash = generateHash( buffer );

      assert.strictEqual( typeof hash, 'string' );
      assert.strictEqual( hash.length, 8 );
    } );

    it( 'should generate consistent hashes for the same content', () => {
      const buffer = Buffer.from( 'consistent content test' );

      // Generate multiple hashes for the same content
      const hash1 = generateHash( buffer );
      const hash2 = generateHash( buffer );
      const hash3 = generateHash( buffer );

      // All should be the same
      assert.strictEqual( hash1, hash2 );
      assert.strictEqual( hash2, hash3 );
    } );
  } );
} );
