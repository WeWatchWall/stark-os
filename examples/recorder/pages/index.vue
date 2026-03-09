<template>
  <div class="recorder">
    <!-- Top bar -->
    <div class="top-bar">
      <span class="app-title">🎙️ Recorder</span>
      <span class="status-text" :class="saveStatus">{{ saveStatusText }}</span>
    </div>

    <!-- Main content -->
    <div class="main">
      <!-- Visualizer -->
      <div class="visualizer-section">
        <canvas ref="canvasEl" class="visualizer-canvas" width="600" height="200"></canvas>
        <div class="timer">{{ formattedTime }}</div>
      </div>

      <!-- Controls -->
      <div class="controls">
        <button
          class="ctrl-btn record-btn"
          :class="{ recording: isRecording, paused: isPaused }"
          @click="toggleRecord"
          :title="isRecording ? (isPaused ? 'Resume' : 'Pause') : 'Record'"
        >
          <span v-if="!isRecording" class="btn-icon">●</span>
          <span v-else-if="isPaused" class="btn-icon">▶</span>
          <span v-else class="btn-icon">⏸</span>
        </button>
        <button class="ctrl-btn stop-btn" :disabled="!isRecording && !isPaused" @click="stopRecording" title="Stop">
          <span class="btn-icon">■</span>
        </button>
      </div>

      <!-- Settings -->
      <div class="settings">
        <label class="setting-label">
          Format:
          <select v-model="format" class="setting-select" :disabled="isRecording">
            <option value="webm">WebM (Opus)</option>
            <option value="wav">WAV</option>
          </select>
        </label>
        <label class="setting-label" v-if="audioInputs.length > 1">
          Input:
          <select v-model="selectedInput" class="setting-select" :disabled="isRecording" @change="onInputChange">
            <option v-for="dev in audioInputs" :key="dev.deviceId" :value="dev.deviceId">{{ dev.label || 'Microphone' }}</option>
          </select>
        </label>
      </div>

      <!-- Recordings list -->
      <div class="recordings-section">
        <div class="section-header">
          <span>Recordings</span>
          <span class="rec-count">{{ recordings.length }}</span>
        </div>
        <div class="recordings-list">
          <div v-if="recordings.length === 0" class="empty-recordings">
            No recordings yet. Press the record button to start.
          </div>
          <div
            v-for="(rec, idx) in recordings"
            :key="idx"
            class="recording-item"
            :class="{ playing: playingIndex === idx }"
          >
            <div class="rec-info">
              <span class="rec-name">{{ rec.name }}</span>
              <span class="rec-meta">{{ rec.duration }} · {{ formatRecSize(rec.size) }}</span>
            </div>
            <div class="rec-actions">
              <button class="rec-btn" @click="playRecording(idx)" :title="playingIndex === idx ? 'Stop' : 'Play'">
                {{ playingIndex === idx ? '⏹' : '▶' }}
              </button>
              <button class="rec-btn" @click="saveRecording(idx)" title="Save to OPFS">💾</button>
              <button class="rec-btn" @click="deleteRecording(idx)" title="Delete">🗑</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Picker -->
    <FilesPicker
      v-model:visible="showSavePicker"
      mode="save"
      title="Save Recording"
      :extensions="saveExtensions"
      initialPath="/home"
      :defaultFileName="saveDefaultName"
      @select="onSaveSelected"
      @cancel="showSavePicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

interface Recording {
  name: string;
  blob: Blob;
  objectUrl: string;
  duration: string;
  size: number;
}

const canvasEl = ref<HTMLCanvasElement | null>(null);
const isRecording = ref(false);
const isPaused = ref(false);
const format = ref<'webm' | 'wav'>('webm');
const selectedInput = ref('');
const audioInputs = ref<MediaDeviceInfo[]>([]);
const recordings = ref<Recording[]>([]);
const playingIndex = ref(-1);
const elapsedSeconds = ref(0);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');
const showSavePicker = ref(false);
const saveDefaultName = ref('recording');
let savingRecordingIdx = -1;

