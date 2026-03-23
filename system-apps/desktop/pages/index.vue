<template>
  <div
    ref="gridContainer"
    class="desktop-grid"
    tabindex="0"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
    @click="onBackgroundClick"
    @keydown="onKeyDown"
    @contextmenu.prevent="onBackgroundContext($event)"
  >
    <div
      v-for="(slot, index) in displaySlots"
      :key="slot ? slot.name : `empty-${index}`"
      class="grid-cell"
      :class="{
        'drag-over': dropTargetIndex === index,
        'empty-slot': !slot,
        'selected': slot && selectedNames.has(slot.name),
      }"
      :draggable="!!slot"
      @click.stop="onItemClick(index, $event)"
      @dblclick="onDblClick(index)"
      @contextmenu.prevent.stop="onGridCellContext(index, slot, $event)"
      @dragstart="onDragStart(index, $event)"
      @dragend="onDragEnd"
      @dragenter.prevent="onDragEnter(index)"
      @dragleave="onDragLeave(index)"
      @touchstart="onTouchStart(index, $event)"
      @touchmove.prevent="onTouchMove($event)"
      @touchend="onTouchEnd(index)"
    >
      <template v-if="slot">
        <div class="icon-wrapper" :style="{ color: getColor(slot) }">
          <img v-if="shortcutIcons[slot.name]" :src="shortcutIcons[slot.name]" class="shortcut-icon-img" />
          <div v-else class="icon-svg" v-html="getSvg(slot)"></div>
        </div>
        <input
          v-if="renaming.active && renaming.name === slot.name"
          ref="renameInputEl"
          class="rename-input"
          v-model="renaming.newName"
          @keydown.enter.stop="confirmRename"
          @keydown.escape.stop="cancelRename"
          @blur="confirmRename"
          @click.stop
          @dblclick.stop
        />
        <span v-else class="icon-label" :title="slot.name">{{ displayLabel(slot) }}</span>
      </template>
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

    <!-- Context menu -->
    <div
      v-if="ctxMenu.show"
      ref="ctxMenuEl"
      class="ctx-menu"
      :style="ctxMenuStyle"
      @click.stop
    >
      <template v-if="ctxMenu.itemName">
        <div v-if="ctxMenu.itemName && ctxMenu.itemName.endsWith('.pack.js')" class="ctx-item ctx-item-install" @click="ctxInstallPack">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Install
        </div>
        <div class="ctx-item" @click="ctxOpenWith">Open With…</div>
        <div class="ctx-item" @click="ctxDownload">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </div>
        <div class="ctx-item" @click="ctxZip">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          Zip
        </div>
        <div v-if="ctxMenu.itemName && ctxMenu.itemName.toLowerCase().endsWith('.zip')" class="ctx-item" @click="ctxExtractZip">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          Extract
        </div>
        <div v-if="ctxMenu.itemName !== 'trash'" class="ctx-item" @click="ctxCopy">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Copy
        </div>
        <div v-if="ctxMenu.itemName !== 'trash'" class="ctx-item" @click="ctxCut">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
          Cut
        </div>
        <div v-if="ctxMenu.itemName !== 'trash'" class="ctx-item" @click="ctxRename">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Rename
        </div>
        <div v-if="ctxMenu.itemName !== 'trash'" class="ctx-item ctx-item-danger" @click="ctxDelete">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          Delete
        </div>
        <div v-if="ctxMenu.itemName === 'trash'" class="ctx-item ctx-item-danger" @click="ctxEmptyTrash">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          Empty Trash
        </div>
        <div class="ctx-separator"></div>
      </template>
      <div class="ctx-item" @click="ctxPaste">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        Paste
      </div>
      <div class="ctx-separator"></div>
      <div class="ctx-item" @click="ctxNewFile">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        New File
      </div>
      <div class="ctx-item" @click="ctxAddShortcut">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        Add Shortcut
      </div>
      <div class="ctx-item" @click="ctxNewFolder">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        New Folder
      </div>
      <div class="ctx-item" @click="ctxUpload">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Upload Files
      </div>
    </div>

    <!-- Hidden file input for uploads -->
    <input
      ref="fileInput"
      type="file"
      multiple
      style="display: none"
      @change="onFilesSelected"
    />

    <!-- Open With dialog (from shared layer, auto-registered by Nuxt) -->
    <OpenWithDialog
      :visible="owDialog.show"
      :filenames="owDialog.filenames"
      :packs="owDialog.packs"
      :loading="owDialog.loading"
      @select="onOpenWithSelect"
      @cancel="owDialog.show = false"
      @update:visible="owDialog.show = $event"
    />

    <!-- Install Pack dialog for .pack.js files -->
    <InstallPackDialog
      :visible="installPackDialog.show"
      :file-name="installPackDialog.fileName"
      :file-path="installPackDialog.filePath"
      @cancel="installPackDialog.show = false"
      @installed="onPackInstalled"
      @update:visible="installPackDialog.show = $event"
    />

    <!-- Add Shortcut dialog -->
    <AddShortcutDialog
      :visible="shortcutDialog.show"
      :target-dir="DESKTOP_PATH"
      @created="onShortcutCreated"
      @cancel="shortcutDialog.show = false"
      @update:visible="shortcutDialog.show = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
