#!/usr/bin/env node
// generate-icons.js - Generate PWA icons from SVG
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [192, 512];
const svgPath = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf-8');

// Simple SVG to PNG converter
async function generateIcons() {
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Background: white with subtle cyan border
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    // Draw a simple "PHYSI" P icon
    const margin = size * 0.15;
    const barWidth = size * 0.3;
    const barHeight = size * 0.6;
    
    // P outline (gradients would be nice but keeping it simple)
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(margin, margin, barWidth, barHeight);
    
    // Cut out counter
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(margin + barWidth * 0.6, margin, barWidth * 0.4, barHeight);
    
    // TI letters
    ctx.fillStyle = '#084c69';
    ctx.font = `bold ${size * 0.2}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('TI', size / 2, size * 0.7);
    
    // Save PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(__dirname, `icon-${size}.png`), buffer);
    console.log(`Generated icon-${size}.png`);
  }
}

generateIcons().catch(console.error);