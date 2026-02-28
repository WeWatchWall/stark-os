/**
 * Minimalist file-type icon system using inline SVGs.
 *
 * Each icon is a self-contained SVG string that can be rendered via `v-html`
 * or as the `src` of an `<img>` with a data-URI.  No external icon library
 * is required — every icon weighs only a few hundred bytes.
 */

/* ── SVG Icon Definitions ── */

const svgAttrs = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

/** Folder icon */
export const ICON_FOLDER = `<svg ${svgAttrs}><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`;

/** Generic file icon */
export const ICON_FILE = `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

/** Text / document icon */
export const ICON_TEXT = `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;

/** Code / script icon */
export const ICON_CODE = `<svg ${svgAttrs}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

/** Image / picture icon */
export const ICON_IMAGE = `<svg ${svgAttrs}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

/** Music / audio icon */
export const ICON_AUDIO = `<svg ${svgAttrs}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

/** Video icon */
export const ICON_VIDEO = `<svg ${svgAttrs}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

/** Archive / zip icon */
export const ICON_ARCHIVE = `<svg ${svgAttrs}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;

/** PDF icon */
export const ICON_PDF = `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15v-2h1.5a1.5 1.5 0 010 3H9z"/></svg>`;

/** Executable / app icon */
export const ICON_APP = `<svg ${svgAttrs}><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;

/** Spreadsheet icon */
export const ICON_SPREADSHEET = `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="12" y1="9" x2="12" y2="21"/></svg>`;

/** Config / settings icon */
export const ICON_CONFIG = `<svg ${svgAttrs}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;

/* ── Extension → Category Mapping ── */

export type IconCategory =
  | 'folder'
  | 'file'
  | 'text'
  | 'code'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'pdf'
  | 'app'
  | 'spreadsheet'
  | 'config';

const EXT_MAP: Record<string, IconCategory> = {
  // Text
  txt: 'text', md: 'text', log: 'text', rtf: 'text',
  // Code
  js: 'code', ts: 'code', vue: 'code', jsx: 'code', tsx: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code',
  c: 'code', cpp: 'code', h: 'code', hpp: 'code', cs: 'code',
  html: 'code', css: 'code', scss: 'code', less: 'code', sass: 'code',
  sh: 'code', bash: 'code', zsh: 'code', fish: 'code',
  sql: 'code', graphql: 'code', wasm: 'code',
  // Config
  json: 'config', yaml: 'config', yml: 'config', toml: 'config',
  ini: 'config', xml: 'config', env: 'config', lock: 'config',
  // Image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image',
  webp: 'image', ico: 'image', bmp: 'image', tiff: 'image', avif: 'image',
  // Audio
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio',
  m4a: 'audio', wma: 'audio',
  // Video
  mp4: 'video', webm: 'video', avi: 'video', mov: 'video', mkv: 'video',
  flv: 'video', wmv: 'video',
  // Archive
  zip: 'archive', tar: 'archive', gz: 'archive', bz2: 'archive',
  xz: 'archive', '7z': 'archive', rar: 'archive',
  // PDF
  pdf: 'pdf',
  // Spreadsheet
  csv: 'spreadsheet', xls: 'spreadsheet', xlsx: 'spreadsheet', ods: 'spreadsheet',
  // App
  exe: 'app', dmg: 'app', appimage: 'app', deb: 'app', rpm: 'app',
};

const CATEGORY_TO_ICON: Record<IconCategory, string> = {
  folder: ICON_FOLDER,
  file: ICON_FILE,
  text: ICON_TEXT,
  code: ICON_CODE,
  image: ICON_IMAGE,
  audio: ICON_AUDIO,
  video: ICON_VIDEO,
  archive: ICON_ARCHIVE,
  pdf: ICON_PDF,
  app: ICON_APP,
  spreadsheet: ICON_SPREADSHEET,
  config: ICON_CONFIG,
};

/** Default colour per category (CSS colour string). */
export const CATEGORY_COLORS: Record<IconCategory, string> = {
  folder: '#f6c445',
  file: '#94a3b8',
  text: '#94a3b8',
  code: '#60a5fa',
  image: '#a78bfa',
  audio: '#f472b6',
  video: '#fb923c',
  archive: '#84cc16',
  pdf: '#ef4444',
  app: '#22d3ee',
  spreadsheet: '#34d399',
  config: '#94a3b8',
};

/**
 * Return the icon category for a given filename.
 * Directories should pass `isDirectory = true`.
 */
export function getIconCategory(filename: string, isDirectory = false): IconCategory {
  if (isDirectory) return 'folder';
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return 'file';
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXT_MAP[ext] ?? 'file';
}

/**
 * Return the inline SVG string for a filename.
 */
export function getIconSvg(filename: string, isDirectory = false): string {
  return CATEGORY_TO_ICON[getIconCategory(filename, isDirectory)];
}

/**
 * Return the default colour for a filename's icon.
 */
export function getIconColor(filename: string, isDirectory = false): string {
  return CATEGORY_COLORS[getIconCategory(filename, isDirectory)];
}
