<template>
  <div class="page">
    <!-- Slides panel (sidebar) -->
    <div class="slides-panel">
      <div class="slides-panel-header">
        <span class="slides-panel-title">Slides</span>
        <div class="slides-panel-actions">
          <button class="sp-btn" title="Add Slide" @click="addSlide">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      <div class="slides-list" ref="slidesListEl">
        <div
          v-for="(slide, idx) in slidesList"
          :key="slide.id"
          class="slide-thumb"
          :class="{ 'slide-active': idx === activeSlideIndex }"
          @click="selectSlide(idx)"
          draggable="true"
          @dragstart="onDragStart(idx, $event)"
          @dragover.prevent="onDragOver(idx, $event)"
          @drop="onDrop(idx)"
          @dragend="onDragEnd"
        >
          <span class="slide-number">{{ idx + 1 }}</span>
          <div class="slide-preview" :style="{ background: slide.bg }">
            <span class="slide-label">{{ slide.title || `Slide ${idx + 1}` }}</span>
          </div>
          <button
            v-if="slidesList.length > 1"
            class="slide-delete"
            title="Delete Slide"
            @click.stop="removeSlide(idx)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Main area with Univer container -->
    <div class="main-area">
      <div class="main-toolbar">
        <div class="toolbar-left">
          <button class="tb-btn" title="Open… (Ctrl+O)" @click="showOpenPicker = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Open</span>
          </button>
          <button class="tb-btn" title="Save (Ctrl+S)" @click="saveFile">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            <span>Save</span>
          </button>
          <button class="tb-btn" title="Save As…" @click="showSavePicker = true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
              <line x1="12" y1="18" x2="18" y2="18"/>
              <line x1="15" y1="15" x2="15" y2="21"/>
            </svg>
            <span>Save As</span>
          </button>
          <div class="tb-sep"></div>
          <button class="tb-btn" title="Add Slide" @click="addSlide">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Add Slide</span>
          </button>
          <button class="tb-btn" :disabled="slidesList.length <= 1" title="Delete Current Slide" @click="removeSlide(activeSlideIndex)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>Delete Slide</span>
          </button>
          <button class="tb-btn" :disabled="activeSlideIndex <= 0" title="Move Slide Up" @click="moveSlide(activeSlideIndex, activeSlideIndex - 1)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button class="tb-btn" :disabled="activeSlideIndex >= slidesList.length - 1" title="Move Slide Down" @click="moveSlide(activeSlideIndex, activeSlideIndex + 1)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="tb-sep"></div>
          <label class="tb-label">Background:</label>
          <input type="color" class="tb-color" :value="currentSlideBg" @input="onBgColorChange" title="Slide Background Color" />
        </div>
        <div class="toolbar-right">
          <span class="file-status" :class="saveStatus">{{ saveStatusText }}</span>
        </div>
      </div>
      <div id="univer-container" ref="univerContainer"></div>
    </div>

    <!-- File Picker dialogs -->
    <FilesPicker
      v-model:visible="showOpenPicker"
      mode="file"
      title="Open Presentation"
      :extensions="slideExtensions"
      initialPath="/home"
      @select="onFileSelected"
      @cancel="showOpenPicker = false"
    />
    <FilesPicker
      v-model:visible="showSavePicker"
      mode="save"
      title="Save As"
      :extensions="slideExtensions"
      :initialPath="saveInitialPath"
      :defaultFileName="saveDefaultName"
      @select="onSaveSelected"
      @cancel="showSavePicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Univer, LocaleType, UniverInstanceType, mergeLocales } from '@univerjs/core';
import { defaultTheme } from '@univerjs/themes';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import uiEnUS from '@univerjs/ui/lib/locale/en-US';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import docsUIEnUS from '@univerjs/docs-ui/lib/locale/en-US';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverDrawingPlugin } from '@univerjs/drawing';
import { UniverSlidesPlugin } from '@univerjs/slides';
import { UniverSlidesUIPlugin } from '@univerjs/slides-ui';
import slidesUIEnUS from '@univerjs/slides-ui/lib/locale/en-US';
import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import '@univerjs/slides-ui/lib/index.css';

const SAVE_INTERVAL = 5000;
const SLIDE_COLORS = ['#FFFFFF', '#F3F4F6', '#E0F2FE', '#FEF3C7', '#FCE7F3', '#ECFDF5', '#FFF7ED', '#EDE9FE'];

const univerContainer = ref<HTMLElement | null>(null);
const slidesListEl = ref<HTMLElement | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle' | 'modified'>('idle');
const currentFilePath = ref('');
const activeSlideIndex = ref(0);

const showOpenPicker = ref(false);
const showSavePicker = ref(false);

let opfsRoot: FileSystemDirectoryHandle | null = null;
let univer: any = null;
let slideUnit: any = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let dirty = false;
let dragFromIndex = -1;

