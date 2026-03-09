<template>
  <div class="gallery" @click="closeMenus">
    <!-- Top bar -->
    <div class="top-bar">
      <div class="top-left">
        <span class="app-title">🖼️ Gallery</span>
        <div class="menu-dropdown">
          <button class="menu-trigger" @click.stop="showFileMenu = !showFileMenu">File</button>
          <div v-if="showFileMenu" class="menu-items">
            <button class="menu-item" @click="openFilePicker(); showFileMenu = false">Open Files…</button>
            <button class="menu-item" @click="openFolderPicker(); showFileMenu = false">Open Folder…</button>
          </div>
        </div>
      </div>
      <div class="top-right">
        <button v-if="viewMode === 'viewer'" class="bar-btn" @click="viewMode = 'grid'">← Back to Grid</button>
        <template v-if="viewMode === 'grid' && mediaItems.length > 0">
          <button class="bar-btn icon-btn" :class="{ active: gridSize === 'small' }" @click="gridSize = 'small'" title="Small thumbnails">▪</button>
          <button class="bar-btn icon-btn" :class="{ active: gridSize === 'medium' }" @click="gridSize = 'medium'" title="Medium thumbnails">▪▪</button>
          <button class="bar-btn icon-btn" :class="{ active: gridSize === 'large' }" @click="gridSize = 'large'" title="Large thumbnails">▪▪▪</button>
        </template>
      </div>
    </div>

    <!-- Grid View -->
    <div v-if="viewMode === 'grid'" class="grid-view" :class="gridSize">
      <div v-if="mediaItems.length === 0" class="empty-state">
        <div class="empty-icon">🖼️</div>
        <p>No media files loaded</p>
        <p class="empty-hint">Open files or a folder to view images and videos</p>
      </div>
      <div
        v-for="(item, idx) in mediaItems"
        :key="item.path"
        class="grid-item"
        @click="openViewer(idx)"
      >
        <div class="thumb-container">
          <img v-if="item.type === 'image'" :src="item.objectUrl" class="thumb" loading="lazy" />
          <video v-else-if="item.type === 'video'" :src="item.objectUrl" class="thumb" preload="metadata" />
          <div class="thumb-overlay">
            <span class="thumb-icon">{{ item.type === 'video' ? '▶' : '' }}</span>
          </div>
        </div>
        <div class="thumb-name" :title="item.name">{{ item.name }}</div>
      </div>
    </div>

    <!-- Viewer Mode -->
    <div v-if="viewMode === 'viewer' && currentItem" class="viewer">
      <div class="viewer-content">
        <img
          v-if="currentItem.type === 'image'"
          :src="currentItem.objectUrl"
          class="viewer-media"
          :style="{ transform: `scale(${zoom}) rotate(${rotation}deg)` }"
          @wheel.prevent="onWheel"
        />
        <video
          v-else-if="currentItem.type === 'video'"
          ref="videoEl"
          :src="currentItem.objectUrl"
          class="viewer-media viewer-video"
          controls
          autoplay
        />
      </div>

      <!-- Viewer controls -->
      <div class="viewer-controls">
        <button class="vc-btn" :disabled="currentIndex <= 0" @click="prevMedia" title="Previous">◀</button>
        <span class="vc-info">{{ currentIndex + 1 }} / {{ mediaItems.length }}</span>
        <button class="vc-btn" :disabled="currentIndex >= mediaItems.length - 1" @click="nextMedia" title="Next">▶</button>
        <span class="vc-divider">|</span>
        <template v-if="currentItem.type === 'image'">
          <button class="vc-btn" @click="zoomIn" title="Zoom In">+</button>
          <button class="vc-btn" @click="zoomOut" title="Zoom Out">−</button>
          <button class="vc-btn" @click="zoomReset" title="Reset Zoom">1:1</button>
          <button class="vc-btn" @click="rotateRight" title="Rotate Right">↻</button>
        </template>
      </div>

      <!-- Name bar -->
      <div class="viewer-name">{{ currentItem.name }}</div>
    </div>

    <!-- File Pickers -->
    <FilesPicker
      v-model:visible="showFilePicker"
      mode="files"
      title="Open Media Files"
      :extensions="mediaExtensions"
      initialPath="/home"
      @select="onFilesSelected"
      @cancel="showFilePicker = false"
    />
    <FilesPicker
      v-model:visible="showFolderPicker"
      mode="directory"
      title="Open Folder"
      initialPath="/home"
      @select="onFolderSelected"
      @cancel="showFolderPicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';

