import { describe, it, before, after } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../../src/index.js';
import * as cheerio from 'cheerio';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

describe( 'Realistic workflow integration tests', function () {
  this.timeout( 120000 ); // 2 minutes for real image processing

  const fixturesDir = path.join( __dirname, '../fixtures' );
  const buildDir = path.join( __dirname, '../build-integration' );

  before( () => {
    // Ensure we have test images
    const imageDir = path.join( fixturesDir, 'src', 'images' );
    if ( !fs.existsSync( imageDir ) ) {
      throw new Error( 'Test images directory not found. Run test setup first.' );
    }
  } );

  after( () => {
    // Cleanup build directory
    if ( fs.existsSync( buildDir ) ) {
      fs.rmSync( buildDir, { recursive: true, force: true } );
    }
  } );

  describe( 'Complete image processing workflow', () => {
    it( 'should process all image formats and sizes correctly', ( done ) => {
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      metalsmith
        .use(
          optimizeImages( {
            widths: [320, 640, 960, 1280, 1920],
            formats: ['avif', 'webp', 'original'],
            outputDir: 'assets/images/responsive',
            isProgressive: false,
            generateMetadata: true,
            lazy: true,
            dimensionAttributes: true,
            concurrency: 3 // Lower for test stability
          } )
        )
        .build( ( err ) => {
          if ( err ) {
            return done( err );
          }

          try {
            // Verify basic structure
            assert.strictEqual( fs.existsSync( buildDir ), true, 'Build directory should exist' );

            const htmlPath = path.join( buildDir, 'test.html' );
            assert.strictEqual( fs.existsSync( htmlPath ), true, 'HTML file should exist' );

            // Read and parse HTML
            const htmlContent = fs.readFileSync( htmlPath, 'utf8' );
            const $ = cheerio.load( htmlContent );

            // Verify responsive directory structure
            const responsiveDir = path.join( buildDir, 'assets/images/responsive' );
            assert.strictEqual( fs.existsSync( responsiveDir ), true, 'Responsive images directory should exist' );

            const responsiveFiles = fs.readdirSync( responsiveDir );
            console.log( `Generated ${responsiveFiles.length} responsive image files` );

            // Count different formats
            const avifFiles = responsiveFiles.filter( ( f ) => f.endsWith( '.avif' ) );
            const webpFiles = responsiveFiles.filter( ( f ) => f.endsWith( '.webp' ) );
            const jpegFiles = responsiveFiles.filter( ( f ) => f.endsWith( '.jpg' ) );
            const pngFiles = responsiveFiles.filter( ( f ) => f.endsWith( '.png' ) );

            console.log(
              `Formats generated: AVIF=${avifFiles.length}, WebP=${webpFiles.length}, JPEG=${jpegFiles.length}, PNG=${pngFiles.length}`
            );

            // Verify we have multiple formats
            assert.strictEqual( avifFiles.length > 0, true, 'Should generate AVIF files' );
            assert.strictEqual( webpFiles.length > 0, true, 'Should generate WebP files' );
            assert.strictEqual( jpegFiles.length + pngFiles.length > 0, true, 'Should generate original format files' );

            // Verify HTML transformations
            const pictureElements = $( 'picture' );
            const processedImages = pictureElements.length;

            console.log( `Processed ${processedImages} images into picture elements` );
            assert.strictEqual( processedImages > 0, true, 'Should have picture elements' );

            // Verify picture element structure
            pictureElements.each( ( i, picture ) => {
              const $picture = $( picture );
              const sources = $picture.find( 'source' );
              const img = $picture.find( 'img' );

              // Should have multiple source elements (for different formats)
              assert.strictEqual( sources.length >= 2, true, `Picture ${i + 1} should have multiple source elements` );

              // Should have exactly one img element
              assert.strictEqual( img.length, 1, `Picture ${i + 1} should have exactly one img element` );

              // Verify source order (AVIF first, then WebP, then original)
              sources.each( ( j, source ) => {
                const $source = $( source );
                const type = $source.attr( 'type' );
                const srcset = $source.attr( 'srcset' );

                assert.strictEqual( !!type, true, `Source ${j + 1} should have type attribute` );
                assert.strictEqual( !!srcset, true, `Source ${j + 1} should have srcset attribute` );
                assert.strictEqual(
                  srcset.includes( 'w' ),
                  true,
                  `Source ${j + 1} srcset should include width descriptors`
                );
              } );

              // Verify img attributes
              const $img = img.first();
              assert.strictEqual( $img.attr( 'loading' ), 'lazy', 'Should have lazy loading' );
              assert.strictEqual( !!$img.attr( 'width' ), true, 'Should have width attribute' );
              assert.strictEqual( !!$img.attr( 'height' ), true, 'Should have height attribute' );
            } );

            // Verify images that should be skipped are actually skipped
            const ignoredImage = $( 'img[data-no-responsive]' );
            assert.strictEqual( ignoredImage.length, 1, 'Should preserve ignored images' );
            assert.strictEqual(
              ignoredImage.parent().is( 'picture' ),
              false,
              'Ignored image should not be in picture element'
            );

            const externalImage = $( 'img[src^="https://"]' );
            assert.strictEqual( externalImage.length, 1, 'Should preserve external images' );
            assert.strictEqual(
              externalImage.parent().is( 'picture' ),
              false,
              'External image should not be in picture element'
            );

            // Verify metadata file if generated
            const metadataPath = path.join( responsiveDir, 'responsive-images-manifest.json' );
            assert.strictEqual( fs.existsSync( metadataPath ), true, 'Should generate metadata file' );

            const metadata = JSON.parse( fs.readFileSync( metadataPath, 'utf8' ) );
            const metadataKeys = Object.keys( metadata );
            assert.strictEqual( metadataKeys.length > 0, true, 'Metadata should contain image information' );

            console.log( `Metadata generated for ${metadataKeys.length} images` );

            // Verify file sizes are reasonable
            responsiveFiles.forEach( ( file ) => {
              const filePath = path.join( responsiveDir, file );
              const stats = fs.statSync( filePath );

              // Files should be smaller than 2MB (reasonable for test images)
              assert.strictEqual( stats.size < 2 * 1024 * 1024, true, `${file} should be under 2MB` );

              // Files should not be empty
              assert.strictEqual( stats.size > 0, true, `${file} should not be empty` );
            } );

            done();
          } catch ( assertionError ) {
            done( assertionError );
          }
        } );
    } );

    it( 'should handle progressive loading with real images', ( done ) => {
      const metalsmith = Metalsmith( fixturesDir ).clean( true ).source( 'src' ).destination( buildDir );

      metalsmith
        .use(
          optimizeImages( {
            widths: [480, 960],
            formats: ['webp', 'original'],
            outputDir: 'assets/images/responsive',
            isProgressive: true,
            lazy: false, // Not needed in progressive mode
            placeholder: {
              width: 40,
              quality: 20,
              blur: 8
            }
          } )
        )
        .build( ( err ) => {
          if ( err ) {
            return done( err );
          }

          try {
            const htmlPath = path.join( buildDir, 'test.html' );
            const htmlContent = fs.readFileSync( htmlPath, 'utf8' );
            const $ = cheerio.load( htmlContent );

            // Verify progressive wrapper structure
            const wrappers = $( '.responsive-wrapper.js-progressive-image-wrapper' );
            assert.strictEqual( wrappers.length > 0, true, 'Should have progressive wrappers' );

            wrappers.each( ( i, wrapper ) => {
              const $wrapper = $( wrapper );

              // Should have aspect-ratio style
              const style = $wrapper.attr( 'style' );
              assert.strictEqual( style.includes( 'aspect-ratio' ), true, `Wrapper ${i + 1} should have aspect-ratio` );

              // Should have low-res and high-res images
              const lowRes = $wrapper.find( '.low-res' );
              const highRes = $wrapper.find( '.high-res' );

              assert.strictEqual( lowRes.length, 1, `Wrapper ${i + 1} should have low-res image` );
              assert.strictEqual( highRes.length, 1, `Wrapper ${i + 1} should have high-res image` );

              // Low-res should have src, high-res should have data-source
              assert.strictEqual( !!lowRes.attr( 'src' ), true, 'Low-res should have src' );
              assert.strictEqual( lowRes.attr( 'src' ).includes( 'placeholder' ), true, 'Low-res should be placeholder' );

              assert.strictEqual( highRes.attr( 'src' ), '', 'High-res should have empty src initially' );
              assert.strictEqual( !!highRes.attr( 'data-source' ), true, 'High-res should have data-source' );
            } );

            // Verify placeholder files exist
            const responsiveDir = path.join( buildDir, 'assets/images/responsive' );
            const placeholderFiles = fs.readdirSync( responsiveDir ).filter( ( f ) => f.includes( 'placeholder' ) );
            assert.strictEqual( placeholderFiles.length > 0, true, 'Should generate placeholder files' );

            // Verify progressive assets are injected
            assert.strictEqual( htmlContent.includes( 'progressive-image-styles' ), true, 'Should inject CSS' );
            assert.strictEqual( htmlContent.includes( 'progressive-image-loader' ), true, 'Should inject JavaScript' );
            assert.strictEqual(
              htmlContent.includes( 'IntersectionObserver' ),
              true,
              'Should include intersection observer code'
            );
            assert.strictEqual(
              htmlContent.includes( 'createImageBitmap' ),
              true,
              'Should include modern format detection'
            );

            done();
          } catch ( assertionError ) {
            done( assertionError );
          }
        } );
    } );
  } );
} );