interface SlideInfo {
  id: string;
  title: string;
  bg: string;
}

const slidesList = ref<SlideInfo[]>([]);

const slideExtensions = [
  { label: 'Univer Slides', extensions: ['.unislide'] },
  { label: 'JSON Files', extensions: ['.json'] },
  { label: 'All Files', extensions: ['*'] },
];

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved';
    case 'saving': return '⏳ Saving…';
    case 'modified': return '● Modified';
    default: return '';
  }
});

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
    return parts[parts.length - 1] || 'presentation.unislide';
  }
  return 'presentation.unislide';
});

const currentSlideBg = computed(() => {
  if (slidesList.value.length === 0) return '#FFFFFF';
  return slidesList.value[activeSlideIndex.value]?.bg ?? '#FFFFFF';
});

/* ── Slide Data Management ── */

function createDefaultSlideData() {
  return {
    id: 'default-slide',
    locale: null,
    name: '',
    appVersion: '',
    title: 'My Presentation',
    body: {
      pages: {
        'slide_1': createSlidePageData('slide_1', 'Slide 1', '#FFFFFF'),
      },
      pageOrder: ['slide_1'],
    },
    pageSize: {
      width: 960,
      height: 540,
    },
  };
}

function createSlidePageData(id: string, title: string, bg: string) {
  return {
    id,
    pageType: 0,
    zIndex: 1,
    title,
    description: '',
    pageBackgroundFill: { rgb: bg },
    defaultTextStyle: {},
    pageElements: {},
  };
}

function generateSlideId(): string {
  return 'slide_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function refreshSlidesList() {
  if (!slideUnit) return;
  const snapshot = JSON.parse(JSON.stringify(slideUnit.getSnapshot()));
  const pages = snapshot.body?.pages || {};
  const order: string[] = snapshot.body?.pageOrder || Object.keys(pages);
  slidesList.value = order.map((id: string) => {
    const page = pages[id];
    return {
      id,
      title: page?.title || '',
      bg: page?.pageBackgroundFill?.rgb || '#FFFFFF',
    };
  });
}

function selectSlide(idx: number) {
  activeSlideIndex.value = Math.max(0, Math.min(idx, slidesList.value.length - 1));
}

function addSlide() {
  if (!slideUnit) return;
  const snapshot = JSON.parse(JSON.stringify(slideUnit.getSnapshot()));
  const pages = snapshot.body?.pages || {};
  const order: string[] = snapshot.body?.pageOrder || Object.keys(pages);

  const newId = generateSlideId();
  const insertIdx = activeSlideIndex.value + 1;
  const bg = SLIDE_COLORS[order.length % SLIDE_COLORS.length];
  pages[newId] = createSlidePageData(newId, `Slide ${order.length + 1}`, bg);
  order.splice(insertIdx, 0, newId);

  snapshot.body.pages = pages;
  snapshot.body.pageOrder = order;
  reloadSlideUnit(snapshot);
  activeSlideIndex.value = insertIdx;
  dirty = true;
  saveStatus.value = 'modified';
}

function removeSlide(idx: number) {
  if (!slideUnit || slidesList.value.length <= 1) return;
  const snapshot = JSON.parse(JSON.stringify(slideUnit.getSnapshot()));
  const pages = snapshot.body?.pages || {};
  const order: string[] = snapshot.body?.pageOrder || Object.keys(pages);

  if (idx < 0 || idx >= order.length) return;
  const removeId = order[idx];
  order.splice(idx, 1);
  delete pages[removeId];

  snapshot.body.pages = pages;
  snapshot.body.pageOrder = order;
  reloadSlideUnit(snapshot);
  activeSlideIndex.value = Math.min(idx, order.length - 1);
  dirty = true;
  saveStatus.value = 'modified';
}

function moveSlide(fromIdx: number, toIdx: number) {
  if (!slideUnit) return;
  if (fromIdx === toIdx) return;
  const snapshot = JSON.parse(JSON.stringify(slideUnit.getSnapshot()));
  const order: string[] = snapshot.body?.pageOrder || Object.keys(snapshot.body?.pages || {});

  if (fromIdx < 0 || fromIdx >= order.length || toIdx < 0 || toIdx >= order.length) return;
  const [item] = order.splice(fromIdx, 1);
  order.splice(toIdx, 0, item);

  snapshot.body.pageOrder = order;
  reloadSlideUnit(snapshot);
  activeSlideIndex.value = toIdx;
  dirty = true;
  saveStatus.value = 'modified';
}

function onBgColorChange(e: Event) {
  if (!slideUnit) return;
  const color = (e.target as HTMLInputElement).value;
  const snapshot = JSON.parse(JSON.stringify(slideUnit.getSnapshot()));
  const order: string[] = snapshot.body?.pageOrder || Object.keys(snapshot.body?.pages || {});
  const slideId = order[activeSlideIndex.value];
  if (slideId && snapshot.body.pages[slideId]) {
    snapshot.body.pages[slideId].pageBackgroundFill = { rgb: color };
    reloadSlideUnit(snapshot);
    dirty = true;
    saveStatus.value = 'modified';
  }
}

