<template>
  <div class="graphite" @click="closeMenus">
    <!-- Top bar with dropdown menu -->
    <div class="top-bar">
      <div class="top-left">
        <span class="app-title">🎨 Graphite</span>
        <div class="menu-dropdown">
          <button class="menu-trigger" @click.stop="showFileMenu = !showFileMenu">File</button>
          <div v-if="showFileMenu" class="menu-items">
            <button class="menu-item" @click="importFile(); showFileMenu = false">Import from OPFS…</button>
            <button class="menu-item" @click="saveToOpfs(); showFileMenu = false">Save to OPFS…</button>
          </div>
        </div>
      </div>
      <div class="top-right">
        <span class="status-text" :class="saveStatus">{{ saveStatusText }}</span>
      </div>
    </div>

    <!-- Graphite editor iframe -->
    <div class="editor-area">
      <iframe
        ref="iframeEl"
        :src="graphiteUrl"
        class="graphite-iframe"
        allow="cross-origin-isolated"
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads allow-forms"
        title="Graphite Editor"
      ></iframe>
      <div v-if="!iframeLoaded" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>Loading Graphite Editor…</p>
        <p class="loading-hint">Connecting to editor.graphite.rs</p>
      </div>
    </div>

    <!-- File pickers -->
    <FilesPicker
      v-model:visible="showImportPicker"
      mode="file"
      title="Import File into Graphite"
      :extensions="importExtensions"
      initialPath="/home"
      @select="onImportSelected"
      @cancel="showImportPicker = false"
    />
    <FilesPicker
      v-model:visible="showExportPicker"
      mode="save"
      title="Save to OPFS"
      :extensions="exportExtensions"
      :initialPath="exportInitialPath"
      :defaultFileName="exportDefaultName"
      @select="onExportSelected"
      @cancel="showExportPicker = false"
    />
    <!-- Hidden file input for picking local files to save to OPFS -->
    <input
      ref="localFileInput"
      type="file"
      class="hidden-input"
      :accept="exportAccept"
      @change="onLocalFilePicked"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const GRAPHITE_URL = 'https://editor.graphite.rs/';

const graphiteUrl = ref(GRAPHITE_URL);
const iframeEl = ref<HTMLIFrameElement | null>(null);
const localFileInput = ref<HTMLInputElement | null>(null);
const iframeLoaded = ref(false);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');
const showImportPicker = ref(false);
const showExportPicker = ref(false);
const showFileMenu = ref(false);
const exportDefaultName = ref('export');
const exportInitialPath = ref('/home');

let opfsRoot: FileSystemDirectoryHandle | null = null;
let pendingLocalFile: File | null = null;

const importExtensions = [
  { label: 'Images', extensions: ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.bmp', '.gif'] },
  { label: 'Graphite Files', extensions: ['.graphite'] },
  { label: 'All Files', extensions: ['*'] },
];

const exportExtensions = [
  { label: 'SVG', extensions: ['.svg'] },
  { label: 'PNG', extensions: ['.png'] },
  { label: 'JPEG', extensions: ['.jpg', '.jpeg'] },
  { label: 'Graphite', extensions: ['.graphite'] },
  { label: 'All Files', extensions: ['*'] },
];

const exportAccept = '.svg,.png,.jpg,.jpeg,.graphite';

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved to OPFS';
    case 'saving': return '⏳ Saving…';
    default: return '';
  }
});

function closeMenus() {
  showFileMenu.value = false;
}

/* ── Import: OPFS → Graphite (via simulated drag-and-drop) ── */

function importFile() {
  showImportPicker.value = true;
}

async function onImportSelected(result: { paths: string[] }) {
  if (!opfsRoot || result.paths.length === 0) return;

  try {
    const path = result.paths[0];
    const fh = await getFileHandle(opfsRoot, path);
    const file = await fh.getFile();
    const name = path.split('/').pop() || 'import';

    const blob = new Blob([await file.arrayBuffer()], { type: file.type || guessMime(name) });
    sendFileToGraphite(blob, name);
  } catch (e) {
    console.warn('Failed to import file:', e);
  }
}

