# PHYSI Visual Refresh — Design Swatch 2026-09-06

**Browser Agent:** Design Swatch Browser · **Source:** `physicoin.vercel.app` (local `physicoin/app/globals.css` + `lib/adapters/theme.ts`)  
**Status:** `proposal` — no code migrated yet. This spec is the single source for the refresh.

---

## 1. Audit — Current Look (Forest Mint/Gold)

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Page bg | `--physi-bg` | `#0d3b2a` | Full-screen solid forest, `body` + header `bg-[#0d3b2a]/80` |
| Card | `--physi-card` | `#1a5f48` | `.physi-card`, `.liquid-glass rgba(26,95,72,0.55)`, one-rail |
| Border | `--physi-border` | `rgba(52,211,153,0.15)` | cards, glass, rail |
| Border strong | `--physi-border-strong` | `rgba(52,211,153,0.24)` | hover |
| Accent / CTA | `--physi-accent` | `#34d399` mint | `.primary-cta bg`, focus ring, `text-forest`, road glow |
| Accent hover | `--physi-accent-hover` | `#6ee7b7` | CTA hover |
| Highlight | `--physi-highlight` | `#fbbf24` gold | verified badge, clock tower, urgency fill mid-stop |
| Cream text | `--physi-cream` | `#f0fdf4` | `body color`, cream |
| Shadow | `--physi-shadow` | `#022c1e` | CTA text, deepest bg |
| Muted | `--physi-muted` | `rgba(240,253,244,0.70)` | secondary text |
| Muted 2 | `--physi-muted-2` | `rgba(240,253,244,0.50)` | tertiary |

**Patterns:** liquid-glass `backdrop-filter: blur(14-20px) saturate(1.2)`, `ghost-drift 1200ms ease-in-out infinite`, dashed road `stroke-dasharray 12 8` + `pathDashFlow 1.8s`, `one-rail` pill bottom nav, `.physi-card border-radius 20px`.

**Pain points observed:**
- Solid `#0d3b2a` everywhere = flat, heavy, poor daylight readability.
- Mint `#34d399` on forest is energetic but cold (clinical) — not campus-warm.
- `f0fdf4` cream is slightly green-tinted, not warm.
- 20px radius + glass blur on *every* surface = no hierarchy.
- Ghost drift on everything = distracting at scale.
- PWA icons are placeholder (`pwa-192.png` generic) — no real mark, no maskable safe zone.

---

## 2. Proposal — Soft Sky-to-Forest with Coral

### 2.1 Concept
> **Vault in the Valley at Dawn.** Keep the forest identity but lift it: cream paper opens to sky, forest sinks to depth, coral is the human spark (warm, urgent, friendly — not clinical mint).

- Light mode default (cream paper) with ink-on-paper typography — far better PWA daylight use.
- Forest retained as *depth* (rail, header, footer), not page wash.
- Gradient is **vertical** `cream → sky tint → forest mist` — subtle, never candy.

### 2.2 Color Tokens (new :root)

```css
:root {
  /* — surfaces — */
  --paper:        #fdf6e3; /* warmer cream (was f0fdf4/f7f5ef) — primary page */
  --paper-2:      #f3ead3; /* card inner / field bg */
  --paper-3:      #ede5cc; /* pressed / muted surface */
  --ink:          #0f1f1a; /* body text on paper (was 070a12) */
  --ink-2:        #1c332b; /* headings on paper */
  --stone:        #9aa99d; /* secondary label */
  --stone-2:      #c2b8a3; /* on-dark muted */

  /* — forest depth (kept, narrowed) — */
  --forest:       #0d3b2a;
  --forest-2:     #143d2e;
  --forest-3:     #1a4d3a;
  --shadow:       #071a12;

  /* — accents — */
  --coral:        #ff6b6b; /* PRIMARY accent replaces mint #34d399 */
  --coral-hover:  #ff8787;
  --coral-soft:   rgba(255,107,107,0.14);
  --coral-border: rgba(255,107,107,0.24);
  --coral-ring:   0 0 0 2px #fdf6e3, 0 0 0 4px #ff6b6b;

  --mint:         #2ec4a3; /* retained as secondary (verified/ghost), de-emphasized */
  --mint-soft:    rgba(46,196,163,0.12);
  --gold:         #f5b94d; /* warmer than fbbf24, for verified/warning */
  --gold-soft:    rgba(245,185,77,0.14);
  --amber:        #f59e0b;

  /* — semantic — */
  --success:      #12b981; /* verified tick (uses mint family) */
  --warning:      #f59e0b;
  --danger:       #ff6b6b; /* uses coral */

  /* — borders on paper — */
  --contour:         rgba(15,31,26,0.12);
  --contour-strong:  rgba(15,31,26,0.18);
  --contour-ink:     rgba(253,246,227,0.10);
  --contour-ink-strong: rgba(253,246,227,0.16);

  /* — background gradient — */
  --bg-gradient: linear-gradient(
    180deg,
    #fdf6e3 0%,
    #e8f6f0 42%,
    #dbeafe 68%,
    #0d3b2a 100%
  );
  --bg-gradient-soft: linear-gradient(180deg, #fdf6e3 0%, #eef7f1 55%, #e0efe8 100%);
}
```

