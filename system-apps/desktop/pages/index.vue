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
        'selected': slot && slot.name === selectedItemName,
      }"
      :draggable="!!slot"
      @click.stop="onItemClick(index)"
      @dblclick="onDblClick(index)"
      @contextmenu.prevent.stop="onItemContext(index, $event)"
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
          <div class="icon-svg" v-html="getSvg(slot)"></div>
        </div>
        <span class="icon-label" :title="slot.name">{{ slot.name }}</span>
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
      class="ctx-menu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
    >
      <template v-if="ctxMenu.itemName">
        <div v-if="!ctxMenu.isDir" class="ctx-item" @click="ctxOpenWith">Open With…</div>
        <div class="ctx-item" @click="ctxZip">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          Zip
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
      <div class="ctx-item" @click="ctxNewFile">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        New File
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
// Types need explicit imports; util functions are auto-imported by the shared Nuxt layer
import type { IntentStore, IntentPackInfo } from '../../../examples/shared/utils';
// fileops is NOT barrel-exported (heavy JSZip dep) — import directly
import { zipItems, moveToTrash, createEmptyFile, createFolder, uploadFiles, ensureTrash, emptyTrash, TRASH_PATH } from '../../../examples/shared/utils/lib/fileops';

/* ── Tunable constants ── */
const LONG_PRESS_MS = 300;
const GHOST_OFFSET_PX = 30;
const REFRESH_INTERVAL_MS = 5000;

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
const sparseArrangement = ref<(string | null)[]>([]);
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

// File upload input ref
const fileInput = ref<HTMLInputElement | null>(null);

// Currently selected item (for keyboard shortcuts)
const selectedItemName = ref('');

// Open With dialog
const owDialog = reactive({
  show: false,
  filenames: [] as string[],
  filePaths: [] as string[],
  packs: [] as IntentPackInfo[],
  loading: false,
});

// ── Grid slot computation ──

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

/** Whether the grid is too small for the sparse layout (e.g. on mobile). */
const isCompact = computed(() => {
  // Before ResizeObserver fires, don't compact to avoid a flash
  if (containerWidth.value === 0 || containerHeight.value === 0) return false;
  return sparseArrangement.value.length > totalSlots.value;
});

/** Grid slots: sparse positions when space allows, compacted when tight. */
const displaySlots = computed<Array<DesktopItem | null>>(() => {
  const byName = new Map(items.value.map(item => [item.name, item]));
  const slots = totalSlots.value;
  const out: Array<DesktopItem | null> = new Array(slots).fill(null);

  if (isCompact.value) {
    // Compact mode: use compact arrangement, place items sequentially
    const order = compactArrangement.value;
    const placed = new Set<string>();
    let pos = 0;
    for (const name of order) {
      if (pos >= slots) break;
      if (byName.has(name)) {
        out[pos++] = byName.get(name)!;
        placed.add(name);
      }
    }
    for (const item of items.value) {
      if (pos >= slots) break;
      if (!placed.has(item.name)) { out[pos++] = item; }
    }
  } else {
    // Sparse mode: use sparse arrangement, preserve positions
    const order = sparseArrangement.value;
    const arrangedNames: string[] = [];
    for (const name of order) {
      if (name && byName.has(name)) arrangedNames.push(name);
    }
    const inArrangement = new Set(arrangedNames);
    for (const item of items.value) {
      if (!inArrangement.has(item.name)) arrangedNames.push(item.name);
    }

    const placed = new Set<string>();
    for (let i = 0; i < order.length; i++) {
      const name = order[i];
      if (name && byName.has(name)) {
        out[i] = byName.get(name)!;
        placed.add(name);
      }
    }
    let nextNull = 0;
    for (const name of arrangedNames) {
      if (!placed.has(name)) {
        while (nextNull < slots && out[nextNull] !== null) nextNull++;
        if (nextNull < slots) { out[nextNull] = byName.get(name)!; nextNull++; }
      }
    }
  }

  return out;
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
  } catch (err) {
    console.warn('Desktop: failed to read /home/desktop:', err);
    items.value = [{ name: 'trash', isDirectory: true }];
  }
}

