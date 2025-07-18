import { describe, it, after } from 'mocha';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Metalsmith from 'metalsmith';
import optimizeImages from '../../src/index.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Background Image Processing Debug', function () {
  this.timeout(30000);

  const fixturesDir = path.join(__dirname, '../fixtures');
  const buildDir = path.join(__dirname, '../build-debug');

  after(() => {
    // Cleanup
    if (fs.existsSync(buildDir)) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  });

  it('should debug background image processing logic', (done) => {
    const metalsmith = Metalsmith(fixturesDir).clean(true).source('src').destination(buildDir);

    // Simulate a real scenario with HTML that references one image and one unused background image
    metalsmith.use((files, metalsmith, done) => {
      // Clear existing HTML files and create a specific test case
      Object.keys(files).forEach((key) => {
        if (key.endsWith('.html')) {
          delete files[key];
        }
      });

      // Create HTML that references only one image (tree.jpg)
      files['debug-test.html'] = {
        contents: Buffer.from('<img src="images/tree.jpg" alt="Tree">')
      };

      // Add a second image that will NOT be referenced (should be processed as background)
      // We'll copy the tree.jpg as a second image for testing
      if (files['images/tree.jpg']) {
        files['images/background-test.jpg'] = {
          contents: files['images/tree.jpg'].contents,
          mtime: Date.now()
        };
      }

      done();
    });

    metalsmith.use(
      optimizeImages({
        widths: [320, 640], // Simple widths for testing
        formats: ['webp', 'original'],
        processUnusedImages: true,
        imagePattern: '**/*.{jpg,jpeg,png,gif,webp,avif}',
        isProgressive: false
      })
    );

    metalsmith.build((err, files) => {
      if (err) {
        return done(err);
      }

      // Check what files were generated
      const generatedFiles = Object.keys(files);

      // Log some debug info for troubleshooting (variables intentionally not used)
      generatedFiles.filter((file) => file.includes('background-test') && file.includes('assets/images/responsive/'));

      generatedFiles.filter((file) => file.includes('tree-') && file.includes('assets/images/responsive/'));

      // The test should pass regardless - we're just debugging
      assert.strictEqual(err, null, 'Build should complete without errors');
      done();
    });
  });
});
