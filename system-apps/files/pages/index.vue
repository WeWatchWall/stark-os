<template>
  <div class="files-app">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="nav-buttons">
        <button
          class="nav-btn"
          :disabled="!canGoBack"
          title="Back"
          @click="goBack"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button
          class="nav-btn"
          :disabled="!canGoForward"
          title="Forward"
          @click="goForward"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button
          class="nav-btn"
          :disabled="!canGoUp"
          title="Up one directory"
          @click="goUp"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
      </div>
      <form class="address-bar" @submit.prevent="navigateToAddressBar">
        <input
          v-model="addressBarValue"
          type="text"
          class="address-input"
          spellcheck="false"
          @keydown.enter="navigateToAddressBar"
        />
      </form>
      <div class="view-buttons">
        <button
          class="view-btn"
          :class="{ active: viewMode === 'icons' }"
          title="Icons"
          @click="viewMode = 'icons'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        </button>
        <button
          class="view-btn"
          :class="{ active: viewMode === 'list' }"
          title="List"
          @click="viewMode = 'list'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </button>
        <button
          class="view-btn"
          :class="{ active: viewMode === 'details' }"
          title="Details"
          @click="viewMode = 'details'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><rect x="2" y="4" width="4" height="4" rx="0.5"/><rect x="2" y="10" width="4" height="4" rx="0.5"/><rect x="2" y="16" width="4" height="4" rx="0.5"/></svg>
        </button>
      </div>
    </div>

    <!-- Content area -->
    <div class="content">
      <!-- Icons view -->
      <div v-if="viewMode === 'icons'" class="icons-grid">
        <div
          v-for="item in sortedItems"
          :key="item.name"
          class="icon-cell"
          @dblclick="onItemActivate(item)"
          @touchend="onTouchActivate(item, $event)"
        >
          <div class="icon-wrapper" :style="{ color: getColor(item) }">
            <div class="icon-svg" v-html="getSvg(item)"></div>
          </div>
          <span class="icon-label" :title="item.name">{{ item.name }}</span>
        </div>
        <div v-if="!sortedItems.length && !loading" class="empty-message">
          This folder is empty
        </div>
      </div>

      <!-- List view -->
      <div v-if="viewMode === 'list'" class="list-view">
        <div
          v-for="item in sortedItems"
          :key="item.name"
          class="list-row"
          @dblclick="onItemActivate(item)"
          @touchend="onTouchActivate(item, $event)"
        >
          <div class="list-icon" :style="{ color: getColor(item) }">
            <div class="icon-svg" v-html="getSvg(item)"></div>
          </div>
          <span class="list-name" :title="item.name">{{ item.name }}</span>
        </div>
        <div v-if="!sortedItems.length && !loading" class="empty-message">
          This folder is empty
        </div>
      </div>

      <!-- Details view -->
      <div v-if="viewMode === 'details'" class="details-view">
        <div class="details-header">
          <span class="details-col col-name">Name</span>
          <span class="details-col col-type">Type</span>
          <span class="details-col col-size">Size</span>
        </div>
        <div
          v-for="item in sortedItems"
          :key="item.name"
          class="details-row"
          @dblclick="onItemActivate(item)"
          @touchend="onTouchActivate(item, $event)"
        >
          <span class="details-col col-name">
            <span class="details-icon" :style="{ color: getColor(item) }">
              <span class="icon-svg" v-html="getSvg(item)"></span>
            </span>
            <span class="details-name" :title="item.name">{{ item.name }}</span>
          </span>
          <span class="details-col col-type">{{ item.isDirectory ? 'Folder' : formatType(item.name) }}</span>
          <span class="details-col col-size">{{ item.isDirectory ? '—' : formatSize(item.size) }}</span>
        </div>
        <div v-if="!sortedItems.length && !loading" class="empty-message">
          This folder is empty
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="loading-state">
        <span class="spinner" />
        <span>Loading…</span>
      </div>

      <!-- Error -->
      <div v-if="errorMsg" class="error-state">
        {{ errorMsg }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

/* ── Constants ── */
const DEFAULT_PATH = '/home';
const REFRESH_INTERVAL_MS = 5000;

/* ── Inline icon definitions (from desktop app) ── */

const svgAttrs = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const ICON_FOLDER = `<svg ${svgAttrs}><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`;
const ICON_FILE = `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const ICON_TEXT = `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;
const ICON_CODE = `<svg ${svgAttrs}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
const ICON_IMAGE = `<svg ${svgAttrs}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
const ICON_AUDIO = `<svg ${svgAttrs}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
const ICON_VIDEO = `<svg ${svgAttrs}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
const ICON_ARCHIVE = `<svg ${svgAttrs}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
const ICON_PDF = `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15v-2h1.5a1.5 1.5 0 010 3H9z"/></svg>`;
const ICON_APP = `<svg ${svgAttrs}><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
const ICON_SPREADSHEET = `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="12" y1="9" x2="12" y2="21"/></svg>`;
const ICON_CONFIG = `<svg ${svgAttrs}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`;

type IconCategory = 'folder' | 'file' | 'text' | 'code' | 'image' | 'audio' | 'video' | 'archive' | 'pdf' | 'app' | 'spreadsheet' | 'config';

const EXT_MAP: Record<string, IconCategory> = {
  txt: 'text', md: 'text', log: 'text', rtf: 'text',
  js: 'code', ts: 'code', vue: 'code', jsx: 'code', tsx: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code',
  c: 'code', cpp: 'code', h: 'code', hpp: 'code', cs: 'code',
  html: 'code', css: 'code', scss: 'code', less: 'code', sass: 'code',
  sh: 'code', bash: 'code', zsh: 'code', fish: 'code',
  sql: 'code', graphql: 'code', wasm: 'code',
  json: 'config', yaml: 'config', yml: 'config', toml: 'config',
  ini: 'config', xml: 'config', env: 'config', lock: 'config',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image',
  webp: 'image', ico: 'image', bmp: 'image', tiff: 'image', avif: 'image',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio', m4a: 'audio', wma: 'audio',
  mp4: 'video', webm: 'video', avi: 'video', mov: 'video', mkv: 'video', flv: 'video', wmv: 'video',
  zip: 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', xz: 'archive', '7z': 'archive', rar: 'archive',
  pdf: 'pdf',
  csv: 'spreadsheet', xls: 'spreadsheet', xlsx: 'spreadsheet', ods: 'spreadsheet',
  exe: 'app', dmg: 'app', appimage: 'app', deb: 'app', rpm: 'app',
};

const CATEGORY_ICON: Record<IconCategory, string> = {
  folder: ICON_FOLDER, file: ICON_FILE, text: ICON_TEXT, code: ICON_CODE,
  image: ICON_IMAGE, audio: ICON_AUDIO, video: ICON_VIDEO, archive: ICON_ARCHIVE,
  pdf: ICON_PDF, app: ICON_APP, spreadsheet: ICON_SPREADSHEET, config: ICON_CONFIG,
};
const CATEGORY_COLORS: Record<IconCategory, string> = {
  folder: '#f6c445', file: '#94a3b8', text: '#94a3b8', code: '#60a5fa',
  image: '#a78bfa', audio: '#f472b6', video: '#fb923c', archive: '#84cc16',
  pdf: '#ef4444', app: '#22d3ee', spreadsheet: '#34d399', config: '#94a3b8',
};

function categoryOf(name: string, isDir: boolean): IconCategory {
  if (isDir) return 'folder';
  const dot = name.lastIndexOf('.');
  if (dot === -1) return 'file';
  return EXT_MAP[name.slice(dot + 1).toLowerCase()] ?? 'file';
}

/* ── OPFS helpers ── */

function pathParts(p: string): string[] {
  const raw = p.split('/').filter(s => s.length > 0);
  const out: string[] = [];
  for (const part of raw) {
    if (part === '.') continue;
    if (part === '..') { if (out.length > 0) out.pop(); continue; }
    out.push(part);
  }
  return out;
}

function normalizePath(p: string): string {
  const parts = pathParts(p);
  return '/' + parts.join('/');
}

async function getDirHandle(root: FileSystemDirectoryHandle, p: string, create = false): Promise<FileSystemDirectoryHandle> {
  let h = root;
  for (const part of pathParts(p)) h = await h.getDirectoryHandle(part, { create });
  return h;
}

/* ── File item type ── */

interface FileItem {
  name: string;
  isDirectory: boolean;
  size: number;
}

/* ── State ── */

const currentPath = ref(DEFAULT_PATH);
const addressBarValue = ref(DEFAULT_PATH);
const items = ref<FileItem[]>([]);
const loading = ref(false);
const errorMsg = ref('');
const viewMode = ref<'icons' | 'list' | 'details'>('icons');

// Navigation history
const history = ref<string[]>([DEFAULT_PATH]);
const historyIndex = ref(0);

// Touch support: detect tap (not long-press/scroll)
let lastTouchStart = 0;

const canGoBack = computed(() => historyIndex.value > 0);
const canGoForward = computed(() => historyIndex.value < history.value.length - 1);
const canGoUp = computed(() => normalizePath(currentPath.value) !== '/');

const sortedItems = computed(() => {
  return [...items.value].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});

/* ── Icon helpers ── */

function getSvg(item: FileItem): string {
  return CATEGORY_ICON[categoryOf(item.name, item.isDirectory)];
}

function getColor(item: FileItem): string {
  return CATEGORY_COLORS[categoryOf(item.name, item.isDirectory)];
}

/* ── Format helpers ── */

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

function formatType(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return 'File';
  const ext = name.slice(dot + 1).toUpperCase();
  return `${ext} File`;
}

/* ── OPFS root ── */

let opfsRoot: FileSystemDirectoryHandle | null = null;

async function initOpfs(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('stark-orchestrator', { create: true });
  } catch {
    return null;
  }
}

/* ── Read directory ── */

async function readDir(path: string): Promise<void> {
  if (!opfsRoot) return;
  loading.value = true;
  errorMsg.value = '';

  try {
    const normalized = normalizePath(path);
    const dirHandle = await getDirHandle(opfsRoot, normalized, true);
    const entries: FileItem[] = [];

    for await (const [name, handle] of dirHandle.entries()) {
      let size = 0;
      if (handle.kind === 'file') {
        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          size = file.size;
        } catch {
          // Could not read file size
        }
      }
      entries.push({ name, isDirectory: handle.kind === 'directory', size });
    }

    items.value = entries;
    currentPath.value = normalized;
    addressBarValue.value = normalized;
  } catch (err) {
    console.warn('Files: failed to read directory:', err);
    errorMsg.value = `Cannot open: ${path}`;
    items.value = [];
  } finally {
    loading.value = false;
  }
}

/* ── Navigation ── */

function navigateTo(path: string, addToHistory = true): void {
  const normalized = normalizePath(path);
  if (addToHistory) {
    // Trim forward history when navigating to a new path
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push(normalized);
    historyIndex.value = history.value.length - 1;
  }
  readDir(normalized);
}

function goBack(): void {
  if (!canGoBack.value) return;
  historyIndex.value--;
  readDir(history.value[historyIndex.value]);
}

function goForward(): void {
  if (!canGoForward.value) return;
  historyIndex.value++;
  readDir(history.value[historyIndex.value]);
}

function goUp(): void {
  if (!canGoUp.value) return;
  const parts = pathParts(currentPath.value);
  parts.pop();
  navigateTo('/' + parts.join('/'));
}

function navigateToAddressBar(): void {
  const val = addressBarValue.value.trim();
  if (val) navigateTo(val);
}

/* ── Item activation (dblclick / tap) ── */

function onItemActivate(item: FileItem): void {
  if (item.isDirectory) {
    navigateTo(currentPath.value + '/' + item.name);
  }
}

function onTouchActivate(item: FileItem, event: TouchEvent): void {
  // Detect single tap (quick touch, not a scroll/long-press)
  const now = Date.now();
  const elapsed = now - lastTouchStart;
  lastTouchStart = now;

  // If this is a second tap within 400ms, treat as double-tap
  if (elapsed < 400) {
    event.preventDefault();
    onItemActivate(item);
  }
}

/* ── Read initial path from context ── */

function getInitialPath(): string {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { args?: string[] } | undefined;
    const arg = ctx?.args?.[0];
    if (arg && typeof arg === 'string' && arg.trim().length > 0) {
      return normalizePath(arg.trim());
    }
  } catch {
    /* cross-origin or no parent — ignore */
  }
  return DEFAULT_PATH;
}

/* ── Periodic refresh ── */

let refreshInterval: ReturnType<typeof setInterval> | null = null;

/* ── Lifecycle ── */

onMounted(async () => {
  opfsRoot = await initOpfs();
  const initialPath = getInitialPath();
  history.value = [initialPath];
  historyIndex.value = 0;
  await readDir(initialPath);

  refreshInterval = setInterval(() => readDir(currentPath.value), REFRESH_INTERVAL_MS);
});

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<style scoped>
.files-app {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  color: #e2e8f0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

/* ── Toolbar ── */

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #1e293b;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.nav-buttons {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
}
.nav-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.address-bar {
  flex: 1;
  min-width: 0;
}

.address-input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 0.8rem;
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  outline: none;
  transition: border-color 0.15s;
}
.address-input:focus {
  border-color: rgba(59, 130, 246, 0.5);
}

.view-buttons {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #64748b;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.view-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}
.view-btn.active {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

/* ── Content ── */

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.content::-webkit-scrollbar {
  width: 6px;
}
.content::-webkit-scrollbar-track {
  background: transparent;
}
.content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

/* ── Icons view ── */

.icons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  grid-auto-rows: 90px;
  gap: clamp(2px, 0.5vw, 6px);
  padding: clamp(4px, 1vw, 12px);
  align-content: start;
}

@media (max-width: 480px) {
  .icons-grid {
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    grid-auto-rows: 80px;
  }
}

.icon-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 6px;
  cursor: default;
  transition: background 0.15s;
  user-select: none;
}
.icon-cell:hover {
  background: rgba(255, 255, 255, 0.06);
}

.icon-wrapper {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  pointer-events: none;
}

.icon-svg {
  width: 100%;
  height: 100%;
}
.icon-svg :deep(svg) {
  width: 100%;
  height: 100%;
}

.icon-label {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.2;
  color: #cbd5e1;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

/* ── List view ── */

.list-view {
  padding: 4px 0;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  cursor: default;
  user-select: none;
  transition: background 0.12s;
}
.list-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.list-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.list-icon .icon-svg {
  width: 100%;
  height: 100%;
}

.list-name {
  font-size: 0.82rem;
  color: #cbd5e1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ── Details view ── */

.details-view {
  font-size: 0.8rem;
}

.details-header {
  display: flex;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 600;
  color: #94a3b8;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  position: sticky;
  top: 0;
  background: #0f172a;
  z-index: 1;
}

.details-row {
  display: flex;
  padding: 5px 12px;
  cursor: default;
  user-select: none;
  transition: background 0.12s;
}
.details-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.details-col {
  display: flex;
  align-items: center;
  overflow: hidden;
}

.col-name {
  flex: 1;
  min-width: 0;
  gap: 8px;
}
.col-type {
  width: 100px;
  flex-shrink: 0;
  color: #94a3b8;
}
.col-size {
  width: 80px;
  flex-shrink: 0;
  justify-content: flex-end;
  color: #94a3b8;
}

@media (max-width: 480px) {
  .col-type {
    display: none;
  }
  .col-size {
    width: 60px;
  }
}

.details-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: inline-flex;
}
.details-icon .icon-svg {
  width: 100%;
  height: 100%;
}

.details-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  color: #cbd5e1;
}

/* ── Empty / Loading / Error ── */

.empty-message {
  padding: 40px 18px;
  text-align: center;
  color: #64748b;
  font-size: 0.85rem;
  grid-column: 1 / -1;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 18px;
  color: #64748b;
  font-size: 0.85rem;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  padding: 20px 18px;
  text-align: center;
  color: #f87171;
  font-size: 0.85rem;
}
</style>
