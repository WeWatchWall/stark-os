<template>
  <div class="page">
    <div id="univer-container" ref="univerContainer"></div>

    <!-- File Picker dialogs -->
    <FilesPicker
      v-model:visible="showOpenPicker"
      mode="file"
      title="Open Document"
      :extensions="docExtensions"
      initialPath="/home"
      @select="onFileSelected"
      @cancel="showOpenPicker = false"
    />
    <FilesPicker
      v-model:visible="showSavePicker"
      mode="save"
      title="Save As"
      :extensions="docExtensions"
      :initialPath="saveInitialPath"
      :defaultFileName="saveDefaultName"
      @select="onSaveSelected"
      @cancel="showSavePicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { createUniver, defaultTheme, LocaleType } from '@univerjs/presets';
import { UniverDocsCorePreset } from '@univerjs/presets/preset-docs-core';
import docsCoreEnUS from '@univerjs/presets/preset-docs-core/locales/en-US';
import '@univerjs/presets/lib/styles/preset-docs-core.css';

const SAVE_INTERVAL = 5000;

const univerContainer = ref<HTMLElement | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle' | 'modified'>('idle');
const currentFilePath = ref('');

const showOpenPicker = ref(false);
const showSavePicker = ref(false);

let opfsRoot: FileSystemDirectoryHandle | null = null;
let univerAPI: any = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let dirty = false;

const docExtensions = [
  { label: 'Univer Documents', extensions: ['.unidoc'] },
  { label: 'JSON Files', extensions: ['.json'] },
  { label: 'All Files', extensions: ['*'] },
];

const saveInitialPath = computed(() => {
  if (currentFilePath.value) {
    const parts = currentFilePath.value.split('/');
    parts.pop();
    return parts.join('/') || '/home';
  }
  return '/home';
});

const saveDefaultName = computed(() => {
  if (currentFilePath.value) {
    const parts = currentFilePath.value.split('/');
    return parts[parts.length - 1] || 'document.unidoc';
  }
  return 'document.unidoc';
});

/* ── File Operations ── */

function getInitialPath(): string | null {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { args?: string[] } | undefined;
    const arg = ctx?.args?.[0];
    if (arg && typeof arg === 'string' && arg.trim().length > 0) {
      return arg.trim();
    }
  } catch { /* cross-origin or no parent */ }
  return null;
}

async function loadFile(path: string) {
  if (!opfsRoot || !univerAPI) return;
  try {
    const fh = await getFileHandle(opfsRoot, path);
    const file = await fh.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    // Close existing document and create new one
    const existing = univerAPI.getActiveDocument();
    if (existing) {
      univerAPI.createUniverDoc(data);
    } else {
      univerAPI.createUniverDoc(data);
    }
    currentFilePath.value = normalizePath(path);
    dirty = false;
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to load file:', path, e);
  }
}

async function saveToPath(path: string) {
  if (!opfsRoot || !univerAPI) return;
  try {
    const doc = univerAPI.getActiveDocument();
    if (!doc) return;
    saveStatus.value = 'saving';
    const snapshot = doc.save();
    const fh = await getFileHandle(opfsRoot, path, true);
    const writable = await fh.createWritable();
    await writable.write(new TextEncoder().encode(JSON.stringify(snapshot)));
    await writable.close();
    currentFilePath.value = normalizePath(path);
    dirty = false;
    saveStatus.value = 'saved';
    updateToolbarStatus();
  } catch (e) {
    console.warn('Failed to save:', path, e);
    saveStatus.value = 'modified';
    updateToolbarStatus();
  }
}

async function saveFile() {
  if (currentFilePath.value) {
    await saveToPath(currentFilePath.value);
  } else {
    showSavePicker.value = true;
  }
}

async function autoSave() {
  if (dirty && currentFilePath.value) {
    await saveToPath(currentFilePath.value);
  }
}

async function onFileSelected(result: { paths: string[] }) {
  if (result.paths.length > 0) {
    await loadFile(result.paths[0]);
  }
}

async function onSaveSelected(result: { paths: string[] }) {
  if (result.paths.length > 0) {
    await saveToPath(result.paths[0]);
  }
}

/* ── Toolbar injection ── */