**Mapping table (old → new):**

| Role | Old | New | Note |
|------|-----|-----|------|
| Page background | `#0d3b2a` solid | `var(--bg-gradient)` sky→forest | Soft, airy, keeps forest at depth |
| Primary CTA/accent | `#34d399` mint | `#ff6b6b` coral | Warmer, more human/urgent |
| CTA text | `#022c1e` | `#ffffff` | WCAG AA on coral (4.6:1) |
| Cream/paper | `#f0fdf4` | `#fdf6e3` | Warmer, parchment-like |
| Card fill | `#1a5f48` solid glass | `#ffffff`/`#fdf6e3` with `1px contour` + soft shadow | Hierarchy: paper cards, forest only for depth layers |
| Gold highlight | `#fbbf24` | `#f5b94d` | Slightly softer, less neon |
| Border | `rgba(52,211,153,0.15)` | `rgba(15,31,26,0.12)` on paper; `rgba(253,246,227,0.10)` on forest | Context-aware |
| Muted | `rgba(240,253,244,0.70)` | `rgba(15,31,26,0.62)` on paper; `rgba(253,246,227,0.68)` on forest | Proper contrast on light |
| Success | `#34d399` | `#12b981` / `#2ec4a3` | Keep mint lineage for verified |

**Tailwind extension (`tailwind.config.ts`):**

```ts
colors: {
  paper:  { DEFAULT: '#fdf6e3', 2: '#f3ead3', 3: '#ede5cc' },
  ink:    { DEFAULT: '#0f1f1a', 2: '#1c332b' },
  stone:  { DEFAULT: '#9aa99d', 2: '#c2b8a3' },
  coral:  { DEFAULT: '#ff6b6b', hover: '#ff8787', soft: 'rgba(255,107,107,0.14)' },
  forest: { DEFAULT: '#0d3b2a', 2: '#143d2e', 3: '#1a4d3a' },
  // legacy aliases kept for migration:
  physi:  { bg: '#fdf6e3', card: '#ffffff', accent: '#ff6b6b', shadow: '#071a12' }
}
```

**ThemeAdapter (`lib/adapters/theme.ts`) add `dawn` variant:**

```ts
const dawn: ThemeAdapter = {
  id: 'dawn', name: 'Dawn Valley', variant: 'dawn',
  tokens: {
    bg: '#fdf6e3', card: '#ffffff',
    border: 'rgba(15,31,26,0.12)', muted: '#6b7d74',
    accent: '#ff6b6b', accentFg: '#ffffff',
    success: '#12b981', warning: '#f59e0b',
    cssVars: {
      '--physi-bg': '#fdf6e3',
      '--physi-card': '#ffffff',
      '--physi-border': 'rgba(15,31,26,0.12)',
      '--physi-accent': '#ff6b6b',
      '--physi-accent-fg': '#ffffff',
      '--physi-success': '#12b981',
      '--physi-warning': '#f59e0b',
      '--physi-shadow': '#071a12',
      '--paper': '#fdf6e3',
      '--coral': '#ff6b6b',
    }
  },
  twColors: { physi: { bg: '#fdf6e3', card: '#ffffff', accent: '#ff6b6b' }, coral: '#ff6b6b' }
};
registerTheme(dawn); // set as default => getDefaultTheme() returns dawn
```

---

### 2.3 Background System

**Recommendation:** not a full-screen gradient wash. Use layered depth:

```css
body {
  background: var(--paper);
  color: var(--ink);
}

/* fixed sky-to-forest wash — very subtle, behind content */
body::before {
  content: "";
  position: fixed; inset: 0; z-index: -1;
  background:
    radial-gradient(900px 520px at 50% -10%, rgba(219,234,254,0.9) 0%, transparent 62%),
    radial-gradient(700px 420px at 85% 6%, rgba(186,230,204,0.55) 0%, transparent 60%),
    linear-gradient(180deg, #fdf6e3 0%, #eef7f1 52%, #e8f2ec 100%);
  pointer-events: none;
}

/* forest depth only at shell edges */
.shell-landing { background: transparent; }
.shell-landing__header { background: rgba(13,59,42,0.84); backdrop-filter: blur(12px) saturate(1.1); }
.vault-canvas { background: var(--paper); /* not forest */ }
.strata-rail, .altitude-bar { background: var(--forest-2); } /* forest kept for nav */
```

**Why sky→forest but not `f0fdfa→e0f2fe` harsh:** `#f0fdfa`/`#e0f2fe` are cold cyan. `#fdf6e3`/`#dbeafe` at low opacity keeps warmth while adding air.

---

### 2.4 Typography — Cleaner

| Role | Now | Proposed | Rationale |
|------|-----|----------|-----------|
| Display / hero | `Instrument Serif 400` | `Instrument Serif 400` **keep** — distinctive, keep | Brand equity |
| Display fallback | — | `Fraunces opsz 9..144` if Instrument unavailable | Softer on light paper |
| Body | `Fredoka` (rounded, playful) | `Inter 400/500/600` | Cleaner, better at small sizes, better tabular numbers for timetable |
| Mono / data | `Geist Mono` / `JetBrains Mono` | `JetBrains Mono 400/500` **keep** | Good, keep |
| Label | `mono 10px 0.14em uppercase` | Same scale but `Inter 11px 600 0.10em` for pill labels | More legible on paper |

**Scale:**

```css
:root {
  --font-display: "Instrument Serif", Georgia, serif;
  --font-body: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
h1 { font-family: var(--font-display); font-size: clamp(36px, 5vw, 56px); line-height: 0.96; letter-spacing: -0.03em; }
h2 { font-family: var(--font-display); font-size: clamp(22px, 2.6vw, 28px); }
.body { font-family: var(--font-body); font-size: 15px; line-height: 1.6; }
.label { font-family: var(--font-body); font-size: 11px; font-weight: 600; letter-spacing: 0.10em; text-transform: uppercase; }
.mono { font-family: var(--font-mono); font-size: 12px; }
```

**Fredoka migration:** keep as `var(--font-fredoka)` alias for one release, but default body becomes Inter. Fredoka stays only for playful ghost/empty-state moments if desired.

---

### 2.5 Component Styles (delta from current)

#### Cards — from glass to paper strata

```css
/* was: .physi-card { border-radius:20px; background:#1a5f48; backdrop-filter:blur(12px); border: rgba(52,211,153,0.15) } */
.physi-card {
  background: #ffffff;
  border: 1px solid var(--contour);
  border-radius: 16px; /* was 20px — tighter, modern */
  box-shadow: 0 1px 2px rgba(15,31,26,0.06), 0 8px 24px rgba(15,31,26,0.08);
  /* remove backdrop-filter on light — keep only on forest surfaces */
}
.physi-card:hover { border-color: var(--contour-strong); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(15,31,26,0.10); }

/* verified accent — coral left rule + subtle glow */
.physi-card--verified { border-left: 3px solid var(--coral); }
.physi-card--verified::after { /* keep strata line but coral */ background: linear-gradient(90deg, var(--coral), transparent); }

/* glass kept only for forest overlays */
.liquid-glass--forest {
  background: rgba(13,59,42,0.58);
  backdrop-filter: blur(14px) saturate(1.15);
  border: 1px solid rgba(253,246,227,0.12);
}
```

#### Buttons — rounded pill, coral primary

```css
.primary-cta {
  background: var(--coral); /* #ff6b6b */
  color: #ffffff;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.01em;
  padding: 12px 20px;
  border-radius: 9999px; /* pill — keep */
  box-shadow: 0 4px 16px rgba(255,107,107,0.28);
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.primary-cta:hover { background: var(--coral-hover); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(255,107,107,0.34); }
.primary-cta:active { transform: translateY(0); }

.secondary-cta {
  background: #ffffff;
  color: var(--ink);
  border: 1px solid var(--contour);
  border-radius: 9999px;
  padding: 12px 20px;
  font-weight: 600;
}
.secondary-cta:hover { border-color: var(--contour-strong); background: var(--paper-2); }

/* new: compact pill for inline actions */
.pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border-radius: 9999px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  border: 1px solid var(--contour);
  background: var(--paper-2);
}
.pill--coral { background: var(--coral-soft); border-color: var(--coral-border); color: #c53030; }
```