let mediaRecorder: MediaRecorder | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaStream: MediaStream | null = null;
let chunks: Blob[] = [];
let recordTimer: ReturnType<typeof setInterval> | null = null;
let animFrameId = 0;
let playAudio: HTMLAudioElement | null = null;
let opfsRoot: FileSystemDirectoryHandle | null = null;

const saveExtensions = computed(() => [{
  label: format.value === 'webm' ? 'WebM Audio' : 'WAV Audio',
  extensions: [format.value === 'webm' ? '.webm' : '.wav'],
}]);

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

function formatRecSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Audio input enumeration ── */

async function enumerateInputs() {
  try {
    // Request permission first
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    audioInputs.value = devices.filter(d => d.kind === 'audioinput');
    if (audioInputs.value.length > 0 && !selectedInput.value) {
      selectedInput.value = audioInputs.value[0].deviceId;
    }
  } catch (e) {
    console.warn('Could not enumerate audio inputs:', e);
  }
}

async function onInputChange() {
  // Restart stream if recording
  if (isRecording.value) {
    await stopRecording();
  }
}

/* ── Visualizer ── */

function drawVisualizer() {
  const canvas = canvasEl.value;
  if (!canvas || !analyser) return;

  const ctx = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = isRecording.value && !isPaused.value ? '#ef4444' : '#4ec9b0';
  ctx.beginPath();

  const sliceWidth = width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * height) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    x += sliceWidth;
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();

  animFrameId = requestAnimationFrame(drawVisualizer);
}

/* ── Recording ── */

async function toggleRecord() {
  if (!isRecording.value) {
    await startRecording();
  } else if (isPaused.value) {
    resumeRecording();
  } else {
    pauseRecording();
  }
}

async function startRecording() {
  try {
    const constraints: MediaStreamConstraints = {
      audio: selectedInput.value ? { deviceId: { exact: selectedInput.value } } : true,
    };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Setup audio context for visualizer
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyser);

    // Setup MediaRecorder
    const mimeType = format.value === 'webm' ? 'audio/webm;codecs=opus' : 'audio/webm';
    const options: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported(mimeType)) {
      options.mimeType = mimeType;
    }

    mediaRecorder = new MediaRecorder(mediaStream, options);
    chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const ext = format.value === 'webm' ? '.webm' : '.wav';
      const mType = format.value === 'webm' ? 'audio/webm' : 'audio/wav';
      const blob = new Blob(chunks, { type: mType });
      const objectUrl = URL.createObjectURL(blob);
      const now = new Date();
      const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
      recordings.value.push({
        name: `recording_${timestamp}${ext}`,
        blob,
        objectUrl,
        duration: formattedTime.value,
        size: blob.size,
      });
    };

    mediaRecorder.start(100);
    isRecording.value = true;
    isPaused.value = false;
    elapsedSeconds.value = 0;

    recordTimer = setInterval(() => {
      if (!isPaused.value) elapsedSeconds.value++;
    }, 1000);

    drawVisualizer();
  } catch (e) {
    console.error('Failed to start recording:', e);
  }
}

function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    isPaused.value = true;
  }
}

function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    isPaused.value = false;
  }
}

async function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    await audioContext.close();
    audioContext = null;
    analyser = null;
  }
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = 0;
  }
  isRecording.value = false;
  isPaused.value = false;
}

/* ── Playback ── */

function playRecording(idx: number) {
  if (playingIndex.value === idx) {
    playAudio?.pause();
    playAudio = null;
    playingIndex.value = -1;
    return;
  }

  if (playAudio) {
    playAudio.pause();
    playAudio = null;
  }

  const rec = recordings.value[idx];
  playAudio = new Audio(rec.objectUrl);
  playAudio.onended = () => { playingIndex.value = -1; };
  playAudio.play();
  playingIndex.value = idx;
}