function reloadSlideUnit(snapshot: any) {
  if (!univer) return;
  // Dispose the previous slide unit before creating a new one.
  // dispose() may throw if the unit was already cleaned up or if internal
  // Univer state is inconsistent — this is safe to ignore because we are
  // immediately replacing it with a fresh unit from the snapshot.
  try {
    if (slideUnit) {
      slideUnit.dispose?.();
    }
  } catch { /* already disposed or internal state mismatch — safe to proceed */ }
  slideUnit = univer.createUnit(UniverInstanceType.UNIVER_SLIDE, snapshot);
  refreshSlidesList();
}

/* ── Drag & drop reordering ── */

function onDragStart(idx: number, e: DragEvent) {
  dragFromIndex = idx;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
  }
}

function onDragOver(idx: number, e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
}

function onDrop(toIdx: number) {
  if (dragFromIndex >= 0 && dragFromIndex !== toIdx) {
    moveSlide(dragFromIndex, toIdx);
  }
  dragFromIndex = -1;
}

function onDragEnd() {
  dragFromIndex = -1;
}

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
  if (!opfsRoot || !univer) return;
  try {
    const fh = await getFileHandle(opfsRoot, path);
    const file = await fh.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    reloadSlideUnit(data);
    currentFilePath.value = normalizePath(path);
    activeSlideIndex.value = 0;
    dirty = false;
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to load file:', path, e);
  }
}

async function saveToPath(path: string) {
  if (!opfsRoot || !slideUnit) return;
  try {
    saveStatus.value = 'saving';
    const snapshot = JSON.parse(JSON.stringify(slideUnit.getSnapshot()));
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

  univer = new Univer({
    locale: LocaleType.EN_US,
    locales: {
      enUS: mergeLocales(uiEnUS, docsUIEnUS, slidesUIEnUS),
    },
    theme: defaultTheme,
  });

  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverUIPlugin, {
    container: 'univer-container',
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverFormulaEnginePlugin);
  univer.registerPlugin(UniverDrawingPlugin);
  univer.registerPlugin(UniverSlidesPlugin);
  univer.registerPlugin(UniverSlidesUIPlugin);

  const slideData = initialData || createDefaultSlideData();
  slideUnit = univer.createUnit(UniverInstanceType.UNIVER_SLIDE, slideData);
  refreshSlidesList();

  if (initialData) {
    saveStatus.value = 'saved';
  }

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
  width: 100%;
  height: 100vh;
  background: #f5f5f5;
}

/* ── Slides Panel ── */
.slides-panel {
  width: 180px;
  min-width: 180px;
  background: #252526;
  color: #ccc;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #3c3c3c;
}

.slides-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.slides-panel-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: #aaa;
  letter-spacing: 0.5px;
}

.slides-panel-actions {
  display: flex;
  gap: 4px;
}

.sp-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #aaa;
  cursor: pointer;
}
.sp-btn:hover { background: #3c3c3c; color: #fff; }

.slides-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 6px;
}

.slides-list::-webkit-scrollbar { width: 5px; }
.slides-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

.slide-thumb {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  margin-bottom: 4px;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
  user-select: none;
}
.slide-thumb:hover { background: #2a2d2e; }
.slide-thumb.slide-active { background: #094771; }

.slide-number {
  font-size: 10px;
  color: #888;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.slide-preview {
  flex: 1;
  aspect-ratio: 16/9;
  border-radius: 3px;
  border: 1px solid #555;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.slide-label {
  font-size: 9px;
  color: #666;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 4px;
}

.slide-delete {
  position: absolute;
  top: 2px;
  right: 2px;
  display: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.9);
  color: white;
  cursor: pointer;
}
.slide-thumb:hover .slide-delete { display: flex; }

/* ── Main Area ── */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: #f8f9fa;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  min-height: 36px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tb-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #4b5563;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  transition: background 0.15s;
}
.tb-btn:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
.tb-btn:disabled { opacity: 0.4; cursor: default; }
.tb-btn span { display: none; }
@media (min-width: 900px) { .tb-btn span { display: inline; } }

.tb-sep {
  width: 1px;
  height: 20px;
  background: #d1d5db;
  margin: 0 4px;
  flex-shrink: 0;
}

.tb-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.tb-color {
  width: 28px;
  height: 24px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
  background: none;
}

.file-status {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}
.file-status.saved { color: #22c55e; }
.file-status.saving { color: #f59e0b; }
.file-status.modified { color: #ef4444; }

#univer-container {
  flex: 1;
  overflow: hidden;
}
</style>