// Types need explicit imports; util functions are auto-imported by the shared Nuxt layer
import type { IntentStore, IntentPackInfo, ShortcutData } from '../../../examples/shared/utils';
// fileops is NOT barrel-exported (heavy JSZip dep) — import directly
import { zipItems, moveToTrash, createEmptyFile, createFolder, uploadFiles, ensureTrash, emptyTrash, downloadItems, renameItem, moveItems, copyItems, buildClipboardText, parseClipboard, extractSourceDir, conflictMessage, TRASH_PATH, extractZip } from '../../../examples/shared/utils/lib/fileops';

/* ── Tunable constants ── */
const LONG_PRESS_MS = 300;
const GHOST_OFFSET_PX = 30;
const REFRESH_INTERVAL_MS = 5000;
const MOBILE_BREAKPOINT = 768;

// ── Desktop item type ──

interface DesktopItem {
  name: string;
  isDirectory: boolean;
}

// ── Arrangement config path ──
const ARRANGEMENT_PATH = '/home/.stark/desktop';

// ── Icon layout modes ──
type IconMode = 'desktop' | 'portrait' | 'landscape';

// ── State ──

const gridContainer = ref<HTMLDivElement | null>(null);
const items = ref<DesktopItem[]>([]);
const sparseDesktop = ref<(string | null)[]>([]);
const sparsePortrait = ref<(string | null)[]>([]);
const sparseLandscape = ref<(string | null)[]>([]);
const visitedModes = reactive(new Set<IconMode>());
const compactArrangement = ref<string[]>([]);
const dragSourceIndex = ref<number | null>(null);
const dropTargetIndex = ref<number | null>(null);

// Container size (tracked via ResizeObserver for slot computation)
const containerWidth = ref(0);
const containerHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

// Touch drag state
const touchDragGhost = ref<{ x: number; y: number; svg: string; color: string; name: string } | null>(null);
let touchDragSourceIndex: number | null = null;
let touchStartTimer: ReturnType<typeof setTimeout> | null = null;
let isTouchDragging = false;

// Touch tap detection for folder open
// Debounce guard to prevent double-open
let lastLaunchTime = 0;

// Intent store (loaded once)
let intentStore: IntentStore = { defaults: {} };

// Context menu
const ctxMenu = reactive({ show: false, x: 0, y: 0, itemName: '', isDir: false });
const ctxMenuEl = ref<HTMLDivElement | null>(null);

// File upload input ref
const fileInput = ref<HTMLInputElement | null>(null);

// Multi-selection (Ctrl/Cmd + click)
const selectedNames = reactive(new Set<string>());

// Rename input ref
const renameInputEl = ref<HTMLInputElement | null>(null);

// Open With dialog
const owDialog = reactive({
  show: false,
  filenames: [] as string[],
  filePaths: [] as string[],
  packs: [] as IntentPackInfo[],
  loading: false,
});

/** Install pack dialog for .pack.js files */
const installPackDialog = reactive({
  show: false,
  fileName: '',
  filePath: '',
});

/** Add Shortcut dialog */
const shortcutDialog = reactive({ show: false });

/** Cached shortcut icon base64 data URIs keyed by file name. */
const shortcutIcons = reactive<Record<string, string>>({});

// ── Grid slot computation ──

/** Current icon layout mode based on container dimensions. */
const currentMode = computed<IconMode>(() => {
  const w = containerWidth.value;
  const h = containerHeight.value;
  if (w === 0 || h === 0) return 'desktop'; // default before measurement
  if (w > MOBILE_BREAKPOINT) return 'desktop';
  return h >= w ? 'portrait' : 'landscape';
});

/** Writable computed that delegates to the per-mode sparse ref. */
const sparseArrangement = computed({
  get(): (string | null)[] {
    switch (currentMode.value) {
      case 'desktop':   return sparseDesktop.value;
      case 'portrait':  return sparsePortrait.value;
      case 'landscape': return sparseLandscape.value;
    }
  },
  set(val: (string | null)[]) {
    switch (currentMode.value) {
      case 'desktop':   sparseDesktop.value = val; break;
      case 'portrait':  sparsePortrait.value = val; break;
      case 'landscape': sparseLandscape.value = val; break;
    }
  },
});