interface MediaItem {
  name: string;
  path: string;
  type: 'image' | 'video';
  objectUrl: string;
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.avif'];
const VIDEO_EXTS = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.ogg'];
const ALL_MEDIA_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS];

const mediaExtensions = [
  { label: 'Images & Videos', extensions: ALL_MEDIA_EXTS },
  { label: 'Images', extensions: IMAGE_EXTS },
  { label: 'Videos', extensions: VIDEO_EXTS },
];

const mediaItems = ref<MediaItem[]>([]);
const viewMode = ref<'grid' | 'viewer'>('grid');
const gridSize = ref<'small' | 'medium' | 'large'>('medium');
const currentIndex = ref(0);
const zoom = ref(1);
const rotation = ref(0);
const showFilePicker = ref(false);
const showFolderPicker = ref(false);
const showFileMenu = ref(false);
const videoEl = ref<HTMLVideoElement | null>(null);

let opfsRoot: FileSystemDirectoryHandle | null = null;

function closeMenus() {
  showFileMenu.value = false;
}

const currentItem = computed(() => mediaItems.value[currentIndex.value] || null);

function getMediaType(name: string): 'image' | 'video' | null {
  const lower = name.toLowerCase();
  if (IMAGE_EXTS.some(ext => lower.endsWith(ext))) return 'image';
  if (VIDEO_EXTS.some(ext => lower.endsWith(ext))) return 'video';
  return null;
}

function getMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.avif')) return 'image/avif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.ogg')) return 'video/ogg';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  return 'application/octet-stream';
}

async function loadMediaFile(path: string): Promise<MediaItem | null> {
  if (!opfsRoot) return null;
  const name = path.split('/').pop() || '';
  const type = getMediaType(name);
  if (!type) return null;

  try {
    const fh = await getFileHandle(opfsRoot, path);
    const file = await fh.getFile();
    const blob = new Blob([await file.arrayBuffer()], { type: getMimeType(name) });
    const objectUrl = URL.createObjectURL(blob);
    return { name, path: normalizePath(path), type, objectUrl };
  } catch (e) {
    console.warn('Failed to load media file:', path, e);
    return null;
  }
}

async function loadFolder(folderPath: string) {
  if (!opfsRoot) return;
  try {
    const dirItems = await readDirItems(opfsRoot, folderPath);
    const newItems: MediaItem[] = [];
    for (const item of dirItems) {
      if (item.isDirectory) continue;
      const type = getMediaType(item.name);
      if (!type) continue;
      const fullPath = normalizePath(folderPath + '/' + item.name);
      const mediaItem = await loadMediaFile(fullPath);
      if (mediaItem) newItems.push(mediaItem);
    }
    releaseUrls();
    mediaItems.value = newItems;
  } catch (e) {
    console.warn('Failed to load folder:', folderPath, e);
  }
}

function releaseUrls() {
  for (const item of mediaItems.value) {
    URL.revokeObjectURL(item.objectUrl);
  }
}

/* ── Viewer controls ── */

function openViewer(idx: number) {
  currentIndex.value = idx;
  zoom.value = 1;
  rotation.value = 0;
  viewMode.value = 'viewer';
}

function prevMedia() {
  if (currentIndex.value > 0) {
    currentIndex.value--;
    zoom.value = 1;
    rotation.value = 0;
  }
}

function nextMedia() {
  if (currentIndex.value < mediaItems.value.length - 1) {
    currentIndex.value++;
    zoom.value = 1;
    rotation.value = 0;
  }
}

function zoomIn() { zoom.value = Math.min(zoom.value * 1.25, 10); }
function zoomOut() { zoom.value = Math.max(zoom.value / 1.25, 0.1); }
function zoomReset() { zoom.value = 1; }
function rotateRight() { rotation.value = (rotation.value + 90) % 360; }

function onWheel(e: WheelEvent) {
  if (e.deltaY < 0) zoomIn();
  else zoomOut();
}

/* ── Keyboard navigation ── */

function onKeydown(e: KeyboardEvent) {
  if (viewMode.value !== 'viewer') return;
  if (e.key === 'ArrowLeft') prevMedia();
  else if (e.key === 'ArrowRight') nextMedia();
  else if (e.key === 'Escape') viewMode.value = 'grid';
  else if (e.key === '+' || e.key === '=') zoomIn();
  else if (e.key === '-') zoomOut();
  else if (e.key === '0') zoomReset();
  else if (e.key === 'r') rotateRight();
}

