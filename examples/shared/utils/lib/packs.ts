/**
 * Shared pack listing and categorisation utilities.
 *
 * Used by the start-menu system-app and the OpenWithDialog component to
 * consistently categorise, group, filter, search, and cache pack lists.
 */

import { createStarkAPI } from '@stark-o/browser-runtime';
import { effectiveCapabilities } from '@stark-o/shared';

/* ── Types ── */

/** Minimal pack information needed by the start menu / open-with dialog. */
export interface PackEntry {
  name: string;
  runtimeTag: 'node' | 'browser' | 'universal';
  description?: string;
  grantedCapabilities?: string[];
  metadata?: {
    requestedCapabilities?: string[];
    labels?: string[];
    [key: string]: unknown;
  };
}

/** Runtime-based category for a pack. */
export type AppCategory = 'visual' | 'worker' | 'universal' | 'node';

/** A pack enriched with its resolved category. */
export interface AppEntry {
  name: string;
  category: AppCategory;
  pack: PackEntry;
}

/** A label-based group of apps. */
export interface LabelGroup {
  label: string;
  apps: AppEntry[];
}

/** Cached pack data stored in OPFS. */
export interface PackCache {
  apps: AppEntry[];
  labelGroups: LabelGroup[];
  timestamp: number;
}

/* ── Constants ── */

/** The special label that hides a pack from the UI. */
export const HIDDEN_LABEL = 'start:hidden';

/** Prefix for labels used for start-menu organisation. */
export const START_LABEL_PREFIX = 'start:';

/** The special label indicating a pack should be launched under a dynamic service. */
export const SERVICE_LABEL = 'service';

/* ── Categorisation ── */

/** Determine the UI category for a given pack. */
export function categorizePack(pack: PackEntry): AppCategory {
  const caps = effectiveCapabilities(
    pack.metadata?.requestedCapabilities,
    (pack.grantedCapabilities ?? []) as import('@stark-o/shared').Capability[],
  );
  if (pack.runtimeTag === 'universal') return 'universal';
  if (caps.includes('root') && pack.runtimeTag === 'browser') return 'visual';
  if (pack.runtimeTag === 'browser') return 'worker';
  return 'node';
}

/** Convert a list of raw packs into categorised AppEntry items, filtering hidden packs. */
export function buildAppEntries(packs: PackEntry[]): AppEntry[] {
  return packs
    .filter((p) => {
      const labels = (p.metadata?.labels ?? []).map((l) => l.toLowerCase());
      return !labels.includes(HIDDEN_LABEL);
    })
    .map((p) => ({ name: p.name, category: categorizePack(p), pack: p }));
}

/** Group apps by their start-menu labels.  Only labels starting with "start:" are
 *  used for grouping; the prefix is stripped for display.  Apps without qualifying
 *  labels go into an "Other" group. */
export function buildLabelGroups(apps: AppEntry[]): LabelGroup[] {
  const map = new Map<string, AppEntry[]>();

  for (const app of apps) {
    // Only consider labels prefixed with "start:" (excluding start:hidden)
    const startLabels = (app.pack.metadata?.labels ?? [])
      .filter((l) => {
        const lower = l.toLowerCase();
        return lower.startsWith(START_LABEL_PREFIX) && lower !== HIDDEN_LABEL;
      })
      .map((l) => l.slice(START_LABEL_PREFIX.length)); // strip prefix for display

    if (startLabels.length > 0) {
      for (const label of startLabels) {
        const key = label;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(app);
      }
    } else {
      if (!map.has('Other')) map.set('Other', []);
      map.get('Other')!.push(app);
    }
  }

  // Sort groups alphabetically, "Other" always last
  const groups: LabelGroup[] = [];
  const sortedKeys = [...map.keys()].sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const groupApps = map.get(key)!;
    groupApps.sort((a, b) => a.name.localeCompare(b.name));
    groups.push({ label: key, apps: groupApps });
  }

  return groups;
}

/** Filter apps to only those compatible with the browser (for open-with). */
export function browserOnlyApps(apps: AppEntry[]): AppEntry[] {
  return apps.filter(
    (a) => a.category === 'visual' || a.category === 'universal',
  );
}

/** Filter apps by a text query (case-insensitive match on name). */
export function searchApps(apps: AppEntry[], query: string): AppEntry[] {
  if (!query.trim()) return apps;
  const q = query.toLowerCase();
  return apps.filter((a) => a.name.toLowerCase().includes(q));
}

/** Sort apps alphabetically within each category group. */
export function appsByCategory(apps: AppEntry[]): { category: AppCategory; label: string; apps: AppEntry[] }[] {
  const catMap: Record<AppCategory, { label: string; apps: AppEntry[] }> = {
    visual: { label: 'Apps', apps: [] },
    worker: { label: 'Web Workers', apps: [] },
    node: { label: 'Node.js', apps: [] },
    universal: { label: 'Universal', apps: [] },
  };

  for (const app of apps) {
    catMap[app.category].apps.push(app);
  }

  return (['visual', 'worker', 'node', 'universal'] as AppCategory[])
    .map((c) => ({ category: c, ...catMap[c] }))
    .filter((g) => g.apps.length > 0)
    .map((g) => {
      g.apps.sort((a, b) => a.name.localeCompare(b.name));
      return g;
    });
}

/* ── API ── */

/** Fetch the full pack list from the orchestrator API. */
export async function fetchPacks(): Promise<PackEntry[]> {
  const api = createStarkAPI();
  const result = (await api.pack.list()) as {
    packs: Array<{
      name: string;
      runtimeTag: 'node' | 'browser' | 'universal';
      description?: string;
      grantedCapabilities?: string[];
      metadata?: Record<string, unknown>;
    }>;
  };
  return (result.packs ?? []).map((p) => ({
    name: p.name,
    runtimeTag: p.runtimeTag,
    description: p.description,
    grantedCapabilities: p.grantedCapabilities,
    metadata: p.metadata as PackEntry['metadata'],
  }));
}

/* ── Caching (OPFS) ── */

const CACHE_DIR = '/home/.stark';
const CACHE_FILE = '/home/.stark/pack-cache';

async function getOpfsHelpers() {
  // Dynamic import so this module has no side-effect impact when tree-shaken
  const { getStarkOpfsRoot, getDirectoryHandle, getFileHandle } = await import('./opfs');
  return { getStarkOpfsRoot, getDirectoryHandle, getFileHandle };
}

/** Read the cached pack data from OPFS. Returns `null` if no cache exists. */
export async function readPackCache(): Promise<PackCache | null> {
  try {
    const { getStarkOpfsRoot, getFileHandle } = await getOpfsHelpers();
    const root = await getStarkOpfsRoot();
    if (!root) return null;
    const fh = await getFileHandle(root, CACHE_FILE);
    const file = await fh.getFile();
    const text = await file.text();
    return JSON.parse(text) as PackCache;
  } catch {
    return null;
  }
}

/** Write pack data to the OPFS cache. */
export async function writePackCache(cache: PackCache): Promise<void> {
  try {
    const { getStarkOpfsRoot, getDirectoryHandle, getFileHandle } = await getOpfsHelpers();
    const root = await getStarkOpfsRoot();
    if (!root) return;
    await getDirectoryHandle(root, CACHE_DIR, true);
    const fh = await getFileHandle(root, CACHE_FILE, true);
    const writable = await fh.createWritable();
    await writable.write(new TextEncoder().encode(JSON.stringify(cache)));
    await writable.close();
  } catch {
    /* best-effort caching */
  }
}

/**
 * Load packs with caching.
 *
 * 1. Returns cached data immediately (if available) so the UI can render fast.
 * 2. Fetches fresh data from the API in the background.
 * 3. Calls `onFresh` when fresh data arrives so the UI can update.
 *
 * @returns Cached data (or null) synchronously through the returned promise,
 *          followed by a background refresh.
 */
export async function loadPacksWithCache(
  onFresh: (data: { apps: AppEntry[]; labelGroups: LabelGroup[] }) => void,
  onError?: (err: unknown) => void,
): Promise<{ apps: AppEntry[]; labelGroups: LabelGroup[] } | null> {
  // 1. Try cache
  const cached = await readPackCache();
  const cachedResult = cached ? { apps: cached.apps, labelGroups: cached.labelGroups } : null;

  // 2. Background refresh
  fetchPacks()
    .then((packs) => {
      const apps = buildAppEntries(packs);
      const labelGroups = buildLabelGroups(apps);
      const fresh = { apps, labelGroups };

      // Persist to cache
      writePackCache({ ...fresh, timestamp: Date.now() });

      onFresh(fresh);
    })
    .catch((err) => {
      if (onError) onError(err);
      else console.warn('packs: background refresh failed', err);
    });

  return cachedResult;
}

/* ── Helpers shared by start-menu & open-with ── */

/**
 * Read the current browser node ID from the pack execution context.
 */
export function getBrowserNodeId(): string | null {
  try {
    const env = (window.parent as Record<string, unknown>).__STARK_ENV__ as
      Record<string, string> | undefined;
    return env?.STARK_NODE_ID ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if a pack has the special "service" label (used for dynamic service launch).
 */
export function hasServiceLabel(pack: PackEntry): boolean {
  return (pack.metadata?.labels ?? []).some(
    (l) => l.toLowerCase() === SERVICE_LABEL,
  );
}

/**
 * Category icon character for display.
 */
export function categoryIcon(cat: AppCategory): string {
  switch (cat) {
    case 'visual': return '◈';
    case 'worker': return '⌬';
    case 'node': return '⎈';
    case 'universal': return '⊕';
  }
}