async function loadArrangement(): Promise<void> {
  if (!opfsRoot) return;
  try {
    const fh = await getFileHandle(opfsRoot, ARRANGEMENT_PATH);
    const file = await fh.getFile();
    const text = await file.text();
    const data = JSON.parse(text);

    if (Array.isArray(data.sparse)) {
      sparseArrangement.value = data.sparse;
    } else if (Array.isArray(data.order)) {
      // Backward compat with old single-array format
      sparseArrangement.value = data.order;
    }

    if (Array.isArray(data.compact)) {
      compactArrangement.value = data.compact;
    } else {
      // Derive compact from sparse (item names in order, no gaps)
      compactArrangement.value = sparseArrangement.value.filter((n): n is string => n !== null);
    }
  } catch {
    // No arrangement file yet — that's fine
    sparseArrangement.value = [];
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
      sparse: sparseArrangement.value,
      compact: compactArrangement.value,
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

  if (isCompact.value) {
    // Save as compact (dense list of names, no nulls)
    compactArrangement.value = newOrder.filter((n): n is string => n !== null);
  } else {
    sparseArrangement.value = newOrder;
  }
  saveArrangement();
}

// ── Drag & Drop (mouse) ──

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
  reorderItems(from, to);
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
      reorderItems(from, to);
    }
  }

  // Single tap to open folder on mobile (debounce prevents double-open)
  if (!isTouchDragging) {
    onDblClick(index);
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

function onItemClick(index: number): void {
  const item = displaySlots.value[index];
  if (!item) return;
  selectedItemName.value = item.name;
  ctxMenu.show = false;
}

function onBackgroundClick(): void {
  ctxMenu.show = false;
  selectedItemName.value = '';
}

// ── Context menu (right-click / long-press on non-drag) ──

function onItemContext(index: number, event: MouseEvent): void {
  const item = displaySlots.value[index];
  if (!item) return;
  selectedItemName.value = item.name;
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
  const itemName = ctxMenu.itemName;
  if (!itemName) return;
  const filePath = normalizePath('/home/desktop/' + itemName);
  showOpenWithDialog([itemName], [filePath]);
}

async function onOpenWithSelect(packName: string, setDefault: boolean): Promise<void> {
  owDialog.show = false;
  intentStore = await handleOpenWithSelection(
    intentStore, packName, owDialog.filenames, owDialog.filePaths, setDefault,
  );
}

// ── Context menu: Zip ──

async function ctxZip(): Promise<void> {
  ctxMenu.show = false;
  const itemName = ctxMenu.itemName;
  if (!itemName || !opfsRoot) return;
  try {
    // Trash is a synthetic item — zip its contents from /trash
    if (itemName === 'trash') {
      await zipItems(opfsRoot, '/', ['trash']);
    } else {
      await zipItems(opfsRoot, '/home/desktop', [itemName]);
    }
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop zip failed:', err);
  }
}

// ── Context menu / keyboard: Delete (move to trash) ──

async function doDelete(itemName: string): Promise<void> {
  if (!itemName || itemName === 'trash' || !opfsRoot) return;
  try {
    await moveToTrash(opfsRoot, '/home/desktop', [itemName]);
    await readDesktopDir();
  } catch (err) {
    console.warn('Desktop delete failed:', err);
  }
}

function ctxDelete(): void {
  ctxMenu.show = false;
  doDelete(ctxMenu.itemName);
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

// ── Keyboard handler ──

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const name = selectedItemName.value;
    if (name && name !== 'trash') {
      doDelete(name);
      selectedItemName.value = '';
    }
  }
}

// ── Periodic refresh ──

let refreshInterval: ReturnType<typeof setInterval> | null = null;

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
});

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval);
  if (touchStartTimer) clearTimeout(touchStartTimer);
  resizeObserver?.disconnect();
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
.ctx-icon {
  flex-shrink: 0;
}
.ctx-separator {
  height: 1px;
  margin: 4px 8px;
  background: rgba(255, 255, 255, 0.08);
}
</style>