/** Number of grid slots that fit in the visible container (floored to avoid scrollbar). */
const totalSlots = computed(() => {
  const w = containerWidth.value;
  const h = containerHeight.value;
  if (w === 0 || h === 0) return items.value.length || 1;

  // Breakpoints & sizes mirror the CSS media-query values above
  let minCellW = 80, rowH = 90;
  if (w <= 480)       { minCellW = 64; rowH = 80; }
  else if (w <= 768)  { minCellW = 72; rowH = 84; }
  else if (w >= 1200) { minCellW = 88; rowH = 96; }

  // Gap ≈ CSS clamp(0px, 0.5vw, 4px), Padding ≈ CSS clamp(2px, 1vw, 8px)
  const gap = Math.max(0, Math.min(w * 0.005, 4));
  const pad = Math.max(2, Math.min(w * 0.01, 8));

  // CSS auto-fill formula: floor((available + gap) / (min + gap))
  // because N columns occupy N*min + (N-1)*gap = N*(min+gap) - gap
  const availW = w - 2 * pad;
  const cols = Math.max(1, Math.floor((availW + gap) / (minCellW + gap)));
  const availH = h - 2 * pad;
  const rows = Math.max(1, Math.floor(availH / (rowH + gap)));

  return Math.max(items.value.length, cols * rows);
});

/**
 * Grid slots: always sparse — preserve positions within the grid and
 * relocate any displaced items (beyond the grid boundary or new items)
 * to the first available positions.  This lets the user create gaps by
 * dragging even after a resize or mode switch shrinks the grid.
 */
const displaySlots = computed<Array<DesktopItem | null>>(() => {
  const byName = new Map(items.value.map(item => [item.name, item]));
  const slots = totalSlots.value;
  const out: Array<DesktopItem | null> = new Array(slots).fill(null);

  const order = sparseArrangement.value;

  // 1. Place items at their sparse positions (within grid bounds only)
  const placed = new Set<string>();
  for (let i = 0; i < Math.min(order.length, slots); i++) {
    const name = order[i];
    if (name && byName.has(name)) {
      out[i] = byName.get(name)!;
      placed.add(name);
    }
  }

  // 2. Collect displaced items (beyond grid boundary) + brand-new items
  const unplaced: string[] = [];
  for (let i = slots; i < order.length; i++) {
    const name = order[i];
    if (name && byName.has(name) && !placed.has(name)) {
      unplaced.push(name);
      placed.add(name);
    }
  }
  for (const item of items.value) {
    if (!placed.has(item.name)) {
      unplaced.push(item.name);
    }
  }

  // 3. Pack displaced / new items into the first available null slots
  let nextNull = 0;
  for (const name of unplaced) {
    while (nextNull < slots && out[nextNull] !== null) nextNull++;
    if (nextNull < slots) { out[nextNull] = byName.get(name)!; nextNull++; }
  }

  return out;
});

// ── Context menu position (auto-flip when near edges) ──

const ctxMenuStyle = computed(() => {
  const style: Record<string, string> = {};
  const menuW = ctxMenuEl.value?.offsetWidth ?? 180;
  const menuH = ctxMenuEl.value?.offsetHeight ?? 200;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Flip left if it would overflow the right edge
  if (ctxMenu.x + menuW > vw) {
    style.left = Math.max(0, ctxMenu.x - menuW) + 'px';
  } else {
    style.left = ctxMenu.x + 'px';
  }

  // Flip upward if it would overflow the bottom edge
  if (ctxMenu.y + menuH > vh) {
    style.top = Math.max(0, ctxMenu.y - menuH) + 'px';
  } else {
    style.top = ctxMenu.y + 'px';
  }

  return style;
});

// ── Icon helpers (using shared utilities) ──

function getSvg(item: DesktopItem): string {
  if (item.name === 'trash') return ICON_TRASH;
  return getIconSvg(item.name, item.isDirectory);
}

function getColor(item: DesktopItem): string {
  if (item.name === 'trash') return '#94a3b8';
  return getIconColor(item.name, item.isDirectory);
}

/** Display name: hide .lnk extension except during rename. */
function displayLabel(item: DesktopItem): string {
  return displayNameForShortcut(item.name);
}

// ── OPFS root handle ──

let opfsRoot: FileSystemDirectoryHandle | null = null;

async function readDesktopDir(): Promise<void> {
  if (!opfsRoot) return;

  try {
    // Ensure /home/desktop exists
    await getDirectoryHandle(opfsRoot, '/home/desktop', true);

    const dirHandle = await getDirectoryHandle(opfsRoot, '/home/desktop');
    const entries: DesktopItem[] = [];
    for await (const [name, handle] of dirHandle.entries()) {
      entries.push({ name, isDirectory: handle.kind === 'directory' });
    }
    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Add synthetic trash icon if not already present (trash lives at /trash, not in /home/desktop)
    if (!entries.some(e => e.name === 'trash')) {
      entries.push({ name: 'trash', isDirectory: true });
    }

    items.value = entries;

    // Load shortcut icons in background
    loadShortcutIcons(entries);
  } catch (err) {
    console.warn('Desktop: failed to read /home/desktop:', err);
    items.value = [{ name: 'trash', isDirectory: true }];
  }
}

/** Read .lnk files and cache their icon base64 data for display. */
async function loadShortcutIcons(entries: DesktopItem[]): Promise<void> {
  const lnkFiles = entries.filter((e) => !e.isDirectory && isShortcutFile(e.name));
  for (const f of lnkFiles) {
    const filePath = DESKTOP_PATH + '/' + f.name;
    const data = await readShortcutFile(filePath);
    if (data?.iconBase64) {
      shortcutIcons[f.name] = data.iconBase64;
    } else {
      delete shortcutIcons[f.name];
    }
  }
}

