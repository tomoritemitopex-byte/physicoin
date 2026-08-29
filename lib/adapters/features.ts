/**
 * lib/adapters/features.ts — FeatureAdapter registry (orchestrator)
 *
 * Domain features are plug-ins. Each feature file (timetable, profile, ...)
 * registers its FeatureAdapter + its ApiAdapter via registerAdapter — no hard codes in core.
 * Core (lib/adapters/*) is just registries; all real code lives in adapters.
 */

import { createRegistry } from "./registry";

export interface FeatureAdapter {
  id: string;
  label: string;
  /** nav entry for AppLayout */
  nav?: { href: string; label: string; short: string };
  /** api route that backs this feature */
  apiRoute: string;
  /** optional description */
  description?: string;
}

const reg = createRegistry<FeatureAdapter>();
export const registerFeature = reg.registerAdapter;
export const listFeatures = reg.listAdapters;
export const getFeature = reg.getAdapter;
