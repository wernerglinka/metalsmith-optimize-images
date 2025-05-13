/**
 * NOTE: This file is no longer needed for normal testing.
 *
 * The plugin test suite now uses real image files located in:
 * test/fixtures/src/images/
 *
 * These include:
 * - buildings.png
 * - industry.jpg
 * - people.jpg
 * - tree.jpg
 * - work.jpg
 *
 * This script is kept for reference or if you need to generate
 * additional test images with specific dimensions.
 */

import fs from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';

// Create test directory if it doesn't exist
const imageDir = path.join(process.cwd(), 'test/fixtures/src/images');
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

// Function to create a test image
// Export the function so it can be used by other modules if needed
export function createTestImage(filename, width, height, color = '#3498db') {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fill background
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  // Add a shape
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, Math.min(width, height) / 3, 0, Math.PI * 2);
  ctx.fill();

  // Add text
  ctx.fillStyle = '#000000';
  ctx.font = `${Math.max(width / 10, 20)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${width}x${height}`, width / 2, height / 2);

  // Save the image
  const buffer = canvas.toBuffer('image/jpeg');
  fs.writeFileSync(path.join(imageDir, filename), buffer);

  console.warn(`Created test image: ${filename} (${width}x${height})`);
}

// Create additional test images if needed - uncomment to use
/*
createTestImage('custom-test-image.jpg', 1200, 800, '#3498db'); // Blue
createTestImage('custom-test-image-2.jpg', 800, 600, '#e74c3c'); // Red
createTestImage('custom-test-image-3.jpg', 600, 400, '#2ecc71'); // Green
createTestImage('custom-test-image-4.jpg', 1920, 1080, '#9b59b6'); // Purple
createTestImage('custom-test-image-5.jpg', 400, 300, '#f39c12'); // Orange
*/

console.warn('This script is no longer needed for standard tests. Real images are now used.');