async function loadArrangement(): Promise<void> {
  if (!opfsRoot) return;
  try {
    const fh = await getFileHandle(opfsRoot, ARRANGEMENT_PATH);
    const file = await fh.getFile();
    const text = await file.text();
    const data = JSON.parse(text);

    // New per-mode format
    if (Array.isArray(data.sparse_desktop)) {
      sparseDesktop.value = data.sparse_desktop;
    }
    if (Array.isArray(data.sparse_portrait)) {
      sparsePortrait.value = data.sparse_portrait;
    }
    if (Array.isArray(data.sparse_landscape)) {
      sparseLandscape.value = data.sparse_landscape;
    }

    // Backward compat: old single sparse → desktop
    if (!data.sparse_desktop) {
      if (Array.isArray(data.sparse)) {
        sparseDesktop.value = data.sparse;
      } else if (Array.isArray(data.order)) {
        sparseDesktop.value = data.order;
      }
    }

    // Restore visited modes
    if (Array.isArray(data.visited)) {
      for (const m of data.visited) visitedModes.add(m as IconMode);
    } else if (sparseDesktop.value.length > 0) {
      // Backward compat: if we had an arrangement, assume desktop was visited
      visitedModes.add('desktop');
    }

    if (Array.isArray(data.compact)) {
      compactArrangement.value = data.compact;
    } else {
      // Derive compact from whatever sparse we have
      const sparse = sparseDesktop.value;
      compactArrangement.value = sparse.filter((n): n is string => n !== null);
    }
  } catch {
    // No arrangement file yet — that's fine
    sparseDesktop.value = [];
    sparsePortrait.value = [];
    sparseLandscape.value = [];
    compactArrangement.value = [];
  }
}

async function saveArrangement(): Promise<void> {
  if (!opfsRoot) return;
  try {
    // Ensure /home/.stark exists
    await getDirectoryHandle(opfsRoot, '/home/.stark', true);

    const fh = await getFileHandle(opfsRoot, ARRANGEMENT_PATH, true);
    const writable = await fh.createWritable();
    const data = JSON.stringify({
      sparse_desktop: sparseDesktop.value,
      sparse_portrait: sparsePortrait.value,
      sparse_landscape: sparseLandscape.value,
      compact: compactArrangement.value,
      visited: [...visitedModes],
    }, null, 2);
    await writable.write(new TextEncoder().encode(data));
    await writable.close();
  } catch (err) {
    console.warn('Desktop: failed to save arrangement:', err);
  }
}

// ── Shared reorder helper ──

function reorderItems(from: number, to: number): void {
  // Capture current full grid state as sparse name array, then swap positions
  const newOrder: (string | null)[] = displaySlots.value.map(s => s?.name ?? null);
  const movedName = newOrder[from];
  if (!movedName) return;

  newOrder[from] = newOrder[to]; // swap (target may be null or another item)
  newOrder[to] = movedName;

  // Always save as sparse — gaps (nulls) are preserved
  sparseArrangement.value = newOrder;
  // Keep compact in sync for future mode initializations
  compactArrangement.value = newOrder.filter((n): n is string => n !== null);
  saveArrangement();
}

// ── Drag & Drop (mouse) ──

function isDropFolderTarget(item: DesktopItem | null): boolean {
  return !!item && item.isDirectory && item.name !== 'trash';
}

function isDropTrashTarget(item: DesktopItem | null): boolean {
  return !!item && item.name === 'trash';
}

function handleDropOnTrash(from: number): void {
  const draggedItem = displaySlots.value[from];
  if (!draggedItem || draggedItem.name === 'trash') return;
  let namesToTrash: string[];
  if (selectedNames.has(draggedItem.name)) {
    namesToTrash = [...selectedNames].filter(n => n !== 'trash');
  } else {
    namesToTrash = [draggedItem.name];
  }
  if (namesToTrash.length > 0) {
    doDelete(namesToTrash);
  }
}

function handleDropOnFolder(from: number, to: number): void {
  const targetItem = displaySlots.value[to];
  const draggedItem = displaySlots.value[from];
  if (!targetItem || !draggedItem) return;
  let namesToMove: string[];
  if (selectedNames.has(draggedItem.name)) {
    namesToMove = [...selectedNames].filter(n => n !== targetItem.name && n !== 'trash');
  } else {
    namesToMove = [draggedItem.name];
  }
  if (namesToMove.length > 0) {
    doMoveIntoFolder(DESKTOP_PATH, targetItem.name, namesToMove);
  }
}

function onDragStart(index: number, event: DragEvent): void {
  if (!displaySlots.value[index]) { event.preventDefault(); return; }
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

  if (isDropTrashTarget(displaySlots.value[to]) && displaySlots.value[from]) {
    handleDropOnTrash(from);
  } else if (isDropFolderTarget(displaySlots.value[to]) && displaySlots.value[from]) {
    handleDropOnFolder(from, to);
  } else {
    reorderItems(from, to);
  }
}

