import { describe, it, after, before } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../../src/index.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

describe( 'Filesystem Background Image Processing', function () {
  this.timeout( 30000 );

  const fixturesDir = path.join( __dirname, '../fixtures' );
  const buildDir = path.join( __dirname, '../build-filesystem' );
  const sourceDir = path.join( fixturesDir, 'src-filesystem' );

  before( () => {
    // Create a test source directory with header images
    // Metalsmith source() includes the 'src' subdirectory
    const srcDir = path.join( sourceDir, 'src' );
    if ( !fs.existsSync( srcDir ) ) {
      fs.mkdirSync( srcDir, { recursive: true } );
    }
    
    // Create header directory using the new default path
    const headerDir = path.join( srcDir, 'lib', 'assets', 'images', 'header' );
    if ( !fs.existsSync( headerDir ) ) {
      fs.mkdirSync( headerDir, { recursive: true } );
    }
    
    // Copy test images to simulate header images on filesystem
    const testImage = path.join( fixturesDir, 'src/images/tree.jpg' );
    fs.copyFileSync( testImage, path.join( headerDir, 'header1.jpg' ) );
    fs.copyFileSync( testImage, path.join( headerDir, 'header2.jpg' ) );
  } );

  after( () => {
    // Cleanup
    if ( fs.existsSync( buildDir ) ) {
      fs.rmSync( buildDir, { recursive: true, force: true } );
    }
    if ( fs.existsSync( sourceDir ) ) {
      fs.rmSync( sourceDir, { recursive: true, force: true } );
    }
  } );

  it( 'should find and process images from filesystem that are not in Metalsmith files', ( done ) => {
    const metalsmith = Metalsmith( sourceDir )
      .clean( true )
      .destination( buildDir );

    // Add only HTML files, no images in Metalsmith files object
    metalsmith.use( ( files, metalsmith, done ) => {
      files['index.html'] = {
        contents: Buffer.from( '<h1>No images in HTML</h1>' )
      };
      done();
    } );

    metalsmith.use(
      optimizeImages( {
        widths: [640, 1280],
        formats: ['webp', 'original'],
        processUnusedImages: true,
        imagePattern: '**/*.{jpg,jpeg,png,gif,webp,avif}',
        imageFolder: 'lib/assets/images',
        isProgressive: false
      } )
    );

    metalsmith.build( ( err, files ) => {
      if ( err ) return done( err );

      // Check that header images were processed from filesystem
      const generatedFiles = Object.keys( files );
      const headerVariants = generatedFiles.filter( file => 
        file.includes( 'header' ) && file.includes( 'assets/images/responsive/' )
      );


      // Should have processed header1.jpg and header2.jpg
      // Each should have 2 widths x 2 formats = 4 variants each = 8 total
      assert.ok( headerVariants.length > 0, 'Should have generated header image variants' );
      
      // Check for specific header1 variants
      const header1Variants = headerVariants.filter( variant => variant.includes( 'header1' ) );
      assert.ok( header1Variants.length > 0, 'Should have header1 variants' );
      
      // Check for specific header2 variants
      const header2Variants = headerVariants.filter( variant => variant.includes( 'header2' ) );
      assert.ok( header2Variants.length > 0, 'Should have header2 variants' );

      done();
    } );
  } );
} );