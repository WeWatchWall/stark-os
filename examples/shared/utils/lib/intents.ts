/**
 * Intent system for Stark OS.
 *
 * Maps file extensions to default programs (pack names) and provides helpers
 * for resolving, persisting, and choosing "Open With" handlers.
 *
 * Intent data is stored in OPFS under `/home/.stark/intents` as a JSON file
 * so it persists across sessions and is shared by all system apps.
 */

import { createStarkAPI } from '@stark-o/browser-runtime';

import {
  getStarkOpfsRoot,
  getDirectoryHandle,
  getFileHandle,
} from './opfs';

import {
  SERVICE_LABEL,
  VOLUME_LABEL_PREFIX,
  fetchDynamicServicesForPack,
} from './packs';

/* ── Types ── */

/** A single intent mapping: extension → pack name. */
export interface IntentMapping {
  /** File extension without the leading dot, lower-cased (e.g. "txt"). */
  extension: string;
  /** Pack name that should open files with this extension by default. */
  packName: string;
}

/** Full intent store persisted to OPFS. */
export interface IntentStore {
  /** Map of extension → default pack name. */
  defaults: Record<string, string>;
}

/** Minimal pack info needed by the intent system / Open With dialog. */
export interface IntentPackInfo {
  name: string;
  runtimeTag: 'node' | 'browser' | 'universal';
  description?: string;
}

/**
 * Result returned by {@link openFilesWithIntent} when the intent cannot be
 * resolved automatically and the caller should show the "Open With" dialog.
 */
export interface OpenWithNeeded {
  resolved: false;
  filenames: string[];
  filePaths: string[];
}

/* ── Constants ── */

/** OPFS path (relative to stark-orchestrator root) where intents are stored. */
const INTENTS_DIR = '/home/.stark';
const INTENTS_FILE = '/home/.stark/intents';

/**
 * Built-in default extension → pack name mappings.
 * These are used as fallbacks when the user has not configured a custom mapping.
 */
const BUILTIN_DEFAULTS: Record<string, string> = {
  // Text / documents
  txt: 'notepad',
  md: 'notepad',
  log: 'notepad',
  rtf: 'notepad',

  // Code
  js: 'stark-code',
  ts: 'stark-code',
  vue: 'stark-code',
  jsx: 'stark-code',
  tsx: 'stark-code',
  py: 'stark-code',
  rb: 'stark-code',
  go: 'stark-code',
  rs: 'stark-code',
  java: 'stark-code',
  c: 'stark-code',
  cpp: 'stark-code',
  h: 'stark-code',
  hpp: 'stark-code',
  cs: 'stark-code',
  html: 'stark-code',
  css: 'stark-code',
  scss: 'stark-code',
  less: 'stark-code',
  sass: 'stark-code',
  sh: 'stark-code',
  bash: 'stark-code',
  zsh: 'stark-code',
  fish: 'stark-code',
  sql: 'stark-code',
  graphql: 'stark-code',

  // Config
  json: 'stark-code',
  yaml: 'stark-code',
  yml: 'stark-code',
  toml: 'stark-code',
  ini: 'stark-code',
  xml: 'stark-code',
  env: 'stark-code',
  lock: 'stark-code',

  // Image
  png: 'gallery',
  jpg: 'gallery',
  jpeg: 'gallery',
  gif: 'gallery',
  svg: 'gallery',
  webp: 'gallery',
  ico: 'gallery',
  bmp: 'gallery',
  tiff: 'gallery',
  avif: 'gallery',

  // Audio
  mp3: 'webamp',
  wav: 'webamp',
  ogg: 'webamp',
  flac: 'webamp',
  aac: 'webamp',
  m4a: 'webamp',
  wma: 'webamp',

  // Spreadsheet
  csv: 'univer-sheets',
  xls: 'univer-sheets',
  xlsx: 'univer-sheets',
  ods: 'univer-sheets',
  unisheet: 'univer-sheets',

  // Document
  unidoc: 'univer-docs',
};

/* ── Persistence ── */

/** Load the intent store from OPFS, returning built-in defaults if none saved. */
export async function loadIntents(): Promise<IntentStore> {
  try {
    const root = await getStarkOpfsRoot();
    if (!root) return { defaults: { ...BUILTIN_DEFAULTS } };

    const fh = await getFileHandle(root, INTENTS_FILE);
    const file = await fh.getFile();
    const text = await file.text();
    const data = JSON.parse(text) as Partial<IntentStore>;

    return {
      defaults: { ...BUILTIN_DEFAULTS, ...(data.defaults ?? {}) },
    };
  } catch {
    // File does not exist yet or is corrupt — use built-in defaults
    return { defaults: { ...BUILTIN_DEFAULTS } };
  }
}

