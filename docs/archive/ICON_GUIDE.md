# PWA Icon Generation Instructions

## Current Status
- Icons need to be generated from `/public/icon.svg`
- The SVG contains a modern "PHYSI" logo with cyan gradient

## Generate Icons Locally

```bash
# Option 1: Using ImageMagick
convert public/icon.svg -background white -define icon:auto-resize=192,512 public/icon.png

# Option 2: Using SVGO + Canvas
npx svgo public/icon.svg -o public/icon-optimized.svg
node scripts/generate-icons.js

# Option 3: Manual generation
# Open public/icon.svg in browser
# Use online converter like https://realfavicongenerator.net/
# Or use Figma to export 192x192 and 512x512 PNGs
```

## Icon Specifications
- **192x192**: `public/icon-192.png` - for homescreen
- **512x512**: `public/icon-512.png` - for app installation
- Both should have transparent background where possible
- Purpose: `any maskable` for flexible display

## Alternative: Use Colorful Squares (Quick Fix)

If SVG conversion fails, create solid color icons:
```bash
# Cyan square
convert -size 512x512 xc:"#06b6d4" public/icon-512.png
convert -size 192x192 xc:"#06b6d4" public/icon-192.png

# Add white "P" text
convert public/icon-512.png -gravity center -pointsize 200 -fill white -draw "text 0,0 'P'" public/icon-512.png
```

## Verify
```bash
# Check files exist and are valid
file public/icon-*.png
# Should show: PNG image data, 192 x 192, 8-bit/color RGB
```