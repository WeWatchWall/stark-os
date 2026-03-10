/**
 * Intent system for Stark OS.
 *
 * Maps file extensions to default programs (pack names) and provides helpers
 * for resolving, persisting, and choosing "Open With" handlers.
 *
 * Intent data is stored in OPFS under `/home/.stark/intents` as a JSON file
 * so it persists across sessions and is shared by all system apps.
 */

import {
  getStarkOpfsRoot,
  getDirectoryHandle,
  getFileHandle,
} from './opfs';

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
  js: 'monaco',
  ts: 'monaco',
  vue: 'monaco',
  jsx: 'monaco',
  tsx: 'monaco',
  py: 'monaco',
  rb: 'monaco',
  go: 'monaco',
  rs: 'monaco',
  java: 'monaco',
  c: 'monaco',
  cpp: 'monaco',
  h: 'monaco',
  hpp: 'monaco',
  cs: 'monaco',
  html: 'monaco',
  css: 'monaco',
  scss: 'monaco',
  less: 'monaco',
  sass: 'monaco',
  sh: 'monaco',
  bash: 'monaco',
  zsh: 'monaco',
  fish: 'monaco',
  sql: 'monaco',
  graphql: 'monaco',

  // Config
  json: 'monaco',
  yaml: 'monaco',
  yml: 'monaco',
  toml: 'monaco',
  ini: 'monaco',
  xml: 'monaco',
  env: 'monaco',
  lock: 'monaco',

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
