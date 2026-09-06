#!/usr/bin/env node
/**
 * scripts/generate-pwa-icons.mjs — export PWA PNGs from public/icon.svg
 * Requires: sharp (npm i -D sharp)
 * Usage: node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const sizes = [
  { file: 'public/pwa-192.png', size: 192 },
  { file: 'public/pwa-512.png', size: 512 },
  { file: 'public/pwa-512-maskable.png', size: 512 }, // same source, maskable safe already 80%
  { file: 'public/apple-touch-icon.png', size: 180 },
];

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Missing sharp. Run: npm i -D sharp');
    console.error('Falling back: icon.svg is the source — PNGs must be exported with sharp/resvg.');
    process.exit(1);
  }
  const svg = fs.readFileSync('public/icon.svg');
  for (const { file, size } of sizes) {
    const out = path.resolve(file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(svg, { density: 300 }).resize(size, size, { fit: 'contain', background: { r: 13, g: 59, b: 42, alpha: 1 } }).png().toFile(out);
    console.log(`✓ ${file} ${size}×${size}`);
  }
  console.log('Done. Validate: file public/pwa-*.png && python3 -m json.tool public/manifest.json');
}

main().catch(e => { console.error(e); process.exit(1); });
