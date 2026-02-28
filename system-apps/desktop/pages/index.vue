<template>
  <div
    ref="gridContainer"
    class="desktop-grid"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
  >
    <div
      v-for="(item, index) in orderedItems"
      :key="item.name"
      class="grid-cell"
      :class="{ 'drag-over': dropTargetIndex === index }"
      :draggable="true"
      @dragstart="onDragStart(index, $event)"
      @dragend="onDragEnd"
      @dragenter.prevent="onDragEnter(index)"
      @dragleave="onDragLeave(index)"
      @touchstart="onTouchStart(index, $event)"
      @touchmove.prevent="onTouchMove($event)"
      @touchend="onTouchEnd"
    >
      <div class="icon-wrapper" :style="{ color: getColor(item) }">
        <div class="icon-svg" v-html="getSvg(item)"></div>
      </div>
      <span class="icon-label" :title="item.name">{{ item.name }}</span>
    </div>

    <!-- Ghost element for touch drag -->
    <div
      v-if="touchDragGhost"
      class="touch-ghost"
      :style="{
        left: touchDragGhost.x + 'px',
        top: touchDragGhost.y + 'px',
        color: touchDragGhost.color,
      }"
    >
      <div class="icon-svg" v-html="touchDragGhost.svg"></div>
      <span class="icon-label">{{ touchDragGhost.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

/*
 * We inline the shared helpers rather than importing from the Nuxt layer
 * so the desktop app can run standalone without a layer dependency at
 * build time.  The canonical source lives in examples/shared/utils/.
 */

// ── Inline icon definitions (from examples/shared/utils/icons.ts) ──

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

// ── OPFS helpers (from examples/shared/utils/opfs.ts) ──

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

async function getDirHandle(root: FileSystemDirectoryHandle, p: string, create = false): Promise<FileSystemDirectoryHandle> {
  let h = root;
  for (const part of pathParts(p)) h = await h.getDirectoryHandle(part, { create });
  return h;
}

async function getFileHandleHelper(root: FileSystemDirectoryHandle, p: string, create = false): Promise<FileSystemFileHandle> {
  const parts = pathParts(p);
  if (!parts.length) throw new Error('Cannot open root as a file');
  const fname = parts.pop()!;
  let h = root;
  for (const part of parts) h = await h.getDirectoryHandle(part, { create });
  return h.getFileHandle(fname, { create });
}

// ── Desktop item type ──

interface DesktopItem {
  name: string;
  isDirectory: boolean;
}

// ── Arrangement config path ──
const ARRANGEMENT_PATH = '/home/.stark/desktop';

// ── State ──

const gridContainer = ref<HTMLDivElement | null>(null);
const items = ref<DesktopItem[]>([]);
const arrangementOrder = ref<string[]>([]);
const dragSourceIndex = ref<number | null>(null);
const dropTargetIndex = ref<number | null>(null);

// Touch drag state
const touchDragGhost = ref<{ x: number; y: number; svg: string; color: string; name: string } | null>(null);
let touchDragSourceIndex: number | null = null;
let touchStartTimer: ReturnType<typeof setTimeout> | null = null;
let isTouchDragging = false;

// ── Computed: merge items with saved order ──

const orderedItems = computed(() => {
  const order = arrangementOrder.value;
  if (!order.length) return items.value;

  const byName = new Map(items.value.map(item => [item.name, item]));
  const result: DesktopItem[] = [];

  // Add items in saved order first
  for (const name of order) {
    const item = byName.get(name);
    if (item) {
      result.push(item);
      byName.delete(name);
    }
  }

  // Append any new items not in the saved order
  for (const item of byName.values()) {
    result.push(item);
  }

  return result;
});

// ── Icon helpers ──

function getSvg(item: DesktopItem): string {
  return CATEGORY_ICON[categoryOf(item.name, item.isDirectory)];
}

function getColor(item: DesktopItem): string {
  return CATEGORY_COLORS[categoryOf(item.name, item.isDirectory)];
}

// ── OPFS root handle ──

let opfsRoot: FileSystemDirectoryHandle | null = null;

async function initOpfs(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('stark-orchestrator', { create: true });
  } catch {
    return null;
  }
}

async function readDesktopDir(): Promise<void> {
  if (!opfsRoot) return;

  try {
    // Ensure /home/desktop exists
    await getDirHandle(opfsRoot, '/home/desktop', true);

    const dirHandle = await getDirHandle(opfsRoot, '/home/desktop');
    const entries: DesktopItem[] = [];
    for await (const [name, handle] of dirHandle.entries()) {
      entries.push({ name, isDirectory: handle.kind === 'directory' });
    }
    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    items.value = entries;
  } catch (err) {
    console.warn('Desktop: failed to read /home/desktop:', err);
    items.value = [];
  }
}

async function loadArrangement(): Promise<void> {
  if (!opfsRoot) return;
  try {
    const fh = await getFileHandleHelper(opfsRoot, ARRANGEMENT_PATH);
    const file = await fh.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data.order)) {
      arrangementOrder.value = data.order;
    }
  } catch {
    // No arrangement file yet — that's fine
    arrangementOrder.value = [];
  }
}

async function saveArrangement(): Promise<void> {
  if (!opfsRoot) return;
  try {
    // Ensure /home/.stark exists
    await getDirHandle(opfsRoot, '/home/.stark', true);

    const fh = await getFileHandleHelper(opfsRoot, ARRANGEMENT_PATH, true);
    const writable = await fh.createWritable();
    const data = JSON.stringify({ order: orderedItems.value.map(i => i.name) }, null, 2);
    await writable.write(new TextEncoder().encode(data));
    await writable.close();
  } catch (err) {
    console.warn('Desktop: failed to save arrangement:', err);
  }
}

