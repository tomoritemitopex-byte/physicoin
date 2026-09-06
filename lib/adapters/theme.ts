/**
 * lib/adapters/theme.ts — ThemeAdapter
 *
 * Default: campus day (sky/brick/stone) for roadmap
 */

import { createRegistry } from "./registry";

export interface ThemeTokens {
  bg: string;
  card: string;
  border: string;
  muted: string;
  accent: string;
  accentFg: string;
  success: string;
  warning: string;
  cssVars: Record<string, string>;
}

export interface ThemeAdapter {
  id: string;
  name: string;
  variant: string;
  tokens: ThemeTokens;
  twColors?: Record<string, string | Record<string, string>>;
}

const reg = createRegistry<ThemeAdapter>();
export const registerTheme = reg.registerAdapter;
export const listThemes = reg.listAdapters;
export const getTheme = reg.getAdapter;

function getEnvTheme(): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NEXT_PUBLIC_THEME || process.env.THEME;
  }
  return undefined;
}

export function getDefaultTheme(): ThemeAdapter {
  const envTheme = getEnvTheme();
  const themeId = envTheme === "forest" ? "forest" : "campus";
  return getTheme(themeId) ?? reg.listAdapters()[0]!;
}

export function themeCssVars(id?: string): Record<string, string> {
  const t = (id ? getTheme(id) : null) ?? getDefaultTheme();
  return t.tokens.cssVars;
}

const campus: ThemeAdapter = {
  id: "campus",
  name: "Campus Day",
  variant: "campus",
  tokens: {
    bg: "#ffffff",
    card: "#ffffff",
    border: "rgba(30,58,138,0.15)",
    muted: "rgba(12,30,58,0.70)",
    accent: "#0369a1",
    accentFg: "#ffffff",
    success: "#15803d",
    warning: "#d97706",
    cssVars: {
      "--physi-bg": "#ffffff",
      "--physi-card": "#ffffff",
      "--physi-border": "rgba(30,58,138,0.15)",
      "--physi-muted": "rgba(12,30,58,0.70)",
      "--physi-accent": "#0369a1",
      "--physi-accent-fg": "#ffffff",
      "--physi-success": "#15803d",
      "--physi-warning": "#d97706",
      "--physi-shadow": "#0c1e3a",
      "--physi-sky": "#7dd3fc",
      "--paper": "#ffffff",
      "--coral": "#0369a1",
    },
  },
  twColors: {
    sky: { DEFAULT: "#7dd3fc", 2: "#bae6fd", 3: "#e0f2fe" },
    ink: { DEFAULT: "#0c1e3a", 2: "#1e3a8a" },
    stone: { DEFAULT: "#78716c", 2: "#a8a29e" },
    brick: { DEFAULT: "#dc2626", dark: "#991b1b" },
    forest: { DEFAULT: "#15803d", 2: "#166534" },
    phys: { bg: "#ffffff", card: "#ffffff", accent: "#0369a1" },
  },
};

registerTheme(campus);

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

export function tailwindColors(): Record<string, unknown> {
  const t = getDefaultTheme();
  return (t.twColors as Record<string, unknown>) ?? {};
}

export function themeRootCss(id?: string): string {
  const vars = themeCssVars(id);
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join("\n")}\n}`;
}