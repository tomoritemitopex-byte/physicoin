#!/usr/bin/env python3
"""Generate PWA icons from SVG template."""
from PIL import Image, ImageDraw, ImageFont
import os

def generate_physi_icons():
    """Generate PHYSI PWA icons."""
    sizes = [192, 512]
    
    for size in sizes:
        # Create image with gradient background
        img = Image.new('RGBA', (size, size), (255, 255, 255, 255))
        draw = ImageDraw.Draw(img)
        
        # Draw gradient background (sky to forest)
        for y in range(size):
            progress = y / size
            r = int(110 - (110 - 25) * progress)  # #6d7952 to #1a5f48
            g = int(211 - (211 - 15) * progress)  # #d399 to #eff2e8
            b = int(42 - (42 - 74) * progress)    # #2a to #4a
            draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
        
        # Draw coral "P" mark
        coral = (255, 107, 107)
        margin = size // 8
        
        # Draw a simple "P" shape
        p_width = size - 2 * margin
        p_height = size - 2 * margin
        thick = p_width // 8
        
        # P backbone
        draw.rectangle(
            [margin, margin, margin + thick, margin + p_height],
            fill=coral
        )
        # P loop
        loop_center_x = margin + p_width // 2
        loop_radius = p_width // 4
        draw.ellipse([
            loop_center_x - loop_radius, margin,
            loop_center_x + loop_radius, margin + p_height // 2
        ], fill=coral)
        
        # Save
        filepath = f'/home/tomoritemitopex/physicoin/public/icon-{size}.png'
        img.save(filepath, 'PNG', optimize=True)
        file_size = os.path.getsize(filepath)
        print(f"Generated {filepath}: {size}x{size}, {file_size} bytes")

if __name__ == '__main__':
    generate_physi_icons()
    print("\nIcons generated successfully!")