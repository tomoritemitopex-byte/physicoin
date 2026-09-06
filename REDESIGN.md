# PHYSI Redesign — Modern Student Timetable

## Visual Refresh Proposal

### Color Palette Evolution
| Role | Old | New | Why |
|------|-----|-----|-----|
| Primary | `#0d3b2a` (forest) | `#084c69` (deep teal) | Cleaner, more modern, better contrast |
| Secondary | `#34d399` (mint) | `#06b6d4` (cyan) | Crisp tech, modern AI aesthetic |
| Accent | `#fbbf24` (gold) | `#f97316` (amber) | Warmer, more inviting |
| Success | `#10b981` | `#22c55e` (emerald) | Brighter confirmation |
| Warning | `#f59e0b` | `#f97316` (amber) | Unified with accent |
| Background | `#0d3b2a` | Gradient: `#f0fdfa` → `#e0f2fe` | Soft sky-to-forest at top |

### Typography
- **Headings**: `Inter` (cleaner sans-serif) + `Playfair Display` for hero
- **Body**: `Inter` 400/500/600
- **Monospace**: `JetBrains Mono` for data/status

### Component Styles
1. **Event Cards**: 
   - Rounded corners (16px, not 18px)
   - Subtle elevation (shadow-sm instead of 8px blur)
   - Gradient border on verified (cyan→transparent)

2. **Road Map**:
   - Solid path (not dashed) with cyan glow
   - Building nodes: 56px circles with subtle shadow
   - Level numbers inside icons (not badges)

3. **CTA Buttons**:
   - Cyan background (`bg-cyan-500`)
   - White text (`text-white`)
   - Hover: scale(1.02) + shadow transition

4. **GBA Icons** (for PWA app icons):
   - Simplified "P" for PHYSI
   - 3D extrusion effect
   - Cyan fill with teal shadow