<template>
  <div class="webamp-app" @click="closeMenus">
    <!-- Webamp player area (fills the screen) -->
    <div class="webamp-area" ref="webampContainer">
      <div id="webamp-target"></div>

      <!-- Loading / empty state with integrated file open buttons -->
      <div v-if="!webampReady" class="splash">
        <div class="splash-icon">🎵</div>
        <p class="splash-title">Webamp</p>
        <p class="splash-hint">Drop audio files here or use the buttons below</p>
        <div class="splash-actions">
          <button class="splash-btn" @click.stop="openFilePicker">Open Files</button>
          <button class="splash-btn" @click.stop="openFolderPicker">Open Folder</button>
        </div>
      </div>

      <!-- Floating add-files button (visible when player is active) -->
      <button v-if="webampReady" class="fab" @click.stop="showFab = !showFab" title="Add music">＋</button>
      <div v-if="webampReady && showFab" class="fab-menu" @click.stop>
        <button class="fab-item" @click="openFilePicker(); showFab = false">Open Files</button>
        <button class="fab-item" @click="openFolderPicker(); showFab = false">Open Folder</button>
        <button class="fab-item" @click="clearPlaylist(); showFab = false">Clear Playlist</button>
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
const showFab = ref(false);

let webampInstance: any = null;
let opfsRoot: FileSystemDirectoryHandle | null = null;

function closeMenus() {
  showFab.value = false;
}

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
  width: 100%;
  height: 100vh;
  background: #1a1a2e;
  color: #d4d4d4;
  overflow: hidden;
  position: relative;
}

/* Player area fills everything */
.webamp-area {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

.webamp-area :deep(#webamp) {
  position: relative !important;
}

/* Splash / loading screen */
.splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #888;
  user-select: none;
}
.splash-icon { font-size: 64px; }
.splash-title { font-size: 22px; font-weight: 600; color: #bbb; }
.splash-hint { font-size: 12px; color: #666; }

.splash-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.splash-btn {
  background: #2d2d3d;
  border: 1px solid #444;
  color: #ccc;
  padding: 8px 20px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
}
.splash-btn:hover { background: #3a3a4e; border-color: #007acc; }

/* Floating action button */
.fab {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #007acc;
  color: #fff;
  border: none;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  z-index: 100;
  transition: background 0.15s;
}
.fab:hover { background: #0098ff; }

.fab-menu {
  position: absolute;
  bottom: 62px;
  right: 16px;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 4px 0;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  min-width: 140px;
}

.fab-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: #ccc;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.fab-item:hover { background: #094771; color: #fff; }
</style>