function updateToolbarStatus() {
  const statusEl = document.querySelector('.stark-file-status');
  if (!statusEl) return;
  switch (saveStatus.value) {
    case 'saved':
      statusEl.textContent = '✓ Saved';
      statusEl.className = 'stark-file-status stark-status-saved';
      break;
    case 'saving':
      statusEl.textContent = '⏳ Saving…';
      statusEl.className = 'stark-file-status stark-status-saving';
      break;
    case 'modified':
      statusEl.textContent = '● Modified';
      statusEl.className = 'stark-file-status stark-status-modified';
      break;
    default:
      statusEl.textContent = '';
      statusEl.className = 'stark-file-status';
  }
}

function injectToolbarButtons() {
  const container = document.getElementById('univer-container');
  if (!container) return false;

  // Look for Univer's toolbar element
  const toolbar = container.querySelector('.univer-toolbar');
  if (!toolbar) return false;

  // Don't inject twice
  if (toolbar.querySelector('.stark-file-group')) return true;

  // Create the file operations group
  const group = document.createElement('div');
  group.className = 'stark-file-group';
  group.innerHTML = `
    <button class="stark-toolbar-btn" title="Open… (Ctrl+O)" data-action="open">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    <button class="stark-toolbar-btn" title="Save (Ctrl+S)" data-action="save">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
    </button>
    <button class="stark-toolbar-btn" title="Save As…" data-action="saveas">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
        <line x1="12" y1="18" x2="18" y2="18"/>
        <line x1="15" y1="15" x2="15" y2="21"/>
      </svg>
    </button>
    <div class="stark-toolbar-sep"></div>
    <span class="stark-file-status"></span>
  `;

  // Insert at the beginning of the toolbar
  toolbar.insertBefore(group, toolbar.firstChild);

  // Wire up events
  group.querySelector('[data-action="open"]')!.addEventListener('click', () => {
    showOpenPicker.value = true;
  });
  group.querySelector('[data-action="save"]')!.addEventListener('click', () => {
    saveFile();
  });
  group.querySelector('[data-action="saveas"]')!.addEventListener('click', () => {
    showSavePicker.value = true;
  });

  return true;
}

function waitForToolbar() {
  if (injectToolbarButtons()) return;

  const observer = new MutationObserver(() => {
    if (injectToolbarButtons()) {
      observer.disconnect();
    }
  });

  const container = document.getElementById('univer-container');
  if (container) {
    observer.observe(container, { childList: true, subtree: true });
  }

  // Timeout fallback
  setTimeout(() => observer.disconnect(), 10000);
}

/* ── Keyboard shortcuts ── */

function onKeydown(e: KeyboardEvent) {
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    saveFile();
  }
  if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    showOpenPicker.value = true;
  }
}

/* ── Lifecycle ── */

onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();

  const initialPath = getInitialPath();
  let initialData: any = null;

  // Try to load from file path arg
  if (initialPath && opfsRoot) {
    try {
      const fh = await getFileHandle(opfsRoot, initialPath);
      const file = await fh.getFile();
      const text = await file.text();
      initialData = JSON.parse(text);
      currentFilePath.value = normalizePath(initialPath);
    } catch {
      // File doesn't exist or isn't valid JSON
    }
  }

  const result = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      enUS: docsCoreEnUS,
    },
    theme: defaultTheme,
    presets: [
      UniverDocsCorePreset({ container: 'univer-container' }),
    ],
  });

  univerAPI = result.univerAPI;

  if (initialData) {
    univerAPI.createUniverDoc(initialData);
    saveStatus.value = 'saved';
  } else {
    univerAPI.createUniverDoc({});
  }

  // Inject toolbar buttons into Univer's toolbar
  waitForToolbar();

  // Auto-save periodically
  saveTimer = setInterval(autoSave, SAVE_INTERVAL);

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  if (saveTimer) clearInterval(saveTimer);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<style>
/* Global styles for injected toolbar buttons (not scoped) */
.stark-file-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  flex-shrink: 0;
}

.stark-toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #616161;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.stark-toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #1a1a1a;
}

.stark-toolbar-btn:active {
  background: rgba(0, 0, 0, 0.12);
}

.stark-toolbar-sep {
  width: 1px;
  height: 20px;
  background: #e0e0e0;
  margin: 0 4px;
  flex-shrink: 0;
}

.stark-file-status {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 0 4px;
}

.stark-status-saved { color: #22c55e; }
.stark-status-saving { color: #f59e0b; }
.stark-status-modified { color: #ef4444; }
</style>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
}

#univer-container {
  flex: 1;
  overflow: hidden;
}
</style>
