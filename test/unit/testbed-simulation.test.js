import { describe, it, after } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../../src/index.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

describe( 'Testbed Simulation Debug', function () {
  this.timeout( 30000 );

  const fixturesDir = path.join( __dirname, '../fixtures' );
  const buildDir = path.join( __dirname, '../build-testbed-sim' );

  after( () => {
    // Cleanup
    if ( fs.existsSync( buildDir ) ) {
      fs.rmSync( buildDir, { recursive: true, force: true } );
    }
  } );

  it( 'should simulate testbed structure and show debug info', ( done ) => {
    const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

    // Simulate your testbed structure
    metalsmith.use( ( files, metalsmith, done ) => {
      // Clear existing files
      Object.keys( files ).forEach( ( key ) => delete files[key] );

      // Create HTML that references SOME images with assets/ prefix (like your testbed)
      files['index.html'] = {
        contents: Buffer.from( `
          <h1>Gallery</h1>
          <img src="lib/assets/images/art/2005/2005.01.003.jpg" alt="Art 1">
          <img src="lib/assets/images/art/2006/2006.02.001.jpg" alt="Art 2">
        ` )
      };

      // Simulate your image structure - files in Metalsmith object are the source paths
      // Art images (should be processed in HTML phase) - but HTML references with assets/ prefix
      files['lib/assets/images/art/2005/2005.01.003.jpg'] = {
        contents: fs.readFileSync( path.join( fixturesDir, 'src/images/tree.jpg' ) )
      };
      files['lib/assets/images/art/2006/2006.02.001.jpg'] = {
        contents: fs.readFileSync( path.join( fixturesDir, 'src/images/tree.jpg' ) )
      };

      // Header images (should be processed as background) - NOT in HTML, different path structure
      files['lib/assets/images/header/header1.jpg'] = {
        contents: fs.readFileSync( path.join( fixturesDir, 'src/images/tree.jpg' ) )
      };
      files['lib/assets/images/header/header2.jpg'] = {
        contents: fs.readFileSync( path.join( fixturesDir, 'src/images/tree.jpg' ) )
      };

      // Site images (mixed - some in HTML, some background)
      files['lib/assets/images/site-images/about.jpg'] = {
        contents: fs.readFileSync( path.join( fixturesDir, 'src/images/tree.jpg' ) )
      };
      files['lib/assets/images/site-images/contact-bg.jpg'] = {
        contents: fs.readFileSync( path.join( fixturesDir, 'src/images/tree.jpg' ) )
      };

      // Logo (should be background)
      files['lib/assets/images/wg-logo.png'] = {
        contents: fs.readFileSync( path.join( fixturesDir, 'src/images/buildings.png' ) )
      };

      // Add robots.txt to test exclusion
      files['robots.txt'] = {
        contents: Buffer.from( 'User-agent: *\nDisallow:' )
      };

      // Add CSS and JS files to test they're excluded
      files['assets/components.css'] = {
        contents: Buffer.from( '.header { background: url("images/header1.jpg"); }' )
      };
      files['assets/components.js'] = {
        contents: Buffer.from( 'console.log("test");' )
      };

      done();
    } );

    metalsmith.use(
      optimizeImages( {
        widths: [640, 1280], // Simple widths for testing
        formats: ['webp', 'original'],
        processUnusedImages: true,
        imagePattern: '**/*.{jpg,jpeg,png,gif,webp,avif}',
        imageFolder: 'images', // Use the old default for this test
        isProgressive: false
      } )
    );

    metalsmith.build( ( err, files ) => {
      if ( err ) {
        return done( err );
      }

      const sourceImages = [];
      const processedVariants = [];
      const htmlFiles = [];

      Object.keys( files ).forEach( ( file ) => {
        if ( file.endsWith( '.html' ) ) {
          htmlFiles.push( file );
        } else if ( file.includes( 'responsive' ) ) {
          processedVariants.push( file );
        } else if ( file.match( /\.(jpg|jpeg|png|gif|webp|avif)$/i ) ) {
          sourceImages.push( file );
        }
      } );

      // Count background variants vs HTML variants
      const backgroundVariants = processedVariants.filter(
        ( variant ) =>
          variant.includes( 'header' ) ||
          variant.includes( 'wg-logo' ) ||
          variant.includes( 'contact-bg' ) ||
          variant.includes( 'about' )
      );

      const htmlVariants = processedVariants.filter(
        ( variant ) => variant.includes( '2005.01.003' ) || variant.includes( '2006.02.001' )
      );

      // Verify we have both HTML and background variants
      assert.strictEqual( htmlVariants.length, 4, 'Should have 4 HTML image variants' );
      assert.ok( backgroundVariants.length > 0, 'Should have processed background images' );

      // The test should pass regardless - we're just debugging
      assert.strictEqual( err, null, 'Build should complete without errors' );
      done();
    } );
  } );
} );
