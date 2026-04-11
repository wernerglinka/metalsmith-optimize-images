import { describe, it, before, after } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../../src/index.js';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

/**
 * Recursively remove a directory.
 * @param {string} dir - Absolute path
 */
function removeDir( dir ) {
  if ( fs.existsSync( dir ) ) {
    fs.rmSync( dir, { recursive: true, force: true } );
  }
}

/**
 * Run a Metalsmith build and return the resulting HTML and responsive file list.
 * The cache directory is in the source tree (fixturesDir/lib/assets/images/responsive),
 * mimicking the real workflow where variants persist across builds.
 * @param {string} fixturesDir - Path to fixtures
 * @param {string} buildDir - Path to build output
 * @param {Object} options - Plugin options (must include cache)
 * @param {boolean} clean - Whether to clean the destination before building
 * @param {Function} [prePlugin] - Optional Metalsmith plugin to run before optimize-images
 * @return {Promise<{html: string, responsiveFiles: string[], cacheFiles: string[]}>}
 */
function runBuild( fixturesDir, buildDir, options, clean, prePlugin ) {
  return new Promise( ( resolve, reject ) => {
    const ms = Metalsmith( fixturesDir )
      .clean( clean )
      .source( 'src' )
      .destination( buildDir );

    if ( prePlugin ) {
      ms.use( prePlugin );
    }

    ms.use( optimizeImages( options ) ).build( ( err ) => {
      if ( err ) {
        return reject( err );
      }

      const htmlPath = path.join( buildDir, 'test.html' );
      const html = fs.existsSync( htmlPath ) ? fs.readFileSync( htmlPath, 'utf8' ) : '';

      // Read the cache directory (source-tree persistent cache)
      const cacheDir = path.join( fixturesDir, options.cache );
      const cacheFiles = fs.existsSync( cacheDir )
        ? fs.readdirSync( cacheDir ).sort()
        : [];

      // Also read the build output responsive dir (may or may not exist depending on workflow)
      const buildResponsiveDir = path.join( buildDir, options.outputDir );
      const responsiveFiles = fs.existsSync( buildResponsiveDir )
        ? fs.readdirSync( buildResponsiveDir ).sort()
        : [];

      resolve( { html, responsiveFiles, cacheFiles } );
    } );
  } );
}

