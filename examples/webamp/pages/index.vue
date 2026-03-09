<template>
  <div class="webamp-app">
    <!-- Top bar -->
    <div class="top-bar">
      <div class="top-left">
        <span class="app-title">🎵 Webamp</span>
        <button class="bar-btn" @click="openFilePicker">Open Files</button>
        <button class="bar-btn" @click="openFolderPicker">Open Folder</button>
      </div>
      <div class="top-right">
        <span class="track-info" v-if="currentTrack">{{ currentTrack.name }}</span>
      </div>
    </div>

    <!-- Webamp container -->
    <div class="webamp-container" ref="webampContainer">
      <div id="webamp-target"></div>
      <div v-if="!webampReady" class="loading-state">
        <div class="loading-icon">🎵</div>
        <p>Loading Webamp...</p>
        <p class="loading-hint">Open audio files to start playing music</p>
      </div>
    </div>

    <!-- Playlist panel -->
    <div class="playlist-panel" v-if="playlist.length > 0">
      <div class="playlist-header">
        <span>Playlist ({{ playlist.length }} tracks)</span>
        <button class="bar-btn" @click="clearPlaylist">Clear</button>
      </div>
      <div class="playlist-list">
        <div
          v-for="(track, idx) in playlist"
          :key="idx"
          class="playlist-item"
          :class="{ active: currentTrackIndex === idx }"
          @dblclick="playTrack(idx)"
        >
          <span class="track-num">{{ idx + 1 }}.</span>
          <span class="track-name">{{ track.name }}</span>
        </div>
      </div>
    </div>

    <!-- File pickers -->
    <FilesPicker
      v-model:visible="showFilePicker"
      mode="files"
      title="Open Audio Files"
      :extensions="audioExtensions"
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
import { ref, onMounted, onBeforeUnmount } from 'vue';

interface Track {
  name: string;
  path: string;
  objectUrl: string;
  blob: Blob;
}

const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.webm'];

const audioExtensions = [
  { label: 'Audio Files', extensions: AUDIO_EXTS },
];

const webampContainer = ref<HTMLElement | null>(null);
const webampReady = ref(false);
const playlist = ref<Track[]>([]);
const currentTrackIndex = ref(-1);
const showFilePicker = ref(false);
const showFolderPicker = ref(false);

let webampInstance: any = null;
let opfsRoot: FileSystemDirectoryHandle | null = null;

const currentTrack = computed(() =>
  currentTrackIndex.value >= 0 ? playlist.value[currentTrackIndex.value] : null
);

function getMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.wma')) return 'audio/x-ms-wma';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'audio/mpeg';
}

function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTS.some(ext => lower.endsWith(ext));
}

async function loadAudioFile(path: string): Promise<Track | null> {
  if (!opfsRoot) return null;
  const name = path.split('/').pop() || '';
  if (!isAudioFile(name)) return null;

  try {
    const fh = await getFileHandle(opfsRoot, path);
    const file = await fh.getFile();
    const blob = new Blob([await file.arrayBuffer()], { type: getMimeType(name) });
    const objectUrl = URL.createObjectURL(blob);
    return { name, path: normalizePath(path), objectUrl, blob };
  } catch (e) {
    console.warn('Failed to load audio file:', path, e);
    return null;
  }
}

/* ── Webamp initialization ── */

async function initWebamp(tracks: Track[]) {
  if (webampInstance) {
    webampInstance.dispose();
    webampInstance = null;
  }

  try {
    const WebampModule = await import('webamp');
    const Webamp = WebampModule.default || WebampModule;

    const initialTracks = tracks.map(t => ({
      metaData: { artist: '', title: t.name.replace(/\.[^.]+$/, '') },
      url: t.objectUrl,
    }));

    webampInstance = new Webamp({
      initialTracks: initialTracks.length > 0 ? initialTracks : undefined,
    });

    const target = document.getElementById('webamp-target');
    if (target) {
      await webampInstance.renderWhenReady(target);
      webampReady.value = true;
    }
  } catch (e) {
    console.error('Failed to initialize Webamp:', e);
  }
}