// ── Drag & Drop (mouse) ──

function onDragStart(index: number, event: DragEvent): void {
  dragSourceIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function onDragEnd(): void {
  dragSourceIndex.value = null;
  dropTargetIndex.value = null;
}

function onDragOver(event: DragEvent): void {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function onDragEnter(index: number): void {
  if (dragSourceIndex.value !== null && dragSourceIndex.value !== index) {
    dropTargetIndex.value = index;
  }
}

function onDragLeave(index: number): void {
  if (dropTargetIndex.value === index) {
    dropTargetIndex.value = null;
  }
}

function onDrop(event: DragEvent): void {
  const from = dragSourceIndex.value;
  const to = dropTargetIndex.value;

  dragSourceIndex.value = null;
  dropTargetIndex.value = null;

  if (from === null || to === null || from === to) return;

  // Reorder
  const arr = [...orderedItems.value];
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);

  // Update arrangement
  arrangementOrder.value = arr.map(i => i.name);
  saveArrangement();
}

// ── Drag & Drop (touch) ──

function onTouchStart(index: number, event: TouchEvent): void {
  touchDragSourceIndex = index;
  isTouchDragging = false;

  // Long-press to start drag (300ms)
  touchStartTimer = setTimeout(() => {
    isTouchDragging = true;
    const touch = event.touches[0];
    const item = orderedItems.value[index];
    const cat = categoryOf(item.name, item.isDirectory);
    touchDragGhost.value = {
      x: touch.clientX - 30,
      y: touch.clientY - 30,
      svg: CATEGORY_ICON[cat],
      color: CATEGORY_COLORS[cat],
      name: item.name,
    };
  }, 300);
}

function onTouchMove(event: TouchEvent): void {
  if (!isTouchDragging || !touchDragGhost.value) {
    // Cancel the long-press if finger moves before timer fires
    if (touchStartTimer) {
      clearTimeout(touchStartTimer);
      touchStartTimer = null;
    }
    return;
  }

  const touch = event.touches[0];
  touchDragGhost.value.x = touch.clientX - 30;
  touchDragGhost.value.y = touch.clientY - 30;

  // Find which grid cell the touch is over
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el) {
    const cell = el.closest('.grid-cell') as HTMLElement | null;
    if (cell && gridContainer.value) {
      const cells = Array.from(gridContainer.value.querySelectorAll('.grid-cell'));
      const idx = cells.indexOf(cell);
      if (idx >= 0 && idx !== touchDragSourceIndex) {
        dropTargetIndex.value = idx;
      }
    }
  }
}

function onTouchEnd(): void {
  if (touchStartTimer) {
    clearTimeout(touchStartTimer);
    touchStartTimer = null;
  }

  if (isTouchDragging && touchDragSourceIndex !== null && dropTargetIndex.value !== null) {
    const from = touchDragSourceIndex;
    const to = dropTargetIndex.value;
    if (from !== to) {
      const arr = [...orderedItems.value];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      arrangementOrder.value = arr.map(i => i.name);
      saveArrangement();
    }
  }

  touchDragGhost.value = null;
  touchDragSourceIndex = null;
  dropTargetIndex.value = null;
  isTouchDragging = false;
}

// ── Periodic refresh ──

let refreshInterval: ReturnType<typeof setInterval> | null = null;

// ── Lifecycle ──

onMounted(async () => {
  opfsRoot = await initOpfs();
  await loadArrangement();
  await readDesktopDir();

  // Refresh every 5 seconds to pick up terminal changes
  refreshInterval = setInterval(() => readDesktopDir(), 5000);
});

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval);
  if (touchStartTimer) clearTimeout(touchStartTimer);
});
</script>

<style scoped>
.desktop-grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  grid-auto-rows: 90px;
  align-content: start;
  gap: 4px;
  padding: 8px;
  overflow-y: auto;
  user-select: none;
}

/* Responsive columns: fewer columns at smaller widths */
@media (max-width: 480px) {
  .desktop-grid {
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    grid-auto-rows: 80px;
    gap: 2px;
    padding: 4px;
  }
}

@media (min-width: 481px) and (max-width: 768px) {
  .desktop-grid {
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    grid-auto-rows: 84px;
  }
}

@media (min-width: 1200px) {
  .desktop-grid {
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    grid-auto-rows: 96px;
  }
}

.grid-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 6px;
  cursor: default;
  transition: background 0.15s ease;
}

.grid-cell:hover {
  background: rgba(255, 255, 255, 0.08);
}

.grid-cell.drag-over {
  background: rgba(59, 130, 246, 0.2);
  outline: 2px dashed rgba(59, 130, 246, 0.5);
  outline-offset: -2px;
  border-radius: 6px;
}

.icon-wrapper {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

@media (max-width: 480px) {
  .icon-wrapper {
    width: 32px;
    height: 32px;
  }
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
  color: #e2e8f0;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

@media (max-width: 480px) {
  .icon-label {
    font-size: 10px;
  }
}

/* Touch drag ghost */
.touch-ghost {
  position: fixed;
  z-index: 999999;
  width: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  opacity: 0.85;
}

.touch-ghost .icon-svg {
  width: 40px;
  height: 40px;
}

.touch-ghost .icon-label {
  font-size: 10px;
}
</style>