/** Persist the intent store to OPFS. */
export async function saveIntents(store: IntentStore): Promise<void> {
  const root = await getStarkOpfsRoot();
  if (!root) return;

  // Ensure /home/.stark exists
  await getDirectoryHandle(root, INTENTS_DIR, true);

  const fh = await getFileHandle(root, INTENTS_FILE, true);
  const writable = await fh.createWritable();
  await writable.write(new TextEncoder().encode(JSON.stringify(store, null, 2)));
  await writable.close();
}

/* ── Query helpers ── */

/** Extract the extension (lower-cased, no dot) from a filename. Returns '' if none. */
export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Resolve the default pack name for a given file extension.
 * Returns `undefined` if no mapping exists.
 */
export function resolveIntent(store: IntentStore, extension: string): string | undefined {
  if (!extension) return undefined;
  return store.defaults[extension.toLowerCase()];
}

/**
 * Given a set of filenames, determine the common extension.
 * Returns the shared extension if all files have the same one, otherwise ''.
 */
export function commonExtension(filenames: string[]): string {
  if (filenames.length === 0) return '';
  const exts = new Set(filenames.map(getExtension));
  if (exts.size === 1) return [...exts][0];
  return '';
}

/**
 * Set a custom default pack for an extension and persist.
 */
export async function setDefaultIntent(
  store: IntentStore,
  extension: string,
  packName: string,
): Promise<IntentStore> {
  const updated: IntentStore = {
    defaults: { ...store.defaults, [extension.toLowerCase()]: packName },
  };
  await saveIntents(updated);
  return updated;
}

/**
 * Filter packs that can run on a browser node (browser + universal).
 * Node-only packs are excluded since the "Open With" dialog is in the browser UI.
 */
export function browserCompatiblePacks(packs: IntentPackInfo[]): IntentPackInfo[] {
  return packs.filter(
    (p) => p.runtimeTag === 'browser' || p.runtimeTag === 'universal',
  );
}

/* ── Runtime helpers (shared by files & desktop system-apps) ── */

/**
 * Read the current browser node ID from the pack execution context.
 * The executor sets `__STARK_ENV__` on the parent window for main-thread packs.
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
 * Launch a pack (program) on the current browser node with file paths as args.
 * Optionally includes volume mounts extracted from pack labels.
 */
export async function launchPack(
  packName: string,
  filePaths: string[],
  volumeMounts?: Array<{ name: string; mountPath: string }>,
): Promise<void> {
  const api = createStarkAPI();
  const browserNodeId = getBrowserNodeId();
  const opts: { args: string[]; nodeId?: string; volumeMounts?: Array<{ name: string; mountPath: string }> } = { args: filePaths };
  if (browserNodeId) opts.nodeId = browserNodeId;
  if (volumeMounts && volumeMounts.length > 0) opts.volumeMounts = volumeMounts;
  await api.pod.create(packName, opts);
}

/**
 * Load the list of registered packs from the orchestrator API.
 * Returns only the fields needed by the intent / "Open With" system.
 */
export async function loadPackList(): Promise<IntentPackInfo[]> {
  try {
    const api = createStarkAPI();
    const result = (await api.pack.list()) as {
      packs: Array<{ name: string; runtimeTag: 'node' | 'browser' | 'universal'; description?: string }>;
    };
    return (result.packs ?? []).map((p) => ({
      name: p.name,
      runtimeTag: p.runtimeTag,
      description: p.description,
    }));
  } catch (err) {
    console.warn('intents: failed to load pack list:', err);
    return [];
  }
}

/**
 * Attempt to open files using the intent system.
 *
 * - If all files share a common extension that has a default mapping, the
 *   associated pack is launched immediately and `{ resolved: true }` is returned.
 * - Otherwise `{ resolved: false, filenames, filePaths }` is returned so the
 *   caller can show the "Open With" dialog.
 */
export async function openFilesWithIntent(
  store: IntentStore,
  filenames: string[],
  filePaths: string[],
): Promise<{ resolved: true } | OpenWithNeeded> {
  if (filenames.length === 0) return { resolved: true };

  const ext = commonExtension(filenames);
  const packName = ext ? resolveIntent(store, ext) : undefined;

  if (packName) {
    await launchPack(packName, filePaths);
    return { resolved: true };
  }

  return { resolved: false, filenames, filePaths };
}

/**
 * Handle the result of the "Open With" dialog.
 * If `setDefault` is true, updates the intent store for the shared extension.
 * Returns the (possibly updated) intent store.
 */
export async function handleOpenWithSelection(
  store: IntentStore,
  packName: string,
  filenames: string[],
  filePaths: string[],
  setDefault: boolean,
  volumeMounts?: Array<{ name: string; mountPath: string }>,
): Promise<IntentStore> {
  let updated = store;

  if (setDefault) {
    const ext = commonExtension(filenames);
    if (ext) {
      updated = await setDefaultIntent(store, ext, packName);
    }
  }

  await launchPack(packName, filePaths, volumeMounts);
  return updated;
}

/* ── Shortcut (.lnk) support ── */

