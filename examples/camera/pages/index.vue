<template>
  <div class="camera" @click="closeMenus">
    <!-- Top bar -->
    <div class="top-bar">
      <div class="top-left">
        <span class="app-title">📷 Camera</span>
        <div class="menu-dropdown">
          <button class="menu-trigger" @click.stop="showFileMenu = !showFileMenu">File</button>
          <div v-if="showFileMenu" class="menu-items">
            <button class="menu-item" @click="saveCapture(); showFileMenu = false" :disabled="captures.length === 0">
              Save Selected…
            </button>
            <button class="menu-item" @click="clearAll(); showFileMenu = false" :disabled="captures.length === 0">
              Clear All
            </button>
          </div>
        </div>
      </div>
      <div class="top-right">
        <span class="status-text" :class="saveStatus">{{ saveStatusText }}</span>
      </div>
    </div>

    <!-- Main layout -->
    <div class="main-area">
      <!-- Camera preview -->
      <div class="preview-section">
        <div class="preview-container">
          <video
            ref="videoEl"
            class="camera-preview"
            autoplay
            playsinline
            muted
            :class="{ mirrored: facingMode === 'user' }"
          ></video>
          <div v-if="!cameraReady" class="camera-placeholder">
            <div class="placeholder-icon">📷</div>
            <p>{{ cameraError || 'Starting camera…' }}</p>
            <button v-if="cameraError" class="retry-btn" @click="startCamera">Retry</button>
          </div>
          <!-- Recording indicator -->
          <div v-if="isRecordingVideo" class="recording-indicator">
            <span class="rec-dot"></span>
            <span class="rec-time">{{ formattedTime }}</span>
          </div>
          <!-- Flash overlay for photo capture -->
          <div v-if="showFlash" class="flash-overlay"></div>
        </div>

        <!-- Camera controls -->
        <div class="camera-controls">
          <!-- Mode switch -->
          <div class="mode-switch">
            <button
              class="mode-btn"
              :class="{ active: captureMode === 'photo' }"
              @click="captureMode = 'photo'"
              :disabled="isRecordingVideo"
            >Photo</button>
            <button
              class="mode-btn"
              :class="{ active: captureMode === 'video' }"
              @click="captureMode = 'video'"
              :disabled="isRecordingVideo"
            >Video</button>
          </div>

          <!-- Main capture button -->
          <div class="capture-row">
            <button
              v-if="videoInputs.length > 1"
              class="ctrl-btn switch-btn"
              @click="switchCamera"
              :disabled="isRecordingVideo"
              title="Switch Camera"
            >🔄</button>

            <!-- Photo shutter -->
            <button
              v-if="captureMode === 'photo'"
              class="ctrl-btn shutter-btn"
              @click="takePhoto"
              :disabled="!cameraReady"
              title="Take Photo"
            >
              <span class="shutter-ring"></span>
            </button>

            <!-- Video record button -->
            <button
              v-if="captureMode === 'video'"
              class="ctrl-btn record-btn"
              :class="{ recording: isRecordingVideo }"
              @click="toggleVideoRecord"
              :disabled="!cameraReady"
              :title="isRecordingVideo ? 'Stop Recording' : 'Start Recording'"
            >
              <span v-if="!isRecordingVideo" class="record-circle"></span>
              <span v-else class="record-square"></span>
            </button>

            <!-- Spacer to balance layout when no switch button -->
            <div v-if="videoInputs.length <= 1" class="ctrl-spacer"></div>
          </div>

          <!-- Settings row -->
          <div class="settings-row" v-if="videoInputs.length > 1 || hasResolutionOptions">
            <label v-if="videoInputs.length > 1" class="setting-label">
              Camera:
              <select v-model="selectedInput" class="setting-select" :disabled="isRecordingVideo" @change="onInputChange">
                <option v-for="dev in videoInputs" :key="dev.deviceId" :value="dev.deviceId">
                  {{ dev.label || 'Camera' }}
                </option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <!-- Captures gallery -->
      <div class="captures-section">
        <div class="section-header">
          <span>Captures</span>
          <span class="cap-count">{{ captures.length }}</span>
        </div>
        <div class="captures-list">
          <div v-if="captures.length === 0" class="empty-captures">
            No captures yet. Take a photo or record a video.
          </div>
          <div
            v-for="(cap, idx) in captures"
            :key="idx"
            class="capture-item"
            :class="{ selected: selectedIndex === idx }"
            @click="selectCapture(idx)"
          >
            <div class="cap-thumb-container">
              <img v-if="cap.type === 'photo'" :src="cap.objectUrl" class="cap-thumb" />
              <video v-else :src="cap.objectUrl" class="cap-thumb" preload="metadata" />
              <div v-if="cap.type === 'video'" class="cap-badge">▶ {{ cap.duration }}</div>
            </div>
            <div class="cap-info">
              <span class="cap-name">{{ cap.name }}</span>
              <span class="cap-meta">{{ formatSize(cap.size) }}</span>
            </div>
            <div class="cap-actions">
              <button class="cap-btn" @click.stop="saveCapture(idx)" title="Save to OPFS">💾</button>
              <button class="cap-btn" @click.stop="deleteCapture(idx)" title="Delete">🗑</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Review overlay for selected photo/video -->
    <div v-if="reviewItem" class="review-overlay" @click="reviewItem = null">
      <div class="review-content" @click.stop>
        <img v-if="reviewItem.type === 'photo'" :src="reviewItem.objectUrl" class="review-media" />
        <video
          v-else
          ref="reviewVideoEl"
          :src="reviewItem.objectUrl"
          class="review-media"
          controls
          autoplay
        />
        <div class="review-bar">
          <span class="review-name">{{ reviewItem.name }}</span>
          <button class="review-close" @click="reviewItem = null">✕</button>
        </div>
      </div>
    </div>

    <!-- Save Picker -->
    <FilesPicker
      v-model:visible="showSavePicker"
      mode="save"
      title="Save Capture"
      :extensions="savingExtensions"
      initialPath="/home"
      :defaultFileName="saveDefaultName"
      @select="onSaveSelected"
      @cancel="showSavePicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

interface Capture {
  name: string;
  type: 'photo' | 'video';
  blob: Blob;
  objectUrl: string;
  duration?: string;
  size: number;
}

const videoEl = ref<HTMLVideoElement | null>(null);
const reviewVideoEl = ref<HTMLVideoElement | null>(null);
const cameraReady = ref(false);
const cameraError = ref('');
const captureMode = ref<'photo' | 'video'>('photo');
const isRecordingVideo = ref(false);
const elapsedSeconds = ref(0);
const facingMode = ref<'user' | 'environment'>('user');
const selectedInput = ref('');
const videoInputs = ref<MediaDeviceInfo[]>([]);
const captures = ref<Capture[]>([]);
const selectedIndex = ref(-1);
const showFlash = ref(false);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');
const showSavePicker = ref(false);
const showFileMenu = ref(false);
const saveDefaultName = ref('capture');
const reviewItem = ref<Capture | null>(null);

let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let recordTimer: ReturnType<typeof setInterval> | null = null;
let opfsRoot: FileSystemDirectoryHandle | null = null;
const savingCaptureIdx = ref(-1);

const hasResolutionOptions = computed(() => false);

const savingExtensions = computed(() => {
  if (savingCaptureIdx.value >= 0 && savingCaptureIdx.value < captures.value.length) {
    const cap = captures.value[savingCaptureIdx.value];
    if (cap.type === 'photo') {
      return [{ label: 'JPEG Image', extensions: ['.jpg'] }, { label: 'PNG Image', extensions: ['.png'] }];
    }
    return [{ label: 'WebM Video', extensions: ['.webm'] }];
  }
  return [{ label: 'JPEG Image', extensions: ['.jpg'] }, { label: 'WebM Video', extensions: ['.webm'] }];
});

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved';
    case 'saving': return '⏳ Saving…';
    default: return '';
  }
});

const formattedTime = computed(() => {
  const s = elapsedSeconds.value;
  const mins = Math.floor(s / 60).toString().padStart(2, '0');
  const secs = (s % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function closeMenus() {
  showFileMenu.value = false;
}

/* ── Camera setup ── */

async function enumerateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    videoInputs.value = devices.filter(d => d.kind === 'videoinput');
    if (videoInputs.value.length > 0 && !selectedInput.value) {
      selectedInput.value = videoInputs.value[0].deviceId;
    }
  } catch (e) {
    console.warn('Could not enumerate video devices:', e);
  }
}

async function startCamera() {
  cameraError.value = '';
  cameraReady.value = false;

  // Stop existing stream
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }

  try {
    const videoSize = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const constraints: MediaStreamConstraints = {
      video: selectedInput.value
        ? { deviceId: { exact: selectedInput.value }, ...videoSize }
        : { facingMode: facingMode.value, ...videoSize },
      audio: true,
    };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (videoEl.value) {
      videoEl.value.srcObject = mediaStream;
    }

    cameraReady.value = true;

    // Re-enumerate to get labels
    await enumerateDevices();
  } catch (e: unknown) {
    console.error('Failed to start camera:', e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('NotAllowed') || msg.includes('Permission')) {
      cameraError.value = 'Camera permission denied. Please allow camera access.';
    } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
      cameraError.value = 'No camera found on this device.';
    } else {
      cameraError.value = `Camera error: ${msg}`;
    }
  }
}

