/**
 * lib/adapters/theme.ts — ThemeAdapter (design adapter)
 *
 * Modular design tokens: registerAdapter() plugs a new theme without hard-codes.
 * Default: forest (#0d3b2a) — mint #34d399 + gold #fbbf24 on shadow #022c1e
 * Consumers: tailwind.config.ts, globals.css (via CSS vars), layout components.
 */

import { createRegistry } from "./registry";

export interface ThemeTokens {
  /** page background */
  bg: string;
  /** card fill */
  card: string;
  /** card border */
  border: string;
  /** muted text */
  muted: string;
  /** primary accent (e.g. for CTAs) */
  accent: string;
  /** accent foreground */
  accentFg: string;
  /** success/green tick */
  success: string;
  /** warning/advisory */
  warning: string;
  /** CSS vars map for :root */
  cssVars: Record<string, string>;
}

export interface ThemeAdapter {
  id: string;
  name: string;
  /** semantic family: "forest" | ... */
  variant: string;
  tokens: ThemeTokens;
  /** optional Tailwind color extension helper */
  twColors?: Record<string, string | Record<string, string>>;
}

// registry
const reg = createRegistry<ThemeAdapter>();
export const registerTheme = reg.registerAdapter;
export const listThemes = reg.listAdapters;
export const getTheme = reg.getAdapter;
export function getDefaultTheme(): ThemeAdapter {
  return getTheme("forest") ?? reg.listAdapters()[0]!;
}
export function themeCssVars(id?: string): Record<string, string> {
  const t = (id ? getTheme(id) : null) ?? getDefaultTheme();
  return t.tokens.cssVars;
}

// ── built-in: forest (default) ───────────────────────────────────────────────
const forest: ThemeAdapter = {
  id: "forest",
  name: "Forest Road",
  variant: "forest",
  tokens: {
    bg: "#0d3b2a",
    card: "#1a5f48",
    border: "rgba(52,211,153,0.15)",
    muted: "#a7bfb3",
    accent: "#34d399",
    accentFg: "#022c1e",
    success: "#34d399",
    warning: "#fbbf24",
    cssVars: {
      "--physi-bg": "#0d3b2a",
      "--physi-card": "#1a5f48",
      "--physi-border": "rgba(52,211,153,0.15)",
      "--physi-muted": "#a7bfb3",
      "--physi-accent": "#34d399",
      "--physi-accent-fg": "#022c1e",
      "--physi-success": "#34d399",
      "--physi-warning": "#fbbf24",
      "--physi-forest": "#0d3b2a",
      "--physi-forest-mid": "#1a5f48",
      "--physi-forest-light": "#34d399",
      "--physi-forest-2": "#143d2e",
      "--physi-shadow": "#022c1e",
      "--physi-mint": "#34d399",
      "--physi-gold": "#fbbf24",
      "--font-fredoka": "\"Fredoka\", system-ui, sans-serif",
    },
  },
  twColors: {
    physi: {
      bg: "#0d3b2a",
      card: "#1a5f48",
      border: "rgba(52,211,153,0.15)",
      accent: "#34d399",
      shadow: "#022c1e",
    },
    forest: "#0d3b2a",
  },
};

registerTheme(forest);

/** Resolve Tailwind 'theme.extend.colors' from registry (no hard-codes). */
export function tailwindColors(): Record<string, unknown> {
  const t = getDefaultTheme();
  return (t.twColors as Record<string, unknown>) ?? {};
}

/** Emit :root CSS string for globals.css injection (optional helper). */
export function themeRootCss(id?: string): string {
  const vars = themeCssVars(id);
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
