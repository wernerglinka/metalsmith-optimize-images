const { describe, it } = require('mocha');
const assert = require('node:assert');
const optimizeImages = require('../lib/index.cjs');

describe('metalsmith-optimize-images (CommonJS)', function() {
  it('should be a function', function() {
    assert.strictEqual(typeof optimizeImages, 'function');
  });
  
  it('should return a function', function() {
    assert.strictEqual(typeof optimizeImages(), 'function');
  });
});