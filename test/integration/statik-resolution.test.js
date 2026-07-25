/**
 * Regression tests for the statik-copied-images bug (bugreport.md).
 *
 * Scenario: a site's images live under the Metalsmith source directory but
 * are excluded from the file tree and copied to the build at finalization
 * (metalsmith.statik(['assets'])). Simulated here with .ignore('assets/**'),
 * which produces the identical plugin-time state: images on disk under
 * source(), absent from the files object, absent from build/.
 *
 * Invariants under test:
 * - a clean build rewrites pages with hashed variants (resolution via source())
 * - output is identical whether build/ is empty or populated (determinism)
 * - cold-cache and warm-cache builds emit the same, aspect-correct dimensions
 * - background processing honors the imageFolder option
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturesDir = path.join(__dirname, '../fixtures');
const tempRoot = path.join(__dirname, '../temp-statik');

/**
 * Create a minimal statik-style project: HTML in the file tree, images on
 * disk under source() but ignored so they never enter the files object.
 * @param {string} name - Project directory name under tempRoot
 * @param {string} html - Contents of src/index.html
 * @return {{projectDir: string, buildDir: string}}
 */
function createStatikProject(name, html) {
  const projectDir = path.join(tempRoot, name);
  const imagesDir = path.join(projectDir, 'src/assets/images');
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.copyFileSync(path.join(fixturesDir, 'src/images/tree.jpg'), path.join(imagesDir, 'tree.jpg'));
  fs.writeFileSync(path.join(projectDir, 'src/index.html'), html);
  return { projectDir, buildDir: path.join(projectDir, 'build') };
}

/**
 * Run a build for a statik-style project and return the emitted index.html.
 * @param {string} projectDir - Metalsmith project directory
 * @param {string} buildDir - Destination directory
 * @param {Object} pluginOptions - optimizeImages options
 * @param {boolean} clean - Whether Metalsmith wipes the destination first
 * @return {Promise<string>} - Contents of build/index.html
 */
function buildStatik(projectDir, buildDir, pluginOptions, clean = true) {
  return new Promise((resolve, reject) => {
    Metalsmith(projectDir)
      .clean(clean)
      .destination(buildDir)
      .ignore('assets/**')
      .use(optimizeImages(pluginOptions))
      .build((err) => {
        if (err) {
          return reject(err);
        }
        resolve(fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8'));
      });
  });
}

describe('statik-copied image resolution', () => {
  before(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
  });

  after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('rewrites pages on a clean build when images only exist under source()', async () => {
    const { projectDir, buildDir } = createStatikProject(
      'clean-build',
      '<html><body><img src="/assets/images/tree.jpg" alt="Tree"></body></html>'
    );

    const html = await buildStatik(projectDir, buildDir, {
      widths: [320, 640],
      formats: ['webp', 'original'],
      processUnusedImages: false
    });

    // Hashed variants in a <picture> element — the HTML-driven path ran
    assert.match(html, /<picture>/);
    assert.match(html, /srcset="[^"]*tree-320w-[a-f0-9]+\.webp 320w/);
    assert.match(html, /srcset="[^"]*tree-640w-[a-f0-9]+\.webp 640w/);

    // Variants were added to the files object and written to the build
    const responsiveDir = path.join(buildDir, 'assets/images/responsive');
    const variants = fs.readdirSync(responsiveDir).filter((f) => f.includes('-w') || /-\d+w-/.test(f));
    assert.ok(variants.length >= 4, `Expected variants in ${responsiveDir}, found: ${variants.join(', ')}`);
  });

  it('emits aspect-correct width/height on the very first build', async () => {
    const { projectDir, buildDir } = createStatikProject(
      'dimensions',
      '<html><body><img src="/assets/images/tree.jpg" alt="Tree"></body></html>'
    );

    const html = await buildStatik(projectDir, buildDir, {
      widths: [320, 640],
      formats: ['webp', 'original'],
      processUnusedImages: false
    });

    // tree.jpg is 1000x576; 640 / 1000 * 576 = 368.64 → 369
    assert.match(html, /width="640"/);
    assert.match(html, /height="369"/);
    assert.doesNotMatch(html, /height="576"/, 'source height must not leak into variant dimensions');
  });

  it('produces identical markup over an empty and a populated build directory', async () => {
    const { projectDir, buildDir } = createStatikProject(
      'determinism',
      '<html><body><img src="/assets/images/tree.jpg" alt="Tree"></body></html>'
    );
    const options = {
      widths: [320, 640],
      formats: ['webp', 'original'],
      processUnusedImages: false
    };

    const cleanHtml = await buildStatik(projectDir, buildDir, options, true);
    const incrementalHtml = await buildStatik(projectDir, buildDir, options, false);

    assert.equal(incrementalHtml, cleanHtml, 'clean and incremental builds must emit identical markup');
  });

  it('emits the same dimensions on cold and warm cache builds', async () => {
    const { projectDir, buildDir } = createStatikProject(
      'cache-dimensions',
      '<html><body><img src="/assets/images/tree.jpg" alt="Tree"></body></html>'
    );
    const options = {
      widths: [320, 640],
      formats: ['webp', 'original'],
      processUnusedImages: false,
      cache: 'src/assets/images/responsive'
    };

    const coldHtml = await buildStatik(projectDir, buildDir, options, true);
    const warmHtml = await buildStatik(projectDir, buildDir, options, true);

    // The cache directory was populated by the first run
    const cacheDir = path.join(projectDir, 'src/assets/images/responsive');
    assert.ok(fs.readdirSync(cacheDir).length > 0, 'first build must populate the cache');

    const dims = (html) => {
      const m = html.match(/width="(\d+)" height="(\d+)"/);
      return m ? { width: m[1], height: m[2] } : null;
    };

    assert.deepEqual(dims(coldHtml), { width: '640', height: '369' });
    assert.deepEqual(dims(warmHtml), dims(coldHtml), 'cold and warm cache builds must agree on dimensions');
  });

  it('honors the imageFolder option for background image processing', async () => {
    const projectDir = path.join(tempRoot, 'image-folder');
    const bgDir = path.join(projectDir, 'src/backgrounds');
    fs.mkdirSync(bgDir, { recursive: true });
    fs.copyFileSync(path.join(fixturesDir, 'src/images/tree.jpg'), path.join(bgDir, 'bg1.jpg'));
    fs.writeFileSync(path.join(projectDir, 'src/index.html'), '<html><body><h1>No images</h1></body></html>');
    const buildDir = path.join(projectDir, 'build');

    await new Promise((resolve, reject) => {
      Metalsmith(projectDir)
        .clean(true)
        .destination(buildDir)
        .ignore('backgrounds/**')
        .use(
          optimizeImages({
            formats: ['webp'],
            processUnusedImages: true,
            imageFolder: 'backgrounds'
          })
        )
        .build((err) => (err ? reject(err) : resolve()));
    });

    // tree.jpg is 1000px wide → 1x (1000w) and 2x (500w) background variants
    const responsiveDir = path.join(buildDir, 'assets/images/responsive');
    const generated = fs.existsSync(responsiveDir) ? fs.readdirSync(responsiveDir) : [];
    assert.ok(generated.includes('bg1-1000w.webp'), `Expected bg1-1000w.webp, found: ${generated.join(', ')}`);
    assert.ok(generated.includes('bg1-500w.webp'), `Expected bg1-500w.webp, found: ${generated.join(', ')}`);
  });
});
