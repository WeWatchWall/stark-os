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
// The docs-core preset omits the UI facade import, so createMenu() is unavailable.
// Import it explicitly so the Facade API menu extensions work.
import '@univerjs/ui/lib/facade';

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
    univerAPI.createUniverDoc(data);
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
  } catch (e) {
    console.warn('Failed to save:', path, e);
    saveStatus.value = 'modified';
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

/* ── Register toolbar buttons via official Facade API ── */

function registerToolbarButtons() {
  if (!univerAPI) return;

  univerAPI.createMenu({
    id: 'stark.open',
    title: 'Open',
    tooltip: 'Open… (Ctrl+O)',
    action: () => { showOpenPicker.value = true; },
  }).appendTo('ribbon.start.others');

  univerAPI.createMenu({
    id: 'stark.save',
    title: 'Save',
    tooltip: 'Save (Ctrl+S)',
    action: () => { saveFile(); },
  }).appendTo('ribbon.start.others');

  univerAPI.createMenu({
    id: 'stark.saveas',
    title: 'Save As…',
    tooltip: 'Save As…',
    action: () => { showSavePicker.value = true; },
  }).appendTo('ribbon.start.others');
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

  // Register toolbar buttons via official Univer Facade API
  registerToolbarButtons();

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