// ── Drag & Drop (touch) ──

function onTouchStart(index: number, event: TouchEvent): void {
  const item = displaySlots.value[index];
  if (!item) return;
  touchDragSourceIndex = index;
  isTouchDragging = false;

  // Long-press to start drag
  touchStartTimer = setTimeout(() => {
    isTouchDragging = true;
    const touch = event.touches[0];
    touchDragGhost.value = {
      x: touch.clientX - GHOST_OFFSET_PX,
      y: touch.clientY - GHOST_OFFSET_PX,
      svg: getIconSvg(item.name, item.isDirectory),
      color: getIconColor(item.name, item.isDirectory),
      name: item.name,
    };
  }, LONG_PRESS_MS);
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
  touchDragGhost.value.x = touch.clientX - GHOST_OFFSET_PX;
  touchDragGhost.value.y = touch.clientY - GHOST_OFFSET_PX;

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

function onTouchEnd(index: number): void {
  if (touchStartTimer) {
    clearTimeout(touchStartTimer);
    touchStartTimer = null;
  }

  if (isTouchDragging && touchDragSourceIndex !== null && dropTargetIndex.value !== null) {
    const from = touchDragSourceIndex;
    const to = dropTargetIndex.value;
    if (from !== to) {
      if (isDropTrashTarget(displaySlots.value[to]) && displaySlots.value[from]) {
        handleDropOnTrash(from);
      } else if (isDropFolderTarget(displaySlots.value[to]) && displaySlots.value[from]) {
        handleDropOnFolder(from, to);
      } else {
        reorderItems(from, to);
      }
    }
  }

  // Single tap to open folder on mobile (debounce prevents double-open)
  if (!isTouchDragging) {
    const item = displaySlots.value[index];
    if (item) {
      onDblClick(index);
    } else {
      // Tapping an empty slot deselects everything
      selectedNames.clear();
      ctxMenu.show = false;
    }
  }

  touchDragGhost.value = null;
  touchDragSourceIndex = null;
  dropTargetIndex.value = null;
  isTouchDragging = false;
}

// ── Double-click / tap to open item ──

function onDblClick(index: number): void {
  const now = Date.now();
  if (now - lastLaunchTime < 1000) return; // debounce to prevent double-open
  const item = displaySlots.value[index];
  if (!item) return;
  lastLaunchTime = now;
  ctxMenu.show = false;

  if (item.name === 'trash') {
    // Trash shortcut: open files app in /trash
    launchPack('files', [TRASH_PATH]);
  } else if (item.isDirectory) {
    launchPack('files', ['/home/desktop/' + item.name]);
  } else if (isShortcutFile(item.name)) {
    // Launch pod from shortcut data
    const filePath = normalizePath('/home/desktop/' + item.name);
    readShortcutFile(filePath).then((data) => {
      if (data) {
        launchShortcut(data);
      }
    });
  } else if (item.name.toLowerCase().endsWith('.zip')) {
    // Open zip archive in files app for browsing
    launchPack('files', ['/home/desktop/' + item.name + '/root']);
  } else {
    // Open file via intent system
    const filePath = normalizePath('/home/desktop/' + item.name);
    openFilesWithIntent(intentStore, [item.name], [filePath]).then((result) => {
      if (!result.resolved) {
        showOpenWithDialog(result.filenames, result.filePaths);
      }
    });
  }
}

function onItemClick(index: number, event: MouseEvent): void {
  const item = displaySlots.value[index];
  ctxMenu.show = false;

  if (!item) {
    // Clicking an empty slot deselects everything
    selectedNames.clear();
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    // Toggle selection
    if (selectedNames.has(item.name)) {
      selectedNames.delete(item.name);
    } else {
      selectedNames.add(item.name);
    }
  } else {
    selectedNames.clear();
    selectedNames.add(item.name);
  }
}

function onBackgroundClick(): void {
  ctxMenu.show = false;
  selectedNames.clear();
}

// ── Click-away handler to close context menu ──

function onDocumentClick(event: MouseEvent): void {
  if (!ctxMenu.show) return;
  // If the click is inside the context menu, don't close
  if (ctxMenuEl.value && ctxMenuEl.value.contains(event.target as Node)) return;
  ctxMenu.show = false;
}

// ── Context menu (right-click / long-press on non-drag) ──

function onGridCellContext(index: number, slot: DesktopItem | null, event: MouseEvent): void {
  if (slot) {
    onItemContext(index, event);
  } else {
    onBackgroundContext(event);
  }
}

function onItemContext(index: number, event: MouseEvent): void {
  const item = displaySlots.value[index];
  if (!item) return;
  if (!selectedNames.has(item.name)) {
    selectedNames.clear();
    selectedNames.add(item.name);
  }
  ctxMenu.itemName = item.name;
  ctxMenu.isDir = item.isDirectory;
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.show = true;
}

// ── Open With dialog ──

function showOpenWithDialog(filenames: string[], filePaths: string[]): void {
  ctxMenu.show = false;
  owDialog.filenames = filenames;
  owDialog.filePaths = filePaths;
  owDialog.loading = true;
  owDialog.packs = [];
  owDialog.show = true;

  loadPackList().then((packs) => {
    owDialog.packs = packs;
    owDialog.loading = false;
  });
}

function ctxOpenWith(): void {
  ctxMenu.show = false;
  const names = [...selectedNames];
  if (names.length === 0) return;
  const filenames = names;
  const filePaths = names.map((n) => normalizePath('/home/desktop/' + n));
  showOpenWithDialog(filenames, filePaths);
}

async function onOpenWithSelect(packName: string, setDefault: boolean, volumeMounts: Array<{ name: string; mountPath: string }> = []): Promise<void> {
  owDialog.show = false;
  intentStore = await handleOpenWithSelection(
    intentStore, packName, owDialog.filenames, owDialog.filePaths, setDefault, volumeMounts,
  );
}

// ── Install Pack dialog ──

function ctxInstallPack(): void {
  ctxMenu.show = false;
  const name = ctxMenu.itemName;
  if (!name || !name.endsWith('.pack.js')) return;
  installPackDialog.fileName = name;
  installPackDialog.filePath = '/home/desktop/' + name;
  installPackDialog.show = true;
}

function onPackInstalled(): void {
  installPackDialog.show = false;
}

// ── Context menu: Download ──

async function ctxDownload(): Promise<void> {
  ctxMenu.show = false;
  const names = [...selectedNames];
  if (names.length === 0 || !opfsRoot) return;
  try {
    // Resolve directory: trash is at root, others at /home/desktop
    for (const name of names) {
      if (name === 'trash') {
        await downloadItems(opfsRoot, '/', ['trash']);
      } else {
        await downloadItems(opfsRoot, '/home/desktop', [name]);
      }
    }
  } catch (err) {
    console.warn('Desktop download failed:', err);
  }
}

// ── Context menu: Zip ──

async function ctxZip(): Promise<void> {
  ctxMenu.show = false;
  const names = [...selectedNames].filter(n => n !== 'trash');
  if (names.length === 0 || !opfsRoot) return;
  try {
    await zipItems(opfsRoot, '/home/desktop', names);
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop zip failed:', err);
  }
}

// ── Context menu: Extract zip archive ──

async function ctxExtractZip(): Promise<void> {
  ctxMenu.show = false;
  const names = [...selectedNames].filter(n => n.toLowerCase().endsWith('.zip'));
  if (names.length !== 1 || !opfsRoot) return;
  try {
    const conflicts = await extractZip(opfsRoot, '/home/desktop', names[0]);
    if (conflicts.length > 0) {
      if (!confirm('Some items already exist on the desktop. Do you want to replace them?')) return;
      await extractZip(opfsRoot, '/home/desktop', names[0], true);
    }
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop extract zip failed:', err);
  }
}

// ── Context menu / keyboard: Delete (move to trash) ──

async function doDelete(names: string[]): Promise<void> {
  const toDelete = names.filter(n => n && n !== 'trash');
  if (toDelete.length === 0 || !opfsRoot) return;
  try {
    await moveToTrash(opfsRoot, '/home/desktop', toDelete);
    selectedNames.clear();
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop delete failed:', err);
  }
}

function ctxDelete(): void {
  ctxMenu.show = false;
  doDelete([...selectedNames]);
}

// ── Context menu: Empty Trash ──

async function ctxEmptyTrash(): Promise<void> {
  ctxMenu.show = false;
  if (!opfsRoot) return;
  try {
    await emptyTrash(opfsRoot);
  } catch (err) {
    console.warn('Desktop empty trash failed:', err);
  }
}

// ── Context menu: Rename ──

const renaming = reactive({ active: false, name: '', newName: '' });

function ctxRename(): void {
  ctxMenu.show = false;
  const name = ctxMenu.itemName;
  if (!name || name === 'trash') return;
  renaming.active = true;
  renaming.name = name;
  renaming.newName = name;
  // Focus the rename input after render
  nextTick(() => {
    const input = renameInputEl.value;
    if (input) {
      input.focus();
      // Select the name portion without extension
      const dot = name.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : name.length);
    }
  });
}