**Keep pill radius `9999px` — task says rounded buttons. For cards, 16px is the sweet spot (not 18/20).**

#### Road & Building Nodes — keep delight, tune palette

- Path: keep serpentine SVG, but move glow from mint to coral/mint duo: `shadow #071a12 @ 18px`, `glow coral @ 0.18` + `mint @ 0.12` layered.
- Nodes: keep 60px, 16px radius, but verified uses coral ring, waiting uses sky ` #38bdf8`, almost uses `coral`, verified uses `mint/success`.
- Ghost drift: keep but reduce to `900ms` and only on `.ghost-dot` / `.ghost-avatar-mini`, not on whole cards. Respect `prefers-reduced-motion`.

```css
.road-path-glow { stroke: var(--coral); opacity: 0.22; }
.road-path-glow--mint { stroke: var(--mint); opacity: 0.14; }
.building-node.active .node-icon { border-color: rgba(255,107,107,0.55); box-shadow: 0 0 20px rgba(255,107,107,0.28); }
```

#### Event Row (WhatsApp-style) — paper variant

```css
.whatsapp-event {
  background: #ffffff;
  border: 1px solid var(--contour);
  border-radius: 16px; /* was 18px */
  padding: 14px 16px;
  box-shadow: 0 1px 3px rgba(15,31,26,0.06);
}
.whatsapp-event:hover { border-color: var(--contour-strong); background: #ffffff; }
.whatsapp-event .event-time { color: var(--coral); }
.urgency-fill { background: linear-gradient(90deg, var(--mint), var(--gold), var(--coral)); }
```

#### One Rail (bottom nav)

```css
.one-rail {
  background: rgba(13,59,42,0.92); /* keep forest — anchors the light page */
  border: 1px solid rgba(253,246,227,0.12);
  border-radius: 9999px;
  box-shadow: 0 12px 40px rgba(7,26,18,0.45);
}
.one-rail a[aria-current="page"] { background: var(--paper); color: var(--ink); }
```

---

### 2.6 Motion (restrained)

- Keep: `ghost-drift 900ms`, `pathDashFlow 1.8s` (reduce dash opacity on light theme — `0.22` not `0.35`).
- Remove: glass shimmer on paper cards — keep only on forest hero.
- Add: `prefers-reduced-motion` already correct — ensure coral pulse respects it.

---

## 3. PWA Icons — Real Mark (was placeholder)

### 3.1 Current

```
public/pwa-192.png  944 B  — generic, no mark
public/pwa-512.png  4251 B — generic
manifest.json: background_color #0d3b2a, theme_color #0d3b2a, icons purpose maskable only
manifest screenshots: /pwa-splash.png 1280x720 (file missing locally)
```

### 3.2 Proposed

**Design:**
- Glyph: custom **“P”** monogram for PHYSI — geometric, 12° italic, rounded terminal, negative-space pin (hall marker) in bowl. Not just text “PHYSI”.
- Style: flat coral `#ff6b6b` on `forest #0d3b2a` disc, with subtle long-shadow to forest-2. No 3D extrusion (fails at 192).
- Safe zone: 80% glyph within 80% circle (maskable), 12% padding.

**Files to ship:**

| File | Size | Purpose | Spec |
|------|------|---------|------|
| `/public/pwa-192.png` | 192×192 PNG 32-bit, sRGB, < 12 KB | Home-screen 192 | `purpose: "any maskable"` — coral on forest disc, centered, 80% safe |
| `/public/pwa-512.png` | 512×512 PNG 32-bit, sRGB, < 40 KB, crisp | Home-screen 512 + splash | same mark, 2× detail |
| `/public/pwa-512-maskable.png` | 512×512, 80px safe inset | Explicit maskable | Center 80% circle, transparent bleed outside safe is forest |
| `/public/apple-touch-icon.png` | 180×180 PNG | iOS touch | Same mark on forest disc, no transparency edge |
| `/public/favicon.ico` | 32×32 ICO (16+32) | Browser tab | Coral P on transparent |
| `/public/icon.svg` | vector | `rel icon svg` + source of truth | `viewBox 0 0 512 512`, single path, no font embed |
| `public/pwa-splash.png` | 1280×720 PNG or remove | Manifest screenshots | Either ship or **remove entry** (404 risk) — recommend remove until branded shot |