/* ── File picker callbacks ── */

function openFilePicker() { showFilePicker.value = true; }
function openFolderPicker() { showFolderPicker.value = true; }

async function onFilesSelected(result: { paths: string[] }) {
  const newItems: MediaItem[] = [];
  for (const path of result.paths) {
    const item = await loadMediaFile(path);
    if (item) newItems.push(item);
  }
  if (newItems.length > 0) {
    releaseUrls();
    mediaItems.value = newItems;
  }
}

async function onFolderSelected(result: { paths: string[] }) {
  if (result.paths.length > 0) {
    await loadFolder(result.paths[0]);
  }
}

/* ── Initial args ── */

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

/* ── Lifecycle ── */

onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();
  document.addEventListener('keydown', onKeydown);

  const initialPaths = getInitialPaths();
  if (initialPaths.length > 0) {
    // Check if the first path is a directory
    if (opfsRoot) {
      try {
        const parts = getPathParts(initialPaths[0]);
        if (parts.length > 0) {
          const name = parts[parts.length - 1];
          const parentParts = parts.slice(0, -1);
          let parent = opfsRoot;
          for (const p of parentParts) parent = await parent.getDirectoryHandle(p);
          try {
            await parent.getDirectoryHandle(name);
            // It's a directory — load it
            await loadFolder(initialPaths[0]);
            return;
          } catch { /* not a directory, continue as files */ }
        }
      } catch { /* ignore */ }
    }

    // Load as individual files
    const items: MediaItem[] = [];
    for (const path of initialPaths) {
      const item = await loadMediaFile(path);
      if (item) items.push(item);
    }
    mediaItems.value = items;
    if (items.length === 1) {
      openViewer(0);
    }
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  releaseUrls();
});
</script>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
}

/* Top bar */
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
  gap: 4px;
}

.app-title {
  font-weight: 600;
  font-size: 13px;
  margin-right: 4px;
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
  min-width: 160px;
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
.bar-btn:disabled { opacity: 0.4; cursor: default; }
.bar-btn.active { background: #094771; border-color: #007acc; }

.icon-btn {
  width: 28px;
  padding: 3px 0;
  text-align: center;
  font-size: 10px;
}

/* Grid View */
.grid-view {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
}

.grid-view::-webkit-scrollbar { width: 6px; }
.grid-view::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

.empty-state {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #666;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-hint { font-size: 12px; color: #555; margin-top: 4px; }

.grid-item {
  cursor: pointer;
  border-radius: 4px;
  overflow: hidden;
  background: #252526;
  border: 2px solid transparent;
  transition: border-color 0.15s;
}
.grid-item:hover { border-color: #007acc; }

/* Grid sizes */
.grid-view.small .grid-item { width: 100px; }
.grid-view.small .thumb-container { height: 80px; }
.grid-view.medium .grid-item { width: 160px; }
.grid-view.medium .thumb-container { height: 120px; }
.grid-view.large .grid-item { width: 240px; }
.grid-view.large .thumb-container { height: 180px; }

.thumb-container {
  position: relative;
  overflow: hidden;
  background: #1a1a1a;
}

.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.thumb-icon {
  font-size: 24px;
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.thumb-name {
  padding: 4px 6px;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #aaa;
}

/* Viewer */
.viewer {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.viewer-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #111;
}

.viewer-media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.15s;
}

.viewer-video {
  max-width: 100%;
  max-height: 100%;
}

.viewer-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px;
  background: #2d2d2d;
  border-top: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.vc-btn {
  background: none;
  border: 1px solid #555;
  color: #ccc;
  width: 30px;
  height: 26px;
  cursor: pointer;
  border-radius: 3px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vc-btn:hover:not(:disabled) { background: #3c3c3c; }
.vc-btn:disabled { opacity: 0.3; cursor: default; }

.vc-info {
  font-size: 12px;
  color: #aaa;
  min-width: 50px;
  text-align: center;
}

.vc-divider {
  color: #555;
  margin: 0 4px;
}

.viewer-name {
  padding: 3px 10px;
  font-size: 11px;
  color: #888;
  background: #252526;
  text-align: center;
  border-top: 1px solid #3c3c3c;
  flex-shrink: 0;
}
</style>
