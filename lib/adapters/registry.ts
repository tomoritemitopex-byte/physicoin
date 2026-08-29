/**
 * lib/adapters/registry.ts — generic registry factory
 * Used by all adapter domains (api, theme, feature) to stay DRY.
 * Same pattern as lib/db/framework.ts: registerAdapter + listAdapters + getAdapter
 */
export type AdapterId = string;

export interface BaseAdapter {
  id: AdapterId;
}

export function createRegistry<T extends BaseAdapter>() {
  const adapters: T[] = [];
  return {
    registerAdapter(adapter: T): void {
      const idx = adapters.findIndex((a) => a.id === adapter.id);
      if (idx !== -1) adapters.splice(idx, 1, adapter);
      else adapters.push(adapter);
    },
    listAdapters(): readonly T[] {
      return adapters;
    },
    getAdapter(id: AdapterId): T | null {
      return adapters.find((a) => a.id === id) ?? null;
    },
    hasAdapter(id: AdapterId): boolean {
      return adapters.some((a) => a.id === id);
    },
    clear(): void {
      adapters.length = 0;
    },
  };
}