async function confirmRename(): Promise<void> {
  const trimmed = renaming.newName.trim();
  if (!trimmed || trimmed === renaming.name || !opfsRoot) {
    renaming.active = false;
    return;
  }
  try {
    await renameItem(opfsRoot, DESKTOP_PATH, renaming.name, trimmed);
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop rename failed:', err);
  }
  renaming.active = false;
}

function cancelRename(): void {
  renaming.active = false;
}

// ── Context menu: New File / New Folder / Upload ──

const DESKTOP_PATH = '/home/desktop';

async function ctxNewFile(): Promise<void> {
  ctxMenu.show = false;
  if (!opfsRoot) return;
  try {
    await createEmptyFile(opfsRoot, DESKTOP_PATH);
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop create file failed:', err);
  }
}

async function ctxNewFolder(): Promise<void> {
  ctxMenu.show = false;
  if (!opfsRoot) return;
  try {
    await createFolder(opfsRoot, DESKTOP_PATH);
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop create folder failed:', err);
  }
}

function ctxUpload(): void {
  ctxMenu.show = false;
  fileInput.value?.click();
}

function ctxAddShortcut(): void {
  ctxMenu.show = false;
  shortcutDialog.show = true;
}

async function onShortcutCreated(): Promise<void> {
  shortcutDialog.show = false;
  await readDesktopDir();
}

