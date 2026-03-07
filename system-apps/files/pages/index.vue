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
import {
  getStarkOpfsRoot,
  getPathParts,
  normalizePath,
  getDirectoryHandle,
  readDirItems,
  formatSize,
  formatType,
  getIconSvg,
  getIconColor,
  type FileItem,
} from '../../../examples/shared/utils';

/* ── Constants ── */
const DEFAULT_PATH = '/home';
const REFRESH_INTERVAL_MS = 5000;

/* ── Icon helpers (using shared utilities) ── */

function getSvg(item: FileItem): string {
  return getIconSvg(item.name, item.isDirectory);
}

function getColor(item: FileItem): string {
  return getIconColor(item.name, item.isDirectory);
}

/* ── OPFS root ── */

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
let lastTapTime = 0;

const canGoBack = computed(() => historyIndex.value > 0);
const canGoForward = computed(() => historyIndex.value < history.value.length - 1);
const canGoUp = computed(() => normalizePath(currentPath.value) !== '/');

const sortedItems = computed(() => {
  return [...items.value].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});

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

/* ── Item activation (dblclick / tap) ── */

function onItemActivate(item: FileItem): void {
  if (item.isDirectory) {
    navigateTo(currentPath.value + '/' + item.name);
  }
}

function onTouchActivate(item: FileItem, event: TouchEvent): void {
  // Detect single tap (quick touch, not a scroll/long-press)
  const now = Date.now();
  const elapsed = now - lastTapTime;
  lastTapTime = now;

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
  opfsRoot = await getStarkOpfsRoot();
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
