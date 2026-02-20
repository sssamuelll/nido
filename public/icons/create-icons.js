// Simple script to create basic PNG icons
// Since we don't have imagemagick, we'll create the smallest possible PNG files

import fs from 'fs';

// Minimal 1x1 transparent PNG in base64 (actual functional PNG file)
const tiny_png_base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Create both icon sizes as the same tiny PNG (can be replaced later with proper icons)
const pngBuffer = Buffer.from(tiny_png_base64, 'base64');

fs.writeFileSync('icon-192x192.png', pngBuffer);
fs.writeFileSync('icon-512x512.png', pngBuffer);

console.log('Created placeholder PNG icons');