/** JSON structure stored inside a .lnk file. */
export interface ShortcutData {
  /** Pack name to launch. */
  packName: string;
  /** Pack runtime tag (node | browser | universal). */
  runtimeTag: 'node' | 'browser' | 'universal';
  /** Optional pack description. */
  description?: string;
  /** Arguments to pass to the pod. */
  args: string[];
  /** Base64-encoded icon image (data URI). Always stored as base64 — never a URL. */
  iconBase64?: string;
  /**
   * Pack ID — needed for dynamic service resolution at launch time.
   * Without this the shortcut cannot replicate the start-menu's service
   * lookup behavior (fetchDynamicServicesForPack requires a pack ID).
   */
  packId?: string;
  /**
   * Raw pack metadata labels (e.g. "service", "volume:data:/app/data",
   * "start:Utilities").  Stored so the shortcut can derive volume mounts
   * and detect the service label at launch time — exactly matching the
   * start-menu launch behavior.
   */
  labels?: string[];
  /** Optional volume mounts derived from pack labels at creation time. */
  volumeMounts?: Array<{ name: string; mountPath: string }>;
  /** Optional pre-resolved dynamic service ID. */
  serviceId?: string;
}

/** Check whether a filename is a .lnk shortcut. */
export function isShortcutFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.lnk');
}

/** Strip .lnk extension for display purposes (case-insensitive). */
export function displayNameForShortcut(filename: string): string {
  if (isShortcutFile(filename)) {
    return filename.slice(0, -4);
  }
  return filename;
}

/**
 * Read and parse the JSON from a .lnk file in OPFS.
 * Returns null if the file cannot be read or parsed.
 */
export async function readShortcutFile(filePath: string): Promise<ShortcutData | null> {
  try {
    const root = await getStarkOpfsRoot();
    if (!root) return null;
    const fh = await getFileHandle(root, filePath);
    const file = await fh.getFile();
    const text = await file.text();
    return JSON.parse(text) as ShortcutData;
  } catch {
    return null;
  }
}

/**
 * Launch a pod from shortcut data.
 *
 * Replicates the start-menu launch behaviour:
 * 1. Volume mounts from the stored labels (or pre-resolved `volumeMounts`) are
 *    attached to the pod.
 * 2. If the pack carries the `service` label and a `packId` is available,
 *    dynamic services are fetched at launch time.  When exactly one dynamic
 *    service exists the pod is launched under that service; otherwise a plain
 *    pod is created (matching the start-menu's "fall through to direct launch"
 *    path — a future enhancement could surface a picker UI here).
 * 3. A pre-resolved `serviceId` stored in the shortcut is used as a fast-path
 *    so we skip the API call when the service was already known at creation
 *    time.
 */
export async function launchShortcut(data: ShortcutData): Promise<void> {
  const api = createStarkAPI();
  const browserNodeId = getBrowserNodeId();
  const opts: Record<string, unknown> = {};

  if (data.args && data.args.length > 0) opts.args = data.args;
  if (browserNodeId) opts.nodeId = browserNodeId;

  // Volume mounts — use pre-resolved value, or re-derive from stored labels
  if (data.volumeMounts && data.volumeMounts.length > 0) {
    opts.volumeMounts = data.volumeMounts;
  } else if (data.labels) {
    const mounts = extractVolumeLabels(data.labels);
    if (mounts.length > 0) opts.volumeMounts = mounts;
  }

  // Service resolution — mirror start-menu behaviour
  if (data.serviceId) {
    // Fast path: service was pre-resolved at shortcut creation
    opts.serviceId = data.serviceId;
  } else if (hasServiceLabelInList(data.labels) && data.packId) {
    // Dynamic resolution: fetch services for this pack just like the start-menu
    const svcs = await fetchDynamicServicesForPack(data.packId);
    if (svcs.length === 1) {
      opts.serviceId = svcs[0].id;
    }
    // If 0 or 2+ services → launch without serviceId (same as start-menu
    // "No dynamic services found — fall through to normal launch" path).
  }

  await api.pod.create(data.packName, opts);
}

/* ── Private label helpers (avoid importing full packs module types) ── */

/** Check whether a labels array contains the "service" label. */
function hasServiceLabelInList(labels?: string[]): boolean {
  if (!labels) return false;
  return labels.some((l) => l.toLowerCase() === SERVICE_LABEL);
}

/** Extract volume mounts from a raw labels array. */
function extractVolumeLabels(labels: string[]): Array<{ name: string; mountPath: string }> {
  const mounts: Array<{ name: string; mountPath: string }> = [];
  for (const label of labels) {
    if (!label.startsWith(VOLUME_LABEL_PREFIX)) continue;
    const rest = label.slice(VOLUME_LABEL_PREFIX.length);
    const colonIdx = rest.indexOf(':');
    if (colonIdx < 1) continue;
    const name = rest.slice(0, colonIdx);
    const mountPath = rest.slice(colonIdx + 1);
    if (!mountPath) continue;
    mounts.push({ name, mountPath });
  }
  return mounts;
}