async function addTracksToWebamp(tracks: Track[]) {
  if (!webampInstance) {
    await initWebamp(tracks);
    return;
  }

  // Append tracks to Webamp playlist
  const newTracks = tracks.map(t => ({
    metaData: { artist: '', title: t.name.replace(/\.[^.]+$/, '') },
    url: t.objectUrl,
  }));

  try {
    webampInstance.appendTracks(newTracks);
  } catch {
    // If appendTracks is not available, reinitialize
    await initWebamp([...playlist.value]);
  }
}

function playTrack(idx: number) {
  currentTrackIndex.value = idx;
  // Webamp manages its own playlist internally
}

function clearPlaylist() {
  playlist.value.forEach(t => URL.revokeObjectURL(t.objectUrl));
  playlist.value = [];
  currentTrackIndex.value = -1;
}

/* ── File picker callbacks ── */

function openFilePicker() { showFilePicker.value = true; }
function openFolderPicker() { showFolderPicker.value = true; }

async function onFilesSelected(result: { paths: string[] }) {
  const newTracks: Track[] = [];
  for (const path of result.paths) {
    const track = await loadAudioFile(path);
    if (track) newTracks.push(track);
  }
  if (newTracks.length > 0) {
    playlist.value.push(...newTracks);
    await addTracksToWebamp(newTracks);
    if (currentTrackIndex.value < 0) currentTrackIndex.value = 0;
  }
}

async function onFolderSelected(result: { paths: string[] }) {
  if (!opfsRoot || result.paths.length === 0) return;
  try {
    const dirItems = await readDirItems(opfsRoot, result.paths[0]);
    const newTracks: Track[] = [];
    for (const item of dirItems) {
      if (item.isDirectory || !isAudioFile(item.name)) continue;
      const fullPath = normalizePath(result.paths[0] + '/' + item.name);
      const track = await loadAudioFile(fullPath);
      if (track) newTracks.push(track);
    }
    if (newTracks.length > 0) {
      playlist.value.push(...newTracks);
      await addTracksToWebamp(newTracks);
      if (currentTrackIndex.value < 0) currentTrackIndex.value = 0;
    }
  } catch (e) {
    console.warn('Failed to load folder:', e);
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

  const initialPaths = getInitialPaths();
  if (initialPaths.length > 0) {
    // Check if first path is a folder
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
            await onFolderSelected({ paths: [initialPaths[0]] });
            return;
          } catch { /* not a directory */ }
        }
      } catch { /* ignore */ }
    }

    // Load as individual files
    const tracks: Track[] = [];
    for (const path of initialPaths) {
      const track = await loadAudioFile(path);
      if (track) tracks.push(track);
    }
    if (tracks.length > 0) {
      playlist.value = tracks;
      currentTrackIndex.value = 0;
      await initWebamp(tracks);
    }
  } else {
    await initWebamp([]);
  }
});

onBeforeUnmount(() => {
  if (webampInstance) {
    try { webampInstance.dispose(); } catch { /* ignore */ }
  }
  playlist.value.forEach(t => URL.revokeObjectURL(t.objectUrl));
});
</script>

<style scoped>
.webamp-app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #1a1a2e;
  color: #d4d4d4;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
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

.track-info {
  font-size: 12px;
  color: #aaa;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Webamp container */
.webamp-container {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  min-height: 300px;
}

.webamp-container :deep(#webamp) {
  position: relative !important;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #666;
}
.loading-icon { font-size: 48px; }
.loading-hint { font-size: 12px; color: #555; }

/* Playlist panel */
.playlist-panel {
  max-height: 200px;
  display: flex;
  flex-direction: column;
  border-top: 1px solid #3c3c3c;
  background: #252526;
}

.playlist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.playlist-list {
  flex: 1;
  overflow-y: auto;
}

.playlist-list::-webkit-scrollbar { width: 6px; }
.playlist-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

.playlist-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.playlist-item:hover { background: #2a2d2e; }
.playlist-item.active { background: #094771; }

.track-num {
  color: #666;
  min-width: 20px;
}

.track-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