async function switchCamera() {
  if (videoInputs.value.length < 2) return;

  const currentIdx = videoInputs.value.findIndex(d => d.deviceId === selectedInput.value);
  const nextIdx = (currentIdx + 1) % videoInputs.value.length;
  selectedInput.value = videoInputs.value[nextIdx].deviceId;
  // Update facingMode heuristic
  const label = videoInputs.value[nextIdx].label.toLowerCase();
  facingMode.value = label.includes('front') || label.includes('user') ? 'user' : 'environment';
  await startCamera();
}

async function onInputChange() {
  if (isRecordingVideo.value) return;
  await startCamera();
}

/* ── Photo capture ── */

function takePhoto() {
  if (!videoEl.value || !cameraReady.value) return;

  const video = videoEl.value;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Mirror if front-facing
  if (facingMode.value === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Flash effect
  showFlash.value = true;
  setTimeout(() => { showFlash.value = false; }, 150);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const timestamp = formatTimestamp();
    const objectUrl = URL.createObjectURL(blob);
    captures.value.unshift({
      name: `photo_${timestamp}.jpg`,
      type: 'photo',
      blob,
      objectUrl,
      size: blob.size,
    });
    selectedIndex.value = 0;
  }, 'image/jpeg', 0.92);
}

/* ── Video recording ── */

function toggleVideoRecord() {
  if (!isRecordingVideo.value) {
    startVideoRecording();
  } else {
    stopVideoRecording();
  }
}

function startVideoRecording() {
  if (!mediaStream || !cameraReady.value) return;

  const mimeType = 'video/webm;codecs=vp8,opus';
  const options: MediaRecorderOptions = {};
  if (MediaRecorder.isTypeSupported(mimeType)) {
    options.mimeType = mimeType;
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    options.mimeType = 'video/webm';
  }

  try {
    mediaRecorder = new MediaRecorder(mediaStream, options);
  } catch {
    mediaRecorder = new MediaRecorder(mediaStream);
  }
  chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const objectUrl = URL.createObjectURL(blob);
    const timestamp = formatTimestamp();
    captures.value.unshift({
      name: `video_${timestamp}.webm`,
      type: 'video',
      blob,
      objectUrl,
      duration: formattedTime.value,
      size: blob.size,
    });
    selectedIndex.value = 0;
  };

  mediaRecorder.start(100);
  isRecordingVideo.value = true;
  elapsedSeconds.value = 0;

  recordTimer = setInterval(() => {
    elapsedSeconds.value++;
  }, 1000);
}

function stopVideoRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
  isRecordingVideo.value = false;
}

/* ── Playback ── */

function selectCapture(idx: number) {
  selectedIndex.value = idx;
  reviewItem.value = captures.value[idx];
}

/* ── Save / Delete ── */

function saveCapture(idx?: number) {
  const i = idx ?? selectedIndex.value;
  if (i < 0 || i >= captures.value.length) return;
  savingCaptureIdx.value = i;
  const cap = captures.value[i];
  saveDefaultName.value = cap.name.replace(/\.[^.]+$/, '');
  showSavePicker.value = true;
}

async function onSaveSelected(result: { paths: string[] }) {
  if (!opfsRoot || result.paths.length === 0 || savingCaptureIdx.value < 0) return;
  const cap = captures.value[savingCaptureIdx.value];
  if (!cap) return;

  try {
    saveStatus.value = 'saving';
    const fh = await getFileHandle(opfsRoot, result.paths[0], true);
    const writable = await fh.createWritable();
    await writable.write(cap.blob);
    await writable.close();
    saveStatus.value = 'saved';
    setTimeout(() => { saveStatus.value = 'idle'; }, 2000);
  } catch (e) {
    console.warn('Failed to save capture:', e);
    saveStatus.value = 'idle';
  }
}

function deleteCapture(idx: number) {
  URL.revokeObjectURL(captures.value[idx].objectUrl);
  captures.value.splice(idx, 1);
  if (selectedIndex.value >= captures.value.length) {
    selectedIndex.value = captures.value.length - 1;
  }
  if (reviewItem.value && !captures.value.includes(reviewItem.value)) {
    reviewItem.value = null;
  }
}

function clearAll() {
  captures.value.forEach(c => URL.revokeObjectURL(c.objectUrl));
  captures.value = [];
  selectedIndex.value = -1;
  reviewItem.value = null;
}

/* ── Lifecycle ── */

onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();
  await startCamera();
});

onBeforeUnmount(() => {
  if (isRecordingVideo.value) stopVideoRecording();
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  captures.value.forEach(c => URL.revokeObjectURL(c.objectUrl));
});
</script>