**manifest.json (after):**

```json
{
  "name": "PHYSI — Live Timetable",
  "short_name": "PHYSI",
  "description": "Student-powered real-time timetable. Share what you hear, confirm what you see.",
  "start_url": "/?source=pwa",
  "display": "standalone",
  "background_color": "#fdf6e3",
  "theme_color": "#0d3b2a",
  "orientation": "portrait",
  "icons": [
    { "src": "/pwa-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/pwa-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" },
    { "src": "/pwa-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

**Layout head (`app/layout.tsx`):**

```tsx
<link rel="manifest" href="/manifest.json" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
<meta name="theme-color" content="#0d3b2a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="PHYSI" />
```

**QA checklist:**

- [ ] `magick identify pwa-*.png` shows correct dims + sRGB
- [ ] Android: install → maskable crop keeps P fully visible (test in DevTools Application → Manifest)
- [ ] iOS: Add to Home Screen → 180 icon not letterboxed
- [ ] Lighthouse PWA ≥ 90 (maskable, theme_color, standalone)

**Generation (ships with spec):** SVG source below is the generator — export PNGs via `sharp`/`resvg`:

```bash
# from repo root
npm i -D sharp
node scripts/generate-pwa-icons.mjs  # reads public/icon.svg → writes 192/512/180
python3 -m json.tool public/manifest.json  # validate
file public/pwa-*.png  # verify PNG 192x192 / 512x512
```

---

## 4. Migration — How to Land Without Breaking

1. Add `dawn` ThemeAdapter, keep `forest` registered. Default to `forest` behind flag.
2. Ship `icon.svg` + new `manifest.json` (background `#fdf6e3`, keep theme `#0d3b2a` for OS bar).
3. Behind `NEXT_PUBLIC_THEME=dawn`, flip `globals.css` body to paper + gradient + Inter. Verify:
   - `next build` passes, no hard-coded `#0d3b2a` bg in `app/page.tsx` hero (those are pinned — migrate to vars).
   - Contrast: coral on white passes for buttons (white text), coral on forest passes for events, Inter at 14px passes AA.
4. Swap `.physi-card` glass → paper in one PR (visual diff required).
5. Remove `pwa-splash.png` entry or ship real screenshot — don't 404.
6. Cutover default to `dawn`, keep `forest` as `?theme=forest` debug.

**Files touched (planned):**
- `physicoin/lib/adapters/theme.ts` — add dawn
- `physicoin/app/globals.css` — new tokens + body::before gradient + card/button deltas
- `physicoin/tailwind.config.ts` — new colors
- `physicoin/public/manifest.json` — colors + icons array
- `physicoin/app/layout.tsx` — icon links + theme-color
- `physicoin/public/icon.svg` + generate script — new mark
- `physicoin/app/page.tsx` — migrate hard-coded `bg-[#0d3b2a]` hero to vars

---

## 5. Open Questions

- Keep Fredoka for empty-state illustrations or drop fully? (Proposal: drop for body, keep as `--font-accent` for playful moments.)
- Gradient stop 4 should be forest wash or transparent? (Proposal: transparent on most pages, forest only on landing hero.)
- Coral accessibility: `#ff6b6b` on white text `#fff` is 3.9:1 at small text — buttons use white, body never — approved, but verify with Stark.

---

## 6. References

- Current tokens: `physicoin/app/globals.css` (`--physi-bg #0d3b2a`, `--physi-accent #34d399`, `--physi-highlight #fbbf24`)
- Theme registry: `physicoin/lib/adapters/theme.ts` (forest #0d3b2a / mint #34d399 / gold #fbbf24)
- Design reference page: `physicoin/public/physi-design-reference.html`
- Prior proposal: `physicoin/REDESIGN.md` (teal `#084c69`/cyan `#06b6d4` — superseded by coral/paper direction here)

---

*Spec version: 1.0 — 2026-09-06 · Next step: generate `physi-refresh-swatches.html` browser + `icon.svg` + icon PNGs.*