/* ── Save/Delete ── */

function saveRecording(idx: number) {
  savingRecordingIdx = idx;
  saveDefaultName.value = recordings.value[idx].name.replace(/\.[^.]+$/, '');
  showSavePicker.value = true;
}

async function onSaveSelected(result: { paths: string[] }) {
  if (!opfsRoot || result.paths.length === 0 || savingRecordingIdx < 0) return;
  const rec = recordings.value[savingRecordingIdx];
  if (!rec) return;

  try {
    saveStatus.value = 'saving';
    const fh = await getFileHandle(opfsRoot, result.paths[0], true);
    const writable = await fh.createWritable();
    await writable.write(rec.blob);
    await writable.close();
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to save recording:', e);
    saveStatus.value = 'idle';
  }
}

function deleteRecording(idx: number) {
  if (playingIndex.value === idx) {
    playAudio?.pause();
    playAudio = null;
    playingIndex.value = -1;
  }
  URL.revokeObjectURL(recordings.value[idx].objectUrl);
  recordings.value.splice(idx, 1);
}

/* ── Lifecycle ── */

onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();
  await enumerateInputs();

  // Resize canvas to fit container
  const resizeCanvas = () => {
    if (canvasEl.value) {
      const parent = canvasEl.value.parentElement;
      if (parent) {
        canvasEl.value.width = parent.clientWidth;
        canvasEl.value.height = 160;
      }
    }
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
});

onBeforeUnmount(async () => {
  await stopRecording();
  if (playAudio) playAudio.pause();
  recordings.value.forEach(r => URL.revokeObjectURL(r.objectUrl));
});
</script>

<style scoped>
.recorder {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
}

.app-title {
  font-weight: 600;
  font-size: 13px;
}

.status-text {
  font-size: 11px;
  color: #888;
}
.status-text.saved { color: #4ec9b0; }
.status-text.saving { color: #dcdcaa; }

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px;
  gap: 16px;
}

/* Visualizer */
.visualizer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.visualizer-canvas {
  width: 100%;
  max-width: 600px;
  height: 160px;
  background: #1a1a2e;
  border-radius: 8px;
  border: 1px solid #333;
}

.timer {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 32px;
  color: #ccc;
  letter-spacing: 2px;
}

/* Controls */
.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.ctrl-btn {
  border: none;
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s, background 0.2s;
}
.ctrl-btn:hover:not(:disabled) { transform: scale(1.05); }
.ctrl-btn:disabled { opacity: 0.3; cursor: default; }

.record-btn {
  width: 64px;
  height: 64px;
  background: #333;
  color: #ef4444;
  font-size: 28px;
}
.record-btn.recording {
  background: #ef4444;
  color: #fff;
  animation: pulse 1.5s infinite;
}
.record-btn.paused {
  background: #f59e0b;
  color: #fff;
  animation: none;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
}

.stop-btn {
  width: 48px;
  height: 48px;
  background: #333;
  color: #ccc;
  font-size: 18px;
}
.stop-btn:hover:not(:disabled) { background: #555; }

.btn-icon { display: block; }

/* Settings */
.settings {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
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

/* Recordings */
.recordings-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid #333;
  margin-bottom: 4px;
}

.rec-count {
  background: #3c3c3c;
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 11px;
  color: #aaa;
}

.recordings-list {
  flex: 1;
  overflow-y: auto;
}

.recordings-list::-webkit-scrollbar { width: 6px; }
.recordings-list::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }

.empty-recordings {
  padding: 24px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.recording-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  margin-bottom: 2px;
}
.recording-item:hover { background: #2a2d2e; }
.recording-item.playing { background: #094771; }

.rec-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rec-name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-meta {
  font-size: 10px;
  color: #888;
}

.rec-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.rec-btn {
  background: none;
  border: 1px solid transparent;
  color: #aaa;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
}
.rec-btn:hover { background: #3c3c3c; border-color: #555; }
</style>