async function onFilesSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0 || !opfsRoot) return;
  try {
    await uploadFiles(opfsRoot, DESKTOP_PATH, input.files);
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop upload failed:', err);
  }
  input.value = '';
}

// ── Background context menu (empty space — creation actions only) ──

function onBackgroundContext(event: MouseEvent): void {
  ctxMenu.itemName = '';
  ctxMenu.isDir = false;
  ctxMenu.x = event.clientX;
  ctxMenu.y = event.clientY;
  ctxMenu.show = true;
}

// ── Move into folder (drag-to-folder and clipboard paste) ──

async function doMoveIntoFolder(srcPath: string, folderName: string, names: string[]): Promise<void> {
  if (names.length === 0 || !opfsRoot) return;
  const destPath = normalizePath(srcPath + '/' + folderName);
  try {
    const conflicts = await moveItems(opfsRoot, srcPath, destPath, names, false);
    if (conflicts.length > 0) {
      if (!confirm(conflictMessage(folderName))) return;
      await moveItems(opfsRoot, srcPath, destPath, names, true);
    }
    selectedNames.clear();
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop move into folder failed:', err);
  }
}

// ── Clipboard: Copy / Cut / Paste ──

async function clipboardCopy(): Promise<void> {
  const names = [...selectedNames].filter(n => n !== 'trash');
  if (names.length === 0) return;
  try {
    const text = buildClipboardText('copy', DESKTOP_PATH, names);
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn('Desktop clipboard copy failed:', err);
  }
}

async function clipboardCut(): Promise<void> {
  const names = [...selectedNames].filter(n => n !== 'trash');
  if (names.length === 0) return;
  try {
    const text = buildClipboardText('cut', DESKTOP_PATH, names);
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn('Desktop clipboard cut failed:', err);
  }
}

async function clipboardPaste(): Promise<void> {
  if (!opfsRoot) return;
  try {
    const text = await navigator.clipboard.readText();
    const parsed = parseClipboard(text);
    if (!parsed) return;

    const { srcDir, names } = extractSourceDir(parsed.paths);
    if (names.length === 0) return;

    // Noop: same source and destination
    if (normalizePath(srcDir) === normalizePath(DESKTOP_PATH)) return;

    const op = parsed.mode === 'cut' ? moveItems : copyItems;
    const conflicts = await op(opfsRoot, srcDir, DESKTOP_PATH, names, false);
    if (conflicts.length > 0) {
      if (!confirm(conflictMessage())) return;
      await op(opfsRoot, srcDir, DESKTOP_PATH, names, true);
    }

    // Clear clipboard after cut+paste so the operation can't be repeated
    if (parsed.mode === 'cut') {
      await navigator.clipboard.writeText('');
    }

    selectedNames.clear();
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop clipboard paste failed:', err);
  }
}

// ── Context menu: Copy / Cut / Paste ──

function ctxCopy(): void {
  ctxMenu.show = false;
  clipboardCopy();
}

function ctxCut(): void {
  ctxMenu.show = false;
  clipboardCut();
}

function ctxPaste(): void {
  ctxMenu.show = false;
  clipboardPaste();
}

// ── Keyboard handler ──

function openSelectedItems(): void {
  const selected = items.value.filter((i) => selectedNames.has(i.name));
  if (selected.length === 0) return;

  const now = Date.now();
  if (now - lastLaunchTime < 1000) return;
  lastLaunchTime = now;

  // Separate trash, directories, shortcuts, and files
  const hasTrash = selected.some((i) => i.name === 'trash');
  const dirs = selected.filter((i) => i.isDirectory && i.name !== 'trash');
  const shortcuts = selected.filter((i) => !i.isDirectory && isShortcutFile(i.name));
  const files = selected.filter((i) => !i.isDirectory && i.name !== 'trash' && !isShortcutFile(i.name));

  if (hasTrash) {
    launchPack('files', [TRASH_PATH]);
  }

  // Directories: open each with the files app directly
  for (const dir of dirs) {
    launchPack('files', ['/home/desktop/' + dir.name]);
  }

  // Shortcuts: launch each via shortcut data
  for (const sc of shortcuts) {
    const filePath = normalizePath('/home/desktop/' + sc.name);
    readShortcutFile(filePath).then((data) => {
      if (data) launchShortcut(data);
    });
  }

  if (files.length > 0) {
    const filenames = files.map((f) => f.name);
    const filePaths = files.map((f) => normalizePath('/home/desktop/' + f.name));
    openFilesWithIntent(intentStore, filenames, filePaths).then((result) => {
      if (!result.resolved) {
        showOpenWithDialog(result.filenames, result.filePaths);
      }
    });
  }
}

