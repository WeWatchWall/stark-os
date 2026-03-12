<template>
  <div
    class="files-app"
    tabindex="0"
    @keydown="onKeyDown"
    @click="onBackgroundClick"
    @contextmenu.prevent
  >
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
    <div class="content" @contextmenu.prevent="onContentContext($event)">
      <!-- Icons view -->
      <div v-if="viewMode === 'icons'" class="icons-grid">
        <div
          v-for="item in sortedItems"
          :key="item.name"
          class="icon-cell"
          :class="{ selected: isSelected(item) }"
          @click.stop="onItemClick(item, $event)"
          @dblclick="onItemActivate(item)"
          @contextmenu.prevent.stop="onItemContext(item, $event)"
          @touchstart="onTouchStart(item, $event)"
          @touchend="onTouchEnd(item, $event)"
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
          :class="{ selected: isSelected(item) }"
          @click.stop="onItemClick(item, $event)"
          @dblclick="onItemActivate(item)"
          @contextmenu.prevent.stop="onItemContext(item, $event)"
          @touchstart="onTouchStart(item, $event)"
          @touchend="onTouchEnd(item, $event)"
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
          :class="{ selected: isSelected(item) }"
          @click.stop="onItemClick(item, $event)"
          @dblclick="onItemActivate(item)"
          @contextmenu.prevent.stop="onItemContext(item, $event)"
          @touchstart="onTouchStart(item, $event)"
          @touchend="onTouchEnd(item, $event)"
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

    <!-- Context menu -->
    <div
      v-if="ctxMenu.show"
      class="ctx-menu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
    >
      <div v-if="hasFileSelection" class="ctx-item" @click="ctxOpenWith">Open With…</div>
      <div class="ctx-item" @click="ctxZip">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        Zip
      </div>
      <div class="ctx-item ctx-item-danger" @click="ctxDelete">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" class="ctx-icon"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        Delete
      </div>
    </div>

    <!-- Floating Action Button -->
    <div class="fab-container">
      <transition name="fab-menu">
        <div v-if="fabOpen" class="fab-menu">
          <button class="fab-menu-item" @click="fabNewFile">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            <span>New File</span>
          </button>
          <button class="fab-menu-item" @click="fabNewFolder">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            <span>New Folder</span>
          </button>
          <button class="fab-menu-item" @click="fabUpload">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Upload Files</span>
          </button>
        </div>
      </transition>
      <button class="fab-btn" :class="{ open: fabOpen }" @click="fabOpen = !fabOpen" title="Add…">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
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
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
// Types need explicit imports; util functions are auto-imported by the shared Nuxt layer
import type { FileItem, IntentStore, IntentPackInfo } from '../../../examples/shared/utils';
// fileops is NOT barrel-exported (heavy JSZip dep) — import directly
import { zipItems, moveToTrash, createEmptyFile, createFolder, uploadFiles, ensureTrash } from '../../../examples/shared/utils/lib/fileops';

/* ── Constants ── */
const DEFAULT_PATH = '/home';
const REFRESH_INTERVAL_MS = 5000;
const LONG_PRESS_MS = 500;

/* ── Icon helpers (using shared utilities) ── */

function getSvg(item: FileItem): string {
  return getIconSvg(item.name, item.isDirectory);
}

function getColor(item: FileItem): string {
  return getIconColor(item.name, item.isDirectory);
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

// Selection model
const selectedNames = ref<Set<string>>(new Set());

// Intent store (loaded once)
let intentStore: IntentStore = { defaults: {} };

// Context menu
const ctxMenu = reactive({ show: false, x: 0, y: 0 });

// Open With dialog
const owDialog = reactive({
  show: false,
  filenames: [] as string[],
  filePaths: [] as string[],
  packs: [] as IntentPackInfo[],
  loading: false,
});

// Touch support
let lastTapTime = 0;
let touchLongPressTimer: ReturnType<typeof setTimeout> | null = null;
let touchMoved = false;

// FAB state
const fabOpen = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const canGoBack = computed(() => historyIndex.value > 0);
const canGoForward = computed(() => historyIndex.value < history.value.length - 1);
const canGoUp = computed(() => normalizePath(currentPath.value) !== '/');

const sortedItems = computed(() => {
  return [...items.value].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});

/* ── Selection helpers ── */

function isSelected(item: FileItem): boolean {
  return selectedNames.value.has(item.name);
}

function clearSelection(): void {
  selectedNames.value = new Set();
}

function onItemClick(item: FileItem, event: MouseEvent): void {
  ctxMenu.show = false;
  if (event.ctrlKey || event.metaKey) {
    // Toggle selection
    const next = new Set(selectedNames.value);
    if (next.has(item.name)) next.delete(item.name);
    else next.add(item.name);
    selectedNames.value = next;
  } else {
    selectedNames.value = new Set([item.name]);
  }
}

function onBackgroundClick(): void {
  ctxMenu.show = false;
  fabOpen.value = false;
  clearSelection();
}

/** Get the list of selected non-directory file items. */
function selectedFileItems(): FileItem[] {
  return items.value.filter(
    (i) => selectedNames.value.has(i.name) && !i.isDirectory,
  );
}

/** Whether at least one non-directory file is selected. */
const hasFileSelection = computed(() => selectedFileItems().length > 0);

/** All selected item names (files + directories). */
function selectedItemNames(): string[] {
  return items.value
    .filter((i) => selectedNames.value.has(i.name))
    .map((i) => i.name);
}

/* ── OPFS root ── */

let opfsRoot: FileSystemDirectoryHandle | null = null;

/* ── Read directory ── */

async function readDir(path: string): Promise<void> {
  if (!opfsRoot) return;
  loading.value = true;
  errorMsg.value = '';

  try {
    const normalized = normalizePath(path);
    const entries = await readDirItems(opfsRoot, normalized, true);

    items.value = entries;
    currentPath.value = normalized;
    addressBarValue.value = normalized;
  } catch (err) {
    console.warn('Files: failed to read directory:', path, err);
    errorMsg.value = `Cannot open: ${path}`;
    items.value = [];
  } finally {
    loading.value = false;
  }
}

/* ── Navigation ── */

function navigateTo(path: string, addToHistory = true): void {
  clearSelection();
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
  const parts = getPathParts(currentPath.value);
  parts.pop();
  navigateTo('/' + parts.join('/'));
}

function navigateToAddressBar(): void {
  const val = addressBarValue.value.trim();
  if (val) navigateTo(val);
}

/* ── Intent-based file opening ── */

async function openFiles(fileItems: FileItem[]): Promise<void> {
  if (fileItems.length === 0) return;

  const filePaths = fileItems.map((f) =>
    normalizePath(currentPath.value + '/' + f.name),
  );
  const filenames = fileItems.map((f) => f.name);

  const result = await openFilesWithIntent(intentStore, filenames, filePaths);
  if (!result.resolved) {
    showOpenWithDialog(result.filenames, result.filePaths);
  }
}

/* ── Item activation (dblclick / Enter / tap) ── */

function onItemActivate(item: FileItem): void {
  if (item.isDirectory) {
    navigateTo(currentPath.value + '/' + item.name);
  } else {
    // Open file(s) via intent system
    const selected = selectedFileItems();
    // If the activated item is in the selection, open all selected files
    if (selected.length > 0 && selectedNames.value.has(item.name)) {
      openFiles(selected);
    } else {
      openFiles([item]);
    }
  }
}

/* ── Keyboard ── */

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    const selected = items.value.filter((i) => selectedNames.value.has(i.name));
    if (selected.length === 1 && selected[0].isDirectory) {
      navigateTo(currentPath.value + '/' + selected[0].name);
    } else {
      const files = selected.filter((i) => !i.isDirectory);
      if (files.length > 0) openFiles(files);
    }
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    const names = selectedItemNames();
    if (names.length > 0) {
      doDelete(names);
    }
  }
}

/* ── Touch: single-tap opens (mobile), long-press → context menu ── */

function onTouchStart(item: FileItem, event: TouchEvent): void {
  touchMoved = false;
  const touch = event.touches[0];
  const tx = touch.clientX;
  const ty = touch.clientY;

  touchLongPressTimer = setTimeout(() => {
    touchLongPressTimer = null;
    // Long-press: select item and show context menu
    if (!selectedNames.value.has(item.name)) {
      selectedNames.value = new Set([item.name]);
    }
    showContextMenu(tx, ty);
  }, LONG_PRESS_MS);

  // Detect movement to cancel long-press
  const onMove = () => {
    touchMoved = true;
    cancelLongPress();
  };
  document.addEventListener('touchmove', onMove, { once: true });
}

function onTouchEnd(item: FileItem, event: TouchEvent): void {
  cancelLongPress();
  if (touchMoved) return;

  // Single-tap detection (double-tap on desktop, single-tap on mobile opens)
  const now = Date.now();
  const elapsed = now - lastTapTime;
  lastTapTime = now;

  if (elapsed < 400) {
    // Double-tap: activate
    event.preventDefault();
    onItemActivate(item);
  } else {
    // Single tap: select the item
    selectedNames.value = new Set([item.name]);
    // On mobile a single tap also opens (after a brief moment)
    event.preventDefault();
    onItemActivate(item);
  }
}

function cancelLongPress(): void {
  if (touchLongPressTimer) {
    clearTimeout(touchLongPressTimer);
    touchLongPressTimer = null;
  }
}

/* ── Context menu (right-click / long-press) ── */

function showContextMenu(x: number, y: number): void {
  ctxMenu.x = x;
  ctxMenu.y = y;
  ctxMenu.show = true;
}

function onItemContext(item: FileItem, event: MouseEvent): void {
  if (!selectedNames.value.has(item.name)) {
    selectedNames.value = new Set([item.name]);
  }
  showContextMenu(event.clientX, event.clientY);
}

function onContentContext(event: MouseEvent): void {
  // Right-click on background: only show menu if there is a selection
  if (selectedNames.value.size > 0) {
    showContextMenu(event.clientX, event.clientY);
  }
}

/* ── Open With dialog ── */

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
  const selected = items.value.filter((i) => selectedNames.value.has(i.name));
  const files = selected.filter((i) => !i.isDirectory);
  if (files.length === 0) return;
  const filenames = files.map((f) => f.name);
  const filePaths = files.map((f) =>
    normalizePath(currentPath.value + '/' + f.name),
  );
  showOpenWithDialog(filenames, filePaths);
}

async function onOpenWithSelect(packName: string, setDefault: boolean): Promise<void> {
  owDialog.show = false;
  intentStore = await handleOpenWithSelection(
    intentStore, packName, owDialog.filenames, owDialog.filePaths, setDefault,
  );
}

/* ── Context menu: Zip ── */

async function ctxZip(): Promise<void> {
  ctxMenu.show = false;
  const names = selectedItemNames();
  if (names.length === 0 || !opfsRoot) return;
  try {
    await zipItems(opfsRoot, currentPath.value, names);
    await readDir(currentPath.value);
  } catch (err) {
    console.warn('Zip failed:', err);
  }
}

/* ── Context menu / keyboard: Delete (move to trash) ── */

async function doDelete(names: string[]): Promise<void> {
  if (names.length === 0 || !opfsRoot) return;
  try {
    await moveToTrash(opfsRoot, currentPath.value, names);
    clearSelection();
    await readDir(currentPath.value);
  } catch (err) {
    console.warn('Delete failed:', err);
  }
}

function ctxDelete(): void {
  ctxMenu.show = false;
  const names = selectedItemNames();
  doDelete(names);
}

/* ── FAB actions ── */

async function fabNewFile(): Promise<void> {
  fabOpen.value = false;
  if (!opfsRoot) return;
  try {
    await createEmptyFile(opfsRoot, currentPath.value);
    await readDir(currentPath.value);
  } catch (err) {
    console.warn('Create file failed:', err);
  }
}

async function fabNewFolder(): Promise<void> {
  fabOpen.value = false;
  if (!opfsRoot) return;
  try {
    await createFolder(opfsRoot, currentPath.value);
    await readDir(currentPath.value);
  } catch (err) {
    console.warn('Create folder failed:', err);
  }
}

function fabUpload(): void {
  fabOpen.value = false;
  fileInput.value?.click();
}

async function onFilesSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0 || !opfsRoot) return;
  try {
    await uploadFiles(opfsRoot, currentPath.value, input.files);
    await readDir(currentPath.value);
  } catch (err) {
    console.warn('Upload failed:', err);
  }
  // Reset so the same files can be re-selected
  input.value = '';
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
  opfsRoot = await getStarkOpfsRoot();
  intentStore = await loadIntents();

  // Ensure trash directory exists
  if (opfsRoot) await ensureTrash(opfsRoot);

  const initialPath = getInitialPath();
  history.value = [initialPath];
  historyIndex.value = 0;
  await readDir(initialPath);

  refreshInterval = setInterval(() => readDir(currentPath.value), REFRESH_INTERVAL_MS);
});

onBeforeUnmount(() => {
  if (refreshInterval) clearInterval(refreshInterval);
  cancelLongPress();
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

/* ── Selection highlighting ── */

.icon-cell.selected {
  background: rgba(59, 130, 246, 0.18);
  outline: 1px solid rgba(59, 130, 246, 0.35);
  outline-offset: -1px;
}
.list-row.selected {
  background: rgba(59, 130, 246, 0.18);
}
.details-row.selected {
  background: rgba(59, 130, 246, 0.18);
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

/* ── Floating Action Button ── */

.fab-container {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.fab-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.fab-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
}
.fab-btn.open {
  transform: rotate(45deg);
}
.fab-btn.open:hover {
  transform: rotate(45deg) scale(1.08);
}

.fab-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.fab-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  color: #e2e8f0;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  transition: background 0.12s, transform 0.12s;
}
.fab-menu-item:hover {
  background: #334155;
  transform: translateX(-2px);
}
.fab-menu-item svg {
  flex-shrink: 0;
  color: #60a5fa;
}

/* FAB menu transitions */
.fab-menu-enter-active,
.fab-menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fab-menu-enter-from,
.fab-menu-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