function sendFileToGraphite(blob: Blob, name: string) {
  const iframe = iframeEl.value;
  if (!iframe?.contentWindow) return;

  const file = new File([blob], name, { type: blob.type });

  try {
    // Try postMessage with the file data
    const reader = new FileReader();
    reader.onload = () => {
      iframe.contentWindow?.postMessage({
        type: 'graphite-import',
        name,
        data: reader.result,
        mimeType: blob.type,
      }, '*');
    };
    reader.readAsArrayBuffer(blob);

    // Also try programmatic drag-and-drop simulation
    const dt = new DataTransfer();
    dt.items.add(file);
    const dropEvent = new DragEvent('drop', {
      dataTransfer: dt,
      bubbles: true,
      cancelable: true,
    });

    iframe.focus();
    setTimeout(() => {
      try {
        iframe.contentDocument?.body.dispatchEvent(dropEvent);
      } catch {
        // Cross-origin — expected
      }
    }, 100);
  } catch {
    // Import attempt sent
  }
}

/* ── Save to OPFS: pick a local file (e.g. downloaded from Graphite) → save to OPFS ── */

function saveToOpfs() {
  // Open native file picker so the user can select a file they exported/downloaded from Graphite
  localFileInput.value?.click();
}

function onLocalFilePicked() {
  const files = localFileInput.value?.files;
  if (!files || files.length === 0) return;

  pendingLocalFile = files[0];
  // Suggest a filename from the picked file
  exportDefaultName.value = pendingLocalFile.name.replace(/\.[^.]+$/, '');
  // Now show OPFS save location picker
  showExportPicker.value = true;

  // Reset input so the same file can be selected again
  if (localFileInput.value) localFileInput.value.value = '';
}

async function onExportSelected(result: { paths: string[] }) {
  if (!opfsRoot || result.paths.length === 0 || !pendingLocalFile) return;

  const path = result.paths[0];

  try {
    saveStatus.value = 'saving';
    const arrayBuffer = await pendingLocalFile.arrayBuffer();
    const fh = await getFileHandle(opfsRoot, path, true);
    const writable = await fh.createWritable();
    await writable.write(new Uint8Array(arrayBuffer));
    await writable.close();
    saveStatus.value = 'saved';
    pendingLocalFile = null;
    setTimeout(() => { saveStatus.value = 'idle'; }, 3000);
  } catch (e) {
    console.warn('Failed to save to OPFS:', e);
    saveStatus.value = 'idle';
  }
}

/* ── File import from args ── */

function getInitialPaths(): string[] {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { args?: string[] } | undefined;
    if (ctx?.args && ctx.args.length > 0) {
      return ctx.args.filter(a => typeof a === 'string' && a.trim().length > 0);
    }
  } catch { /* cross-origin or no parent */ }
  return [];
}

/* ── Helpers ── */

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.graphite')) return 'application/json';
  return 'application/octet-stream';
}

/* ── Lifecycle ── */

onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();

  if (iframeEl.value) {
    iframeEl.value.addEventListener('load', () => {
      iframeLoaded.value = true;
    });
  }

  // Load initial file if provided via args
  const initialPaths = getInitialPaths();
  if (initialPaths.length > 0 && opfsRoot) {
    const waitForLoad = () => {
      if (iframeLoaded.value) {
        onImportSelected({ paths: [initialPaths[0]] });
      } else {
        setTimeout(waitForLoad, 500);
      }
    };
    waitForLoad();
  }
});
</script>

<style scoped>
.graphite {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #222;
  color: #d4d4d4;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  height: 30px;
}

.top-left, .top-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.app-title {
  font-weight: 600;
  font-size: 13px;
  margin-right: 6px;
}

/* Dropdown menu */
.menu-dropdown {
  position: relative;
}

.menu-trigger {
  background: none;
  border: 1px solid transparent;
  color: #ccc;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
}
.menu-trigger:hover { background: #3c3c3c; }

.menu-items {
  position: absolute;
  top: 100%;
  left: 0;
  background: #2d2d2d;
  border: 1px solid #454545;
  border-radius: 4px;
  padding: 4px 0;
  z-index: 200;
  min-width: 180px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
}

.menu-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: #ccc;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.menu-item:hover { background: #094771; color: #fff; }

.status-text {
  font-size: 11px;
  color: #888;
}
.status-text.saved { color: #4ec9b0; }
.status-text.saving { color: #dcdcaa; }

/* Editor area */
.editor-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.graphite-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: #222;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #888;
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid #444;
  border-top-color: #007acc;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-hint {
  font-size: 12px;
  color: #666;
}

.hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
</style>