function onKeyDown(event: KeyboardEvent): void {
  // Don't intercept keys while a rename input or dialog is active
  if (renaming.active) return;
  if (owDialog.show || installPackDialog.show || shortcutDialog.show) return;

  if (event.key === 'Enter') {
    openSelectedItems();
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    const names = [...selectedNames].filter(n => n !== 'trash');
    if (names.length > 0) {
      doDelete(names);
      selectedNames.clear();
    }
  } else if (event.key === 'F2') {
    // Rename the single selected item
    if (selectedNames.size === 1) {
      const name = [...selectedNames][0];
      if (name !== 'trash') {
        ctxMenu.itemName = name;
        ctxRename();
      }
    }
  } else if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
    event.preventDefault();
    clipboardCopy();
  } else if ((event.ctrlKey || event.metaKey) && event.key === 'x') {
    event.preventDefault();
    clipboardCut();
  } else if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
    event.preventDefault();
    clipboardPaste();
  }
}

// ── Periodic refresh ──

let refreshInterval: ReturnType<typeof setInterval> | null = null;

// ── Mode-change watcher: handle first-visit dense layout ──

/** If `mode` hasn't been visited, create a dense (upper-left) arrangement for it. */
function initModeIfNeeded(mode: IconMode): void {
  if (visitedModes.has(mode)) return;
  // First visit: dense layout (compact names placed sequentially = upper-left)
  const dense = compactArrangement.value.length > 0
    ? [...compactArrangement.value]
    : items.value.map(i => i.name);
  sparseArrangement.value = dense;
  visitedModes.add(mode);
  saveArrangement();
}

watch(currentMode, (newMode) => {
  initModeIfNeeded(newMode);
});

// ── Lifecycle ──

onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();
  intentStore = await loadIntents();

  // Ensure /trash directory exists
  if (opfsRoot) await ensureTrash(opfsRoot);

  await loadArrangement();
  await readDesktopDir();

  // Track container size for slot computation
  if (gridContainer.value) {
    containerWidth.value = gridContainer.value.clientWidth;
    containerHeight.value = gridContainer.value.clientHeight;

    // Mark the initial mode as visited (watcher only fires on changes)
    initModeIfNeeded(currentMode.value);

    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width;
        containerHeight.value = entry.contentRect.height;
      }
    });
    resizeObserver.observe(gridContainer.value);
  }

  // Refresh every 5 seconds to pick up terminal changes
  refreshInterval = setInterval(() => readDesktopDir(), REFRESH_INTERVAL_MS);

  // Click-away listener to close context menu
  document.addEventListener('mousedown', onDocumentClick);
});

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval);
  if (touchStartTimer) clearTimeout(touchStartTimer);
  resizeObserver?.disconnect();
  document.removeEventListener('mousedown', onDocumentClick);
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
  gap: clamp(0px, 0.5vw, 4px);
  padding: clamp(2px, 1vw, 8px);
  overflow-y: auto;
  user-select: none;
}

/* Responsive columns: fewer columns at smaller widths */
@media (max-width: 480px) {
  .desktop-grid {
    grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    grid-auto-rows: 80px;
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

.grid-cell:not(.empty-slot):hover {
  background: rgba(255, 255, 255, 0.08);
}

.grid-cell.drag-over {
  background: rgba(59, 130, 246, 0.2);
  outline: 2px dashed rgba(59, 130, 246, 0.5);
  outline-offset: -2px;
  border-radius: 6px;
}

.grid-cell.selected {
  background: rgba(59, 130, 246, 0.18);
  outline: 1px solid rgba(59, 130, 246, 0.35);
  outline-offset: -1px;
}

.icon-wrapper {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  pointer-events: none;
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

.shortcut-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  border-radius: 4px;
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
  pointer-events: none;
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

/* ── Context menu ── */

.ctx-menu {
  position: fixed;
  z-index: 99999;
  min-width: 160px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  padding: 4px 0;
}

.ctx-item {
  padding: 7px 14px;
  font-size: 0.82rem;
  color: #e2e8f0;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ctx-item:hover {
  background: rgba(59, 130, 246, 0.2);
}
.ctx-item-danger {
  color: #f87171;
}
.ctx-item-danger:hover {
  background: rgba(239, 68, 68, 0.15);
}
.ctx-item-install {
  color: #c084fc;
  font-weight: 600;
}
.ctx-item-install:hover {
  background: rgba(168, 85, 247, 0.15);
}
.ctx-icon {
  flex-shrink: 0;
}
.ctx-separator {
  height: 1px;
  margin: 4px 8px;
  background: rgba(255, 255, 255, 0.08);
}

/* ── Rename input ── */

.rename-input {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.2;
  color: #e2e8f0;
  background: rgba(30, 41, 59, 0.95);
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 3px;
  padding: 1px 4px;
  text-align: center;
  max-width: 100%;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
</style>