describe( 'Persistent source-tree cache', function () {
  this.timeout( 120000 );

  const fixturesDir = path.join( __dirname, '../fixtures' );
  const buildDir = path.join( __dirname, '../build-cache' );
  const cacheRelative = 'lib/assets/images/responsive';
  const cacheDirAbs = path.join( fixturesDir, cacheRelative );

  // Minimal config with cache enabled
  const pluginOptions = {
    widths: [300],
    formats: ['webp', 'original'],
    outputDir: 'assets/images/responsive',
    isProgressive: false,
    processUnusedImages: false,
    cache: cacheRelative
  };

  before( () => {
    removeDir( buildDir );
    removeDir( cacheDirAbs );
  } );

  after( () => {
    removeDir( buildDir );
    removeDir( cacheDirAbs );
    // Clean up parent dirs created by the cache
    const libDir = path.join( fixturesDir, 'lib' );
    removeDir( libDir );
  } );

  it( 'should write variants to the source-tree cache directory', async () => {
    const result = await runBuild( fixturesDir, buildDir, pluginOptions, true );

    assert.ok( result.cacheFiles.length > 0, 'cache directory should contain variant files' );

    // Verify the cache directory was created at the expected location
    assert.ok( fs.existsSync( cacheDirAbs ), 'cache directory should exist on disk' );

    // Verify HTML was updated with <picture> elements
    const $ = cheerio.load( result.html );
    assert.ok( $( 'picture' ).length > 0, 'HTML should contain <picture> elements' );

    // Verify srcset references the responsive directory
    $( 'picture source' ).each( ( _i, source ) => {
      const srcset = $( source ).attr( 'srcset' );
      assert.ok( srcset, 'source should have srcset attribute' );
      assert.ok( srcset.includes( 'assets/images/responsive/' ), 'srcset should reference responsive dir' );
    } );
  } );

  it( 'should load variants from cache on subsequent builds (skip Sharp)', async () => {
    // Ensure cache is populated from a prior build
    removeDir( buildDir );
    removeDir( cacheDirAbs );
    const first = await runBuild( fixturesDir, buildDir, pluginOptions, true );

    assert.ok( first.cacheFiles.length > 0, 'first build should populate the cache' );

    // Second build: cache is warm — plugin should load from disk, not re-run Sharp
    const second = await runBuild( fixturesDir, buildDir, pluginOptions, true );

    // Same set of cached files
    assert.deepStrictEqual(
      second.cacheFiles,
      first.cacheFiles,
      'second build should have the same cached files'
    );

    // Same HTML output
    const $first = cheerio.load( first.html );
    const $second = cheerio.load( second.html );
    assert.strictEqual(
      $second( 'picture' ).length,
      $first( 'picture' ).length,
      'second build should produce the same <picture> elements'
    );

    // Cached files should be valid images
    for ( const file of second.cacheFiles ) {
      const buffer = fs.readFileSync( path.join( cacheDirAbs, file ) );
      assert.ok( buffer.length > 0, `cached variant ${file} should not be empty` );
    }
  } );

  it( 'should regenerate variants when source image content changes (hash changes)', async () => {
    removeDir( buildDir );
    removeDir( cacheDirAbs );

    // First build with original images
    const first = await runBuild( fixturesDir, buildDir, pluginOptions, true );

    // Find the hash from tree.jpg variant filenames
    const treeVariants = first.cacheFiles.filter( ( f ) => f.startsWith( 'tree-' ) );
    assert.ok( treeVariants.length > 0, 'should have tree.jpg variants in cache' );

    const hashMatch = treeVariants[0].match( /-([a-f0-9]{8})\.\w+$/ );
    assert.ok( hashMatch, 'variant filename should contain an 8-char hash' );
    const originalHash = hashMatch[1];

    // Second build: inject different content for tree.jpg
    // The different content produces a different hash → different filenames → cache miss
    const differentImageBuffer = fs.readFileSync(
      path.join( fixturesDir, 'src', 'images', 'industry.jpg' )
    );

    const prePlugin = ( files, _metalsmith, done ) => {
      files['images/tree.jpg'] = {
        contents: differentImageBuffer,
        mtime: Date.now()
      };
      done();
    };

    const second = await runBuild( fixturesDir, buildDir, pluginOptions, false, prePlugin );

    // New tree variants should have a DIFFERENT hash
    const newTreeVariants = second.cacheFiles.filter(
      ( f ) => f.startsWith( 'tree-' ) && !f.includes( originalHash )
    );
    assert.ok(
      newTreeVariants.length > 0,
      'changed source image should produce variants with a different hash in cache'
    );

    // HTML should reference the new hash, not the original
    const $ = cheerio.load( second.html );
    const treeSources = $( 'picture source' ).filter( ( _i, source ) => {
      const srcset = $( source ).attr( 'srcset' ) || '';
      return srcset.includes( 'tree-' );
    } );

    assert.ok( treeSources.length > 0, 'should have source elements for tree image' );
    const srcset = treeSources.first().attr( 'srcset' );
    assert.ok(
      !srcset.includes( originalHash ),
      'HTML should reference the new hash, not the original'
    );
  } );

  it( 'should cache background image variants across builds', async () => {
    removeDir( buildDir );
    removeDir( cacheDirAbs );

    const bgOptions = {
      ...pluginOptions,
      processUnusedImages: true
    };

    // First build generates both HTML and background variants in cache
    const first = await runBuild( fixturesDir, buildDir, bgOptions, true );
    assert.ok( first.cacheFiles.length > 0, 'first build should populate cache' );

    // Identify background variants (no hash in filename, pattern: name-NNNw.ext)
    const bgVariants = first.cacheFiles.filter( ( f ) => /^[^-]+-\d+w\.\w+$/.test( f ) );

    // Second build should find existing background variants in cache
    const second = await runBuild( fixturesDir, buildDir, bgOptions, true );

    // All background variants from the first build should still be in the cache
    for ( const bgFile of bgVariants ) {
      assert.ok(
        second.cacheFiles.includes( bgFile ),
        `background variant ${bgFile} should be present in cache after second build`
      );
    }
  } );

  it( 'should not add variant files to the Metalsmith files object when cache is enabled', async () => {
    removeDir( buildDir );
    removeDir( cacheDirAbs );

    // Use a plugin after optimize-images to inspect the files object
    let filesSnapshot = {};

    const inspectorPlugin = ( files, _metalsmith, done ) => {
      filesSnapshot = { ...files };
      done();
    };

    await new Promise( ( resolve, reject ) => {
      Metalsmith( fixturesDir )
        .clean( true )
        .source( 'src' )
        .destination( buildDir )
        .use( optimizeImages( pluginOptions ) )
        .use( inspectorPlugin )
        .build( ( err ) => {
          if ( err ) {
            return reject( err );
          }
          resolve();
        } );
    } );

    // No responsive variant files should be in the files object
    const variantKeys = Object.keys( filesSnapshot ).filter(
      ( key ) => key.startsWith( pluginOptions.outputDir )
    );
    assert.strictEqual(
      variantKeys.length,
      0,
      'variant files should NOT be in the Metalsmith files object when cache is enabled'
    );

    // But cache directory should have files
    const cacheFiles = fs.readdirSync( cacheDirAbs );
    assert.ok( cacheFiles.length > 0, 'cache directory should contain variant files' );
  } );
} );
