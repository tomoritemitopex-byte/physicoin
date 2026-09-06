# PHYSI Design Refresh — 2026-09-06

## User Preference (Samuel Tomori / DREAM)
- **Design complaint**: "the design looks like a 1980 design old"
- **Solution**: White-paper aesthetic with coral accent instead of dark forest glass everywhere

## Palette Migration

| Token | Old | New | Rationale |
|-------|-----|-----|-----------|
| Page bg | `#0d3b2a` solid | `#fdf6e3` paper | Light is more readable, modern |
| Card bg | `#1a5f48` glass | `#ffffff` paper | No glass, subtle shadow |
| Accent | `#34d399` mint | `#ff6b6b` coral | Warmer, more human |
| CTA text | `#022c1e` | `#ffffff` | Better contrast on coral |
| Forest | Page wash | Depth only | Retained for rail/header |

## CSS Migration Guide

### Before (Old)
```css
:root {
  --physi-bg: #0d3b2a;
  --physi-card: #1a5f48;
  --physi-accent: #34d399;
}
.physi-card {
  backdrop-filter: blur(12px);
  background: var(--physi-card);
}
```

### After (New Dawn)
```css
:root {
  --physi-paper: #fdf6e3;
  --physi-card: #ffffff;
  --physi-accent: #ff6b6b;
}
.physi-card {
  backdrop-filter: none;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
```

## Implementation Notes

1. Theme is now controlled by `NEXT_PUBLIC_THEME` env var
2. Dawn is default, forest available via `NEXT_PUBLIC_THEME=forest`
3. Icons generated: `scripts/generate-pwa-icons.py`
4. See `:skills:physi-design-system` for full design system

## Files Changed

| File | Change |
|------|--------|
| `globals.css` | New CSS tokens, removed glass from cards |
| `app/page.tsx` | Migrated to CSS vars |
| `app/layout.tsx` | Migrated to CSS vars |
| `theme.ts` | Added dawn theme, env-based selection |
| `public/icon-*.png` | Generated new icons |
| `public/manifest.json` | Updated icons, background_color |
| `public/sw.js` | Added skipWaiting/activation |