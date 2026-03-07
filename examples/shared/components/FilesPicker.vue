<template>
  <div v-if="visible" class="fp-overlay" @click.self="cancel">
    <div class="fp-dialog" :class="{ 'fp-save-mode': mode === 'save' }">
      <!-- Header -->
      <div class="fp-header">
        <span class="fp-title">{{ dialogTitle }}</span>
        <button class="fp-close-btn" @click="cancel" title="Close">&times;</button>
      </div>

      <!-- Navigation bar -->
      <div class="fp-nav">
        <button class="fp-nav-btn" :disabled="!canGoBack" title="Back" @click="goBack">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button class="fp-nav-btn" :disabled="!canGoUp" title="Up" @click="goUp">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <div class="fp-path-display">{{ currentPath }}</div>
      </div>

      <!-- File list -->
      <div class="fp-list">
        <div
          v-for="item in sortedItems"
          :key="item.name"
          class="fp-item"
          :class="{
            'fp-selected': isSelected(item),
            'fp-directory': item.isDirectory,
            'fp-disabled': !isSelectable(item),
          }"
          @click="onItemClick(item)"
          @dblclick="onItemDblClick(item)"
        >
          <span class="fp-item-icon" :style="{ color: getIconColor(item.name, item.isDirectory) }" v-html="getIconSvg(item.name, item.isDirectory)"></span>
          <span class="fp-item-name">{{ item.name }}</span>
          <span class="fp-item-size">{{ item.isDirectory ? '' : formatSize(item.size) }}</span>
        </div>
        <div v-if="sortedItems.length === 0 && !loading" class="fp-empty">
          This folder is empty
        </div>
        <div v-if="loading" class="fp-loading">Loading…</div>
      </div>

      <!-- Save mode: filename input + extension filter -->
      <div v-if="mode === 'save'" class="fp-save-bar">
        <label class="fp-save-label">File name:</label>
        <input
          ref="saveInput"
          v-model="saveFileName"
          class="fp-save-input"
          placeholder="Enter file name"
          @keydown.enter="confirmSave"
        />
        <select v-if="extensionFilters.length > 0" v-model="selectedExtFilter" class="fp-ext-select">
          <option v-for="ext in extensionFilters" :key="ext.label" :value="ext">
            {{ ext.label }}
          </option>
        </select>
      </div>

      <!-- Extension filter for open modes -->
      <div v-if="mode !== 'save' && extensionFilters.length > 0" class="fp-filter-bar">
        <label class="fp-filter-label">Type:</label>
        <select v-model="selectedExtFilter" class="fp-ext-select" @change="refreshDir">
          <option v-for="ext in extensionFilters" :key="ext.label" :value="ext">
            {{ ext.label }}
          </option>
        </select>
      </div>

      <!-- Actions -->
      <div class="fp-actions">
        <button class="fp-btn fp-btn-cancel" @click="cancel">Cancel</button>
        <button
          class="fp-btn fp-btn-confirm"
          :disabled="!canConfirm"
          @click="confirm"
        >{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import {
  getStarkOpfsRoot,
  normalizePath,
  getPathParts,
  readDirItems,
  formatSize,
  getIconSvg,
  getIconColor,
  type FileItem,
} from '../utils';

/* ── Types ── */

export interface ExtensionFilter {
  label: string;
  extensions: string[];  // e.g. ['.txt', '.md'] or ['*'] for all
}

export type PickerMode = 'file' | 'files' | 'directory' | 'save';

export interface PickerResult {
  /** Full path(s) selected */
  paths: string[];
  /** For save mode: the filename (with extension) */
  fileName?: string;
  /** The directory where the selection was made */
  directory: string;
}

/* ── Props ── */

const props = withDefaults(defineProps<{
  mode?: PickerMode;
  title?: string;
  extensions?: ExtensionFilter[];
  initialPath?: string;
  defaultFileName?: string;
  visible?: boolean;
}>(), {
  mode: 'file',
  title: '',
  extensions: () => [],
  initialPath: '/home',
  defaultFileName: '',
  visible: false,
});

/* ── Emits ── */

const emit = defineEmits<{
  (e: 'select', result: PickerResult): void;
  (e: 'cancel'): void;
  (e: 'update:visible', value: boolean): void;
}>();

/* ── State ── */

let opfsRoot: FileSystemDirectoryHandle | null = null;
const currentPath = ref('/home');
const items = ref<FileItem[]>([]);
const selectedItems = ref<FileItem[]>([]);
const loading = ref(false);
const historyStack = ref<string[]>([]);
const saveFileName = ref('');
const saveInput = ref<HTMLInputElement | null>(null);

/* ── Extension filters ── */

const allFilter: ExtensionFilter = { label: 'All Files', extensions: ['*'] };

const extensionFilters = computed<ExtensionFilter[]>(() => {
  if (props.extensions.length === 0) return [];
  return [...props.extensions, allFilter];
});

const selectedExtFilter = ref<ExtensionFilter>(allFilter);

watch(() => props.extensions, () => {
  if (props.extensions.length > 0) {
    selectedExtFilter.value = props.extensions[0];
  } else {
    selectedExtFilter.value = allFilter;
  }
}, { immediate: true });

/* ── Computed ── */

const dialogTitle = computed(() => {
  if (props.title) return props.title;
  switch (props.mode) {
    case 'directory': return 'Select Folder';
    case 'file': return 'Open File';
    case 'files': return 'Open Files';
    case 'save': return 'Save As';
    default: return 'Select';
  }
});

const confirmLabel = computed(() => {
  switch (props.mode) {
    case 'directory': return 'Select Folder';
    case 'save': return 'Save';
    default: return 'Open';
  }
});

const canGoBack = computed(() => historyStack.value.length > 0);
const canGoUp = computed(() => normalizePath(currentPath.value) !== '/');

const sortedItems = computed(() => {
  let list = [...items.value];

  // Filter by extension in non-directory modes
  if (props.mode !== 'directory' && selectedExtFilter.value && !selectedExtFilter.value.extensions.includes('*')) {
    const exts = selectedExtFilter.value.extensions.map(e => e.toLowerCase());
    list = list.filter(item => {
      if (item.isDirectory) return true;
      const dot = item.name.lastIndexOf('.');
      if (dot === -1) return false;
      const ext = item.name.slice(dot).toLowerCase();
      return exts.includes(ext);
    });
  }

  return list.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});

const canConfirm = computed(() => {
  if (props.mode === 'save') {
    return saveFileName.value.trim().length > 0;
  }
  if (props.mode === 'directory') {
    return true; // current directory is always valid
  }
  return selectedItems.value.length > 0;
});

/* ── Methods ── */

function isSelectable(item: FileItem): boolean {
  if (props.mode === 'directory') return item.isDirectory;
  return true;
}

function isSelected(item: FileItem): boolean {
  return selectedItems.value.some(s => s.name === item.name);
}

function onItemClick(item: FileItem) {
  if (props.mode === 'directory') {
    if (item.isDirectory) {
      selectedItems.value = [item];
    }
    return;
  }

  if (item.isDirectory) {
    // Single click on directory in file modes does nothing special
    return;
  }

  if (props.mode === 'files') {
    // Toggle selection for multi-file mode
    const idx = selectedItems.value.findIndex(s => s.name === item.name);
    if (idx !== -1) {
      selectedItems.value.splice(idx, 1);
    } else {
      selectedItems.value.push(item);
    }
  } else {
    // Single file mode
    selectedItems.value = [item];
    if (props.mode === 'save') {
      saveFileName.value = item.name;
    }
  }
}

function onItemDblClick(item: FileItem) {
  if (item.isDirectory) {
    navigateTo(currentPath.value + '/' + item.name);
    return;
  }

  // Double-click on file selects and confirms
  if (props.mode !== 'directory') {
    selectedItems.value = [item];
    if (props.mode === 'save') {
      saveFileName.value = item.name;
    }
    confirm();
  }
}

async function navigateTo(path: string) {
  historyStack.value.push(currentPath.value);
  currentPath.value = normalizePath(path);
  selectedItems.value = [];
  await refreshDir();
}

async function goBack() {
  if (historyStack.value.length === 0) return;
  currentPath.value = historyStack.value.pop()!;
  selectedItems.value = [];
  await refreshDir();
}

async function goUp() {
  if (!canGoUp.value) return;
  const parts = getPathParts(currentPath.value);
  parts.pop();
  await navigateTo('/' + parts.join('/'));
}

async function refreshDir() {
  if (!opfsRoot) return;
  loading.value = true;
  try {
    items.value = await readDirItems(opfsRoot, currentPath.value, true);
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function confirm() {
  if (!canConfirm.value) return;

  if (props.mode === 'save') {
    confirmSave();
    return;
  }

  if (props.mode === 'directory') {
    const dir = selectedItems.value.length > 0
      ? normalizePath(currentPath.value + '/' + selectedItems.value[0].name)
      : currentPath.value;
    emit('select', { paths: [dir], directory: currentPath.value });
  } else {
    const paths = selectedItems.value.map(item =>
      normalizePath(currentPath.value + '/' + item.name)
    );
    emit('select', { paths, directory: currentPath.value });
  }

  emit('update:visible', false);
}

function confirmSave() {
  let name = saveFileName.value.trim();
  if (!name) return;

  // Append extension if filter is active and file doesn't already have it
  if (selectedExtFilter.value && !selectedExtFilter.value.extensions.includes('*')) {
    const exts = selectedExtFilter.value.extensions;
    const hasExt = exts.some(ext => name.toLowerCase().endsWith(ext.toLowerCase()));
    if (!hasExt && exts.length > 0) {
      name += exts[0];
    }
  }

  const fullPath = normalizePath(currentPath.value + '/' + name);
  emit('select', {
    paths: [fullPath],
    fileName: name,
    directory: currentPath.value,
  });
  emit('update:visible', false);
}

function cancel() {
  emit('cancel');
  emit('update:visible', false);
}

/* ── Watchers ── */

watch(() => props.visible, async (val) => {
  if (val) {
    opfsRoot = await getStarkOpfsRoot();
    currentPath.value = normalizePath(props.initialPath);
    historyStack.value = [];
    selectedItems.value = [];
    saveFileName.value = props.defaultFileName;
    await refreshDir();
    if (props.mode === 'save') {
      nextTick(() => saveInput.value?.focus());
    }
  }
});

watch(() => props.initialPath, (val) => {
  currentPath.value = normalizePath(val);
});

onMounted(async () => {
  if (props.visible) {
    opfsRoot = await getStarkOpfsRoot();
    currentPath.value = normalizePath(props.initialPath);
    await refreshDir();
    if (props.mode === 'save') {
      nextTick(() => saveInput.value?.focus());
    }
  }
});
</script>

<style scoped>
.fp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fp-dialog {
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  width: 560px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  color: #cccccc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
}

.fp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.fp-title {
  font-weight: 600;
  font-size: 14px;
}

.fp-close-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 18px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}
.fp-close-btn:hover { background: #3c3c3c; color: #ccc; }

.fp-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.fp-nav-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  flex-shrink: 0;
}
.fp-nav-btn:hover:not(:disabled) { background: #3c3c3c; color: #ccc; }
.fp-nav-btn:disabled { opacity: 0.3; cursor: default; }

.fp-path-display {
  flex: 1;
  font-family: monospace;
  font-size: 12px;
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 8px;
}

.fp-list {
  flex: 1;
  min-height: 200px;
  max-height: 350px;
  overflow-y: auto;
  padding: 4px 0;
}

.fp-list::-webkit-scrollbar { width: 6px; }
.fp-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

.fp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 14px;
  cursor: pointer;
  user-select: none;
}
.fp-item:hover { background: #2a2d2e; }
.fp-item.fp-selected { background: #094771; }
.fp-item.fp-disabled { opacity: 0.5; cursor: default; }

.fp-item-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.fp-item-icon :deep(svg) { width: 100%; height: 100%; }

.fp-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fp-item-size {
  font-size: 11px;
  color: #888;
  flex-shrink: 0;
  width: 60px;
  text-align: right;
}

.fp-empty, .fp-loading {
  padding: 30px 14px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.fp-save-bar, .fp-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-top: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.fp-save-label, .fp-filter-label {
  font-size: 12px;
  color: #aaa;
  white-space: nowrap;
  flex-shrink: 0;
}

.fp-save-input {
  flex: 1;
  background: #3c3c3c;
  border: 1px solid #555;
  border-radius: 3px;
  color: #ccc;
  padding: 4px 8px;
  font-size: 13px;
  outline: none;
}
.fp-save-input:focus { border-color: #007acc; }

.fp-ext-select {
  background: #3c3c3c;
  border: 1px solid #555;
  border-radius: 3px;
  color: #ccc;
  padding: 4px 8px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  max-width: 180px;
}
.fp-ext-select:focus { border-color: #007acc; }

.fp-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 14px;
  border-top: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.fp-btn {
  padding: 5px 16px;
  border: none;
  border-radius: 3px;
  font-size: 13px;
  cursor: pointer;
}

.fp-btn-cancel {
  background: #3c3c3c;
  color: #ccc;
}
.fp-btn-cancel:hover { background: #555; }

.fp-btn-confirm {
  background: #007acc;
  color: #fff;
}
.fp-btn-confirm:hover { background: #006bb3; }
.fp-btn-confirm:disabled { opacity: 0.5; cursor: default; }
</style>
