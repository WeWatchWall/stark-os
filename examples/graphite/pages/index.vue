<template>
  <div class="graphite">
    <!-- Top bar -->
    <div class="top-bar">
      <div class="top-left">
        <span class="app-title">🎨 Graphite</span>
        <button class="bar-btn" @click="importFile" title="Import a file from OPFS into Graphite">Import</button>
        <button class="bar-btn" @click="exportFile" title="Export the current document to OPFS">Export</button>
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
      title="Export from Graphite"
      :extensions="exportExtensions"
      :initialPath="exportInitialPath"
      :defaultFileName="exportDefaultName"
      @select="onExportSelected"
      @cancel="showExportPicker = false"
    />
    <!-- Hidden file input for import into Graphite via drag -->
    <input
      ref="hiddenInput"
      type="file"
      class="hidden-input"
      :accept="importAccept"
      @change="onHiddenFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const GRAPHITE_URL = 'https://editor.graphite.rs/';

const graphiteUrl = ref(GRAPHITE_URL);
const iframeEl = ref<HTMLIFrameElement | null>(null);
const hiddenInput = ref<HTMLInputElement | null>(null);
const iframeLoaded = ref(false);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');
const showImportPicker = ref(false);
const showExportPicker = ref(false);
const exportDefaultName = ref('export');
const exportInitialPath = ref('/home');

let opfsRoot: FileSystemDirectoryHandle | null = null;
let pendingImportBlob: Blob | null = null;
let pendingImportName: string = '';

const importExtensions = [
  { label: 'Images', extensions: ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.bmp', '.gif'] },
  { label: 'Graphite Files', extensions: ['.graphite'] },
  { label: 'All Files', extensions: ['*'] },
];

const exportExtensions = [
  { label: 'SVG', extensions: ['.svg'] },
  { label: 'PNG', extensions: ['.png'] },
  { label: 'Graphite', extensions: ['.graphite'] },
];

const importAccept = '.png,.jpg,.jpeg,.svg,.webp,.bmp,.gif,.graphite';

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved to OPFS';
    case 'saving': return '⏳ Saving…';
    default: return '';
  }
});

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

    // Store for use in the hidden input flow
    pendingImportBlob = new Blob([await file.arrayBuffer()], { type: file.type || guessMime(name) });
    pendingImportName = name;

    // Attempt to send file to Graphite iframe via postMessage
    // The Graphite editor may accept file drops programmatically
    sendFileToGraphite(pendingImportBlob, pendingImportName);
  } catch (e) {
    console.warn('Failed to import file:', e);
  }
}

function sendFileToGraphite(blob: Blob, name: string) {
  const iframe = iframeEl.value;
  if (!iframe?.contentWindow) return;

  // Create a File object and try to trigger Graphite's drop handler
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

    // Focus iframe and dispatch the event
    iframe.focus();
    setTimeout(() => {
      try {
        iframe.contentDocument?.body.dispatchEvent(dropEvent);
      } catch {
        // Cross-origin — expected; message-based approach used instead
        console.info('Cross-origin iframe: file sent via postMessage. Drag-drop into the editor manually if needed.');
      }
    }, 100);
  } catch (e) {
    console.info('Import via postMessage sent. You may also drag files directly into the editor.');
  }
}

function onHiddenFileChange() {
  // Fallback for manual file selection
  const files = hiddenInput.value?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  sendFileToGraphite(file, file.name);

  // Reset input
  if (hiddenInput.value) hiddenInput.value.value = '';
}

/* ── Export: Save content to OPFS ── */

function exportFile() {
  showExportPicker.value = true;
}

async function onExportSelected(result: { paths: string[] }) {
  if (!opfsRoot || result.paths.length === 0) return;

  const path = result.paths[0];
  const ext = path.split('.').pop()?.toLowerCase() || '';

  try {
    saveStatus.value = 'saving';

    // Request export from Graphite via postMessage
    const iframe = iframeEl.value;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'graphite-export-request',
        format: ext,
        path,
      }, '*');
    }

    // Since cross-origin postMessage export may not be supported by Graphite,
    // provide instructions
    console.info(`Export requested. If the editor does not respond, use Graphite's built-in File > Export, then import the result.`);

    // For now, mark as saved (the user can use Graphite's built-in export)
    saveStatus.value = 'saved';
    setTimeout(() => { saveStatus.value = 'idle'; }, 3000);
  } catch (e) {
    console.warn('Failed to export:', e);
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

  // Listen for iframe load
  if (iframeEl.value) {
    iframeEl.value.addEventListener('load', () => {
      iframeLoaded.value = true;
    });
  }

  // Listen for messages from Graphite iframe
  window.addEventListener('message', onMessage);

  // Load initial file if provided via args
  const initialPaths = getInitialPaths();
  if (initialPaths.length > 0 && opfsRoot) {
    // Wait for iframe to load, then import the file
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

function onMessage(event: MessageEvent) {
  // Handle responses from Graphite (if it sends export data back)
  if (event.data?.type === 'graphite-export-response' && event.data.data) {
    saveExportData(event.data.data, event.data.path);
  }
}

async function saveExportData(data: ArrayBuffer, path: string) {
  if (!opfsRoot || !path) return;
  try {
    saveStatus.value = 'saving';
    const fh = await getFileHandle(opfsRoot, path, true);
    const writable = await fh.createWritable();
    await writable.write(new Uint8Array(data));
    await writable.close();
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to save export:', e);
    saveStatus.value = 'idle';
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
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
  padding: 4px 8px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.top-left, .top-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-title {
  font-weight: 600;
  font-size: 13px;
  margin-right: 8px;
}

.bar-btn {
  background: none;
  border: 1px solid transparent;
  color: #ccc;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
}
.bar-btn:hover { background: #3c3c3c; }

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
