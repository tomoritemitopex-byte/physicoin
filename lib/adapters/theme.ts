/**
 * lib/adapters/theme.ts — ThemeAdapter (design adapter)
 *
 * Modular design tokens: registerAdapter() plugs a new theme without hard-codes.
 * Built-ins: PHYSI dark (#070a12) + forest (#0d3b2a). Any new theme = registerAdapter({id:"...", ...})
 * Consumers: tailwind.config.ts, globals.css (via CSS vars), layout components.
 * Like DbAdapter: pattern-based registry, first-registered wins for default.
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
  /** semantic family: "dark" | "forest" | ... */
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
  return getTheme("physi-dark") ?? reg.listAdapters()[0]!;
}
export function themeCssVars(id?: string): Record<string, string> {
  const t = (id ? getTheme(id) : null) ?? getDefaultTheme();
  return t.tokens.cssVars;
}

// ── built-ins ────────────────────────────────────────────────────────────────
const physiDark: ThemeAdapter = {
  id: "physi-dark",
  name: "PHYSI Dark",
  variant: "dark",
  tokens: {
    bg: "#070a12",
    card: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.06)",
    muted: "#94a3b8",
    accent: "#ffffff",
    accentFg: "#070a12",
    success: "#10b981",
    warning: "#f59e0b",
    cssVars: {
      "--physi-bg": "#070a12",
      "--physi-card": "rgba(255,255,255,0.03)",
      "--physi-border": "rgba(255,255,255,0.06)",
      "--physi-muted": "#94a3b8",
      "--physi-accent": "#ffffff",
      "--physi-success": "#10b981",
      "--physi-warning": "#f59e0b",
      "--physi-forest": "#0d3b2a",
      "--physi-forest-mid": "#1a5c3a",
      "--physi-forest-light": "#52b788",
      "--physi-forest-2": "#143d2e",
      "--physi-purple": "#8b5cf6",
      "--physi-purple-dark": "#6e45d0",
      "--physi-purple-light": "#a78bfa",
      "--font-fredoka": "\"Fredoka\", system-ui, sans-serif",
    },
  },
  twColors: {
    physi: {
      bg: "#070a12",
      card: "rgba(255,255,255,0.03)",
      border: "rgba(255,255,255,0.06)",
    },
    forest: "#0d3b2a",
  },
};

const forest: ThemeAdapter = {
  id: "forest",
  name: "Forest Road",
  variant: "forest",
  tokens: {
    bg: "#0d3b2a",
    card: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.08)",
    muted: "#a7bfb3",
    accent: "#10b981",
    accentFg: "#ffffff",
    success: "#34d399",
    warning: "#fbbf24",
    cssVars: {
      "--physi-bg": "#0d3b2a",
      "--physi-card": "rgba(255,255,255,0.05)",
      "--physi-border": "rgba(255,255,255,0.08)",
      "--physi-muted": "#a7bfb3",
      "--physi-accent": "#10b981",
      "--physi-success": "#34d399",
      "--physi-warning": "#fbbf24",
      "--physi-forest": "#0d3b2a",
      "--physi-forest-mid": "#1a5c3a",
      "--physi-forest-light": "#52b788",
      "--physi-forest-2": "#143d2e",
      "--physi-purple": "#8b5cf6",
      "--physi-purple-dark": "#6e45d0",
      "--physi-purple-light": "#a78bfa",
      "--font-fredoka": "\"Fredoka\", system-ui, sans-serif",
    },
  },
  twColors: {
    physi: {
      bg: "#0d3b2a",
      card: "rgba(255,255,255,0.05)",
      border: "rgba(255,255,255,0.08)",
    },
    forest: "#0d3b2a",
  },
};

registerTheme(physiDark);
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
