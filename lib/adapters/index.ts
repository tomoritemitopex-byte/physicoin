/**
 * lib/adapters/index.ts — Core orchestrator (no hard core, only registries)
 *
 * Every module (db, api, ui) is an adapter. This file is the registry hub.
 * Importing this file auto-registers all built-in adapters (side-effect imports).
 * New feature/theme/code adapter: just create file + registerAdapter() — zero core edits.
 *
 * Usage:
 *   import "@/lib/adapters"; // ensure auto-registration (or import specific domain)
 *   import { getApiAdapter, registerApiAdapter } from "@/lib/adapters";
 *   import { getTheme, registerTheme } from "@/lib/adapters";
 *   import { getFeature, registerFeature } from "@/lib/adapters";
 */

// Ensure DB adapters are registered (framework auto-registers, just ensure import)
import "@/lib/db/framework";

// Theme adapters (auto-register physi-dark + forest)
export * from "./theme";

// Code adapters (api registry)
export * from "./api";

// Feature adapters registry
export * from "./features";

// Auto-register all feature plug-ins (each file calls registerFeature/registerApiAdapter)
import "./features/timetable";
import "./features/profile";
import "./features/verify";
import "./features/mining";
import "./features/roadmap";
import "./features/stats";
import "./features/health";

// Generic registry factory for custom domains
export * from "./registry";

// Core helper: list everything plugged in (for /api/health or debug)
import { listThemes } from "./theme";
import { listApiAdapters } from "./api";
import { listFeatures } from "./features";
import { listAdapters as listDbAdapters } from "@/lib/db/framework";

export function listAllAdapters() {
  return {
    db: listDbAdapters().map((a) => a.id),
    themes: listThemes().map((a) => a.id),
    api: listApiAdapters().map((a) => a.id),
    features: listFeatures().map((a) => a.id),
  };
}
