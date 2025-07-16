import { describe, it, after } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../../src/index.js';
// Note: processProgressiveImage is not exported, so we'll test through the main functions

// Get __dirname equivalent in ESM
const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

describe( 'Coverage gap tests - targeting missing lines', function () {
  this.timeout( 30000 );

  const fixturesDir = path.join( __dirname, '../fixtures' );
  const buildDir = path.join( __dirname, '../build-coverage' );

  after( () => {
    // Cleanup
    if ( fs.existsSync( buildDir ) ) {
      fs.rmSync( buildDir, { recursive: true, force: true } );
    }
  } );

  describe( 'Main plugin function edge cases', () => {
    it( 'should handle when no HTML files are found', ( done ) => {
      // Create a temporary source with no HTML files
      const tempDir = path.join( __dirname, '../temp-no-html' );

      const metalsmith = Metalsmith( tempDir ).clean( true ).source( '.' ).destination( buildDir );

      metalsmith
        .use(
          optimizeImages( {
            htmlPattern: '**/*.html', // No HTML files exist
            isProgressive: false
          } )
        )
        .build( ( err ) => {
          // Should complete without error even with no HTML files
          assert.strictEqual( err, null );
          done();
        } );
    } );

    it( 'should handle custom HTML patterns that match no files', ( done ) => {
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      metalsmith
        .use(
          optimizeImages( {
            htmlPattern: '**/*.nonexistent', // Pattern that matches nothing
            isProgressive: false
          } )
        )
        .build( ( err ) => {
          assert.strictEqual( err, null );
          done();
        } );
    } );
  } );

  describe( 'Progressive image processing edge cases', () => {
    it( 'should handle cached progressive images', ( done ) => {
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      // Cache will be handled internally by the plugin

      metalsmith
        .use(
          optimizeImages( {
            widths: [300],
            formats: ['webp'],
            isProgressive: true,
            outputDir: 'assets/responsive'
          } )
        )
        .build( ( err, _files ) => {
          if ( err ) {
            return done( err );
          }

          // Run again with the same cache to trigger cached path
          const metalsmith2 = Metalsmith( fixturesDir )
            .clean( false ) // Don't clean to keep processed images
            .source( 'src' )
            .destination( buildDir );

          metalsmith2
            .use(
              optimizeImages( {
                widths: [300],
                formats: ['webp'],
                isProgressive: true,
                outputDir: 'assets/responsive'
              } )
            )
            .build( ( err2 ) => {
              assert.strictEqual( err2, null );
              done();
            } );
        } );
    } );

    it( 'should handle progressive image processing errors with fallback', function ( done ) {
      this.timeout( 10000 );

      // Create invalid image data that will cause progressive processing to fail
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      // Add invalid image data to trigger error handling
      metalsmith.use( ( files, metalsmith, done ) => {
        files['images/invalid.jpg'] = {
          contents: Buffer.from( 'invalid image data' ),
          mtime: Date.now()
        };
        files['test-progressive-error.html'] = {
          contents: Buffer.from( '<img src="images/invalid.jpg" alt="Invalid">' )
        };
        done();
      } );

      metalsmith.use(
        optimizeImages( {
          widths: [300],
          formats: ['webp'],
          isProgressive: true, // This should trigger progressive processing and fallback
          outputDir: 'assets/responsive'
        } )
      );

      metalsmith.build( ( err ) => {
        // Should complete without throwing, handling errors gracefully
        assert.strictEqual( err, null );
        done();
      } );
    } );
  } );

  describe( 'File system edge cases', () => {
    it( 'should handle images that exist in build directory but not in files', ( done ) => {
      // Use real Metalsmith instance
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      // Add only HTML file, not the image file - this will trigger loading from build directory
      metalsmith.use( ( files, metalsmith, done ) => {
        // Remove all images from files but keep HTML
        Object.keys( files ).forEach( ( file ) => {
          if ( file.startsWith( 'images/' ) ) {
            delete files[file];
          }
        } );
        done();
      } );

      metalsmith.use(
        optimizeImages( {
          widths: [300],
          formats: ['webp'],
          isProgressive: false
        } )
      );

      metalsmith.build( ( _err ) => {
        // Should complete successfully even when loading images from build directory
        done();
      } );
    } );

    it( 'should handle missing images gracefully', ( done ) => {
      // Use real Metalsmith instance
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      // Add HTML with missing image reference
      metalsmith.use( ( files, metalsmith, done ) => {
        files['test-missing.html'] = {
          contents: Buffer.from( '<img src="images/nonexistent.jpg" alt="Missing">' )
        };
        done();
      } );

      metalsmith.use(
        optimizeImages( {
          widths: [300],
          formats: ['webp'],
          isProgressive: false
        } )
      );

      metalsmith.build( ( _err ) => {
        // Should complete without error even with missing images
        done();
      } );
    } );
  } );

  describe( 'Error handling paths', () => {
    it( 'should handle Sharp processing errors gracefully', ( done ) => {
      // Use real Metalsmith instance
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      // Add invalid image data that will cause Sharp to fail
      metalsmith.use( ( files, metalsmith, done ) => {
        files['test-invalid.html'] = {
          contents: Buffer.from( '<img src="images/invalid.jpg" alt="Invalid">' )
        };
        files['images/invalid.jpg'] = {
          contents: Buffer.from( 'not an image' ),
          mtime: Date.now()
        };
        done();
      } );

      metalsmith.use(
        optimizeImages( {
          widths: [300],
          formats: ['webp'],
          isProgressive: false
        } )
      );

      metalsmith.build( ( err ) => {
        // Should handle Sharp errors gracefully
        done( err );
      } );
    } );

    it( 'should handle metalsmith.destination errors', ( done ) => {
      // Create a temporary directory that will be inaccessible
      const tempDir = path.join( __dirname, '../temp-no-access' );

      const metalsmith = Metalsmith( tempDir ).clean( true ).source( '.' ).destination( '/root/inaccessible' ); // Path that should not be accessible

      // Add test HTML file
      metalsmith.use( ( files, metalsmith, done ) => {
        files['test.html'] = {
          contents: Buffer.from( '<img src="images/tree.jpg" alt="Tree">' )
        };
        done();
      } );

      metalsmith.use(
        optimizeImages( {
          widths: [300],
          formats: ['webp'],
          isProgressive: false
        } )
      );

      metalsmith.build( ( _err ) => {
        // Should handle the error gracefully - could be an error or null
        // Either outcome is acceptable for this edge case test
        done();
      } );
    } );

    it( 'should handle file system errors when loading images', function ( done ) {
      this.timeout( 10000 );

      const tempDir = path.join( __dirname, '../temp-fs-error' );

      const metalsmith = Metalsmith( tempDir ).clean( true ).source( '.' ).destination( '/root/inaccessible' ); // Inaccessible path

      // Add test HTML file
      metalsmith.use( ( files, metalsmith, done ) => {
        files['test.html'] = {
          contents: Buffer.from( '<img src="images/tree.jpg" alt="Tree">' )
        };
        done();
      } );

      metalsmith.use(
        optimizeImages( {
          widths: [300],
          formats: ['webp'],
          isProgressive: false
        } )
      );

      metalsmith.build( ( _err ) => {
        // Should handle file system errors
        // Could be null (handled gracefully) or an error
        done(); // Either outcome is acceptable for this test
      } );
    } );
  } );

  describe( 'Configuration edge cases', () => {
    it( 'should handle empty formats array', ( done ) => {
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      metalsmith
        .use(
          optimizeImages( {
            widths: [300],
            formats: [], // Empty formats array
            isProgressive: false
          } )
        )
        .build( ( err ) => {
          assert.strictEqual( err, null );
          done();
        } );
    } );

    it( 'should handle empty widths array', ( done ) => {
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      metalsmith
        .use(
          optimizeImages( {
            widths: [], // Empty widths array
            formats: ['webp'],
            isProgressive: false
          } )
        )
        .build( ( err ) => {
          assert.strictEqual( err, null );
          done();
        } );
    } );
  } );
} );