<style scoped>
.camera {
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
.menu-dropdown { position: relative; }

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
.menu-item:disabled { opacity: 0.4; cursor: default; }
.menu-item:disabled:hover { background: none; color: #ccc; }

.status-text { font-size: 11px; color: #888; }
.status-text.saved { color: #4ec9b0; }
.status-text.saving { color: #dcdcaa; }

/* Main area */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Preview section */
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-container {
  flex: 1;
  position: relative;
  background: #111;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.camera-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.camera-preview.mirrored {
  transform: scaleX(-1);
}

.camera-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #666;
  background: #111;
}
.placeholder-icon { font-size: 48px; }

.retry-btn {
  margin-top: 8px;
  background: #333;
  border: 1px solid #555;
  color: #ccc;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.retry-btn:hover { background: #444; }

/* Recording indicator */
.recording-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 10px;
  border-radius: 4px;
  z-index: 10;
}

.rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.rec-time {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  color: #fff;
}

/* Flash overlay */
.flash-overlay {
  position: absolute;
  inset: 0;
  background: #fff;
  animation: flash 0.15s ease-out forwards;
  z-index: 20;
  pointer-events: none;
}

@keyframes flash {
  0% { opacity: 0.8; }
  100% { opacity: 0; }
}

/* Camera controls */
.camera-controls {
  flex-shrink: 0;
  padding: 10px 16px;
  background: #1a1a1a;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.mode-switch {
  display: flex;
  gap: 2px;
  background: #2d2d2d;
  border-radius: 6px;
  padding: 2px;
}

.mode-btn {
  background: none;
  border: none;
  color: #888;
  padding: 4px 16px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}
.mode-btn.active { background: #094771; color: #fff; }
.mode-btn:hover:not(.active):not(:disabled) { color: #ccc; }
.mode-btn:disabled { opacity: 0.3; cursor: default; }

.capture-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.ctrl-btn {
  border: none;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s;
}
.ctrl-btn:hover:not(:disabled) { transform: scale(1.05); }
.ctrl-btn:disabled { opacity: 0.3; cursor: default; }

.ctrl-spacer { width: 40px; }

.switch-btn {
  width: 40px;
  height: 40px;
  background: #333;
  font-size: 18px;
}
.switch-btn:hover:not(:disabled) { background: #444; }

/* Shutter button (photo) */
.shutter-btn {
  width: 64px;
  height: 64px;
  background: #fff;
  padding: 0;
}
.shutter-btn:hover:not(:disabled) { background: #e0e0e0; }

.shutter-ring {
  display: block;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 3px solid #333;
  background: #fff;
}

/* Record button (video) */
.record-btn {
  width: 64px;
  height: 64px;
  background: #333;
  padding: 0;
}

.record-circle {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ef4444;
}

.record-btn.recording {
  animation: pulse-ring 1.5s infinite;
}

.record-square {
  display: block;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: #ef4444;
}

@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.setting-label {
  font-size: 12px;
  color: #aaa;
  display: flex;
  align-items: center;
  gap: 6px;
}

.setting-select {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #ccc;
  padding: 3px 8px;
  font-size: 12px;
  border-radius: 3px;
  outline: none;
}
.setting-select:focus { border-color: #007acc; }

/* Captures section */
.captures-section {
  flex-shrink: 0;
  max-height: 200px;
  display: flex;
  flex-direction: column;
  border-top: 1px solid #3c3c3c;
  background: #252526;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.cap-count {
  background: #3c3c3c;
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 11px;
  color: #aaa;
}

.captures-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.captures-list::-webkit-scrollbar { width: 6px; }
.captures-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

.empty-captures {
  padding: 16px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.capture-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 3px;
  margin: 1px 4px;
}
.capture-item:hover { background: #2a2d2e; }
.capture-item.selected { background: #094771; }

.cap-thumb-container {
  width: 48px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 3px;
  overflow: hidden;
  background: #1a1a1a;
  position: relative;
}

.cap-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cap-badge {
  position: absolute;
  bottom: 1px;
  right: 1px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 8px;
  padding: 0 3px;
  border-radius: 2px;
}

.cap-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cap-name {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cap-meta {
  font-size: 10px;
  color: #888;
}

.cap-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.cap-btn {
  background: none;
  border: 1px solid transparent;
  color: #aaa;
  padding: 2px 5px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 3px;
}
.cap-btn:hover { background: #3c3c3c; border-color: #555; }

/* Review overlay */
.review-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}

.review-content {
  position: relative;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.review-media {
  max-width: 90vw;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 4px;
}

.review-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: #2d2d2d;
  border-radius: 0 0 4px 4px;
}

.review-name {
  font-size: 12px;
  color: #ccc;
}

.review-close {
  background: none;
  border: none;
  color: #aaa;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}
.review-close:hover { color: #fff; }
</style>
