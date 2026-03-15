<template>
  <Teleport to="body">
    <transition name="panel-slide">
      <div v-if="visible" class="status-overlay" @click.self="$emit('close')">
        <div class="status-panel">
          <!-- Drag handle -->
          <div class="panel-handle" />

          <!-- Time & Date (shown on mobile) -->
          <div v-if="isMobile" class="status-row clock-row">
            <div class="panel-clock">
              <span class="panel-clock-time">{{ clockTime }}</span>
              <span class="panel-clock-date">{{ clockDate }}</span>
            </div>
          </div>

          <!-- Connection status -->
          <div class="status-row">
            <span class="status-label">Connection</span>
            <span class="status-badge" :class="connectionState">
              <span class="badge-dot" />
              {{ connectionLabel }}
            </span>
          </div>

          <!-- Node name (with rename) -->
          <div class="status-row">
            <span class="status-label">Node Name</span>
            <div class="rename-group">
              <input
                v-model="renameValue"
                class="rename-input"
                placeholder="Node name"
                @keydown.enter="submitRename"
              />
              <button class="rename-ok-btn" @click="submitRename">OK</button>
            </div>
          </div>

          <!-- Layout mode -->
          <div class="status-row">
            <span class="status-label">Layout</span>
            <div class="toggle-group">
              <button
                class="toggle-btn"
                :class="{ active: shell.layoutMode === 'desktop' }"
                @click="setMode('desktop')"
              >
                🖥 Desktop
              </button>
              <button
                class="toggle-btn"
                :class="{ active: shell.layoutMode === 'mobile' }"
                @click="setMode('mobile')"
              >
                📱 Mobile
              </button>
            </div>
          </div>

          <!-- Taskbar side (opposite toggle) -->
          <div class="status-row">
            <span class="status-label">Taskbar Side</span>
            <button
              class="toggle-btn"
              :class="{ active: shell.taskbarFlipped }"
              @click="shell.toggleTaskbarSide()"
            >
              {{ shell.taskbarFlipped ? '↩ Default' : '↔ Opposite' }}
            </button>
          </div>

          <!-- Full screen toggle -->
          <div class="status-row">
            <span class="status-label">Full Screen</span>
            <button class="toggle-btn" :class="{ active: isFullscreen }" @click="toggleFullscreen">
              {{ isFullscreen ? '⛶ Exit' : '⛶ Enter' }}
            </button>
          </div>

          <!-- Quick actions -->
          <div class="status-row actions-row">
            <button class="action-btn" @click="$emit('signout')">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useShellStore } from '~/stores/shell';

const props = defineProps<{ visible: boolean; connectionState: string; nodeName: string }>();
const emit = defineEmits<{ close: []; signout: []; 'rename-node': [name: string] }>();

const shell = useShellStore();
const renameValue = ref(props.nodeName);
const isFullscreen = ref(false);

const isMobile = computed(() => shell.layoutMode === 'mobile');

/* ── Clock ── */
const now = ref(new Date());
let clockTimer: ReturnType<typeof setInterval> | null = null;

const clockTime = computed(() => {
  const h = now.value.getHours();
  const m = now.value.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
});

const clockDate = computed(() => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[now.value.getDay()]}, ${months[now.value.getMonth()]} ${now.value.getDate()}`;
});

// Keep rename input in sync when panel opens or nodeName changes
watch(() => props.nodeName, (n) => { renameValue.value = n; });
watch(() => props.visible, (v) => { if (v) renameValue.value = props.nodeName; });

const connectionLabel = computed(() => {
  const labels: Record<string, string> = {
    connected: 'Connected',
    authenticated: 'Authenticated',
    registered: 'Registered',
    connecting: 'Connecting…',
    disconnected: 'Disconnected',
  };
  return labels[props.connectionState] ?? 'Unknown';
});

function submitRename() {
  const trimmed = renameValue.value.trim();
  if (trimmed && trimmed !== props.nodeName) {
    emit('rename-node', trimmed);
  }
}

function setMode(mode: 'desktop' | 'mobile') {
  if (shell.layoutMode === mode) {
    shell.setManualLayoutMode(null); // back to auto
  } else {
    shell.setManualLayoutMode(mode);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { /* ignore */ });
  } else {
    document.exitFullscreen().catch(() => { /* ignore */ });
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  isFullscreen.value = !!document.fullscreenElement;
  clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
});

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<style scoped>
.status-overlay {
  position: fixed;
  inset: 0;
  z-index: 100001;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.status-panel {
  width: 100%;
  max-width: 500px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-radius: 16px 16px 0 0;
  padding: 8px 16px 16px;
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255,255,255,0.08);
  border-bottom: none;
}

.panel-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.2);
  margin: 0 auto 12px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.status-row:last-child {
  border-bottom: none;
}
.status-label {
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 500;
}

/* ── Panel clock (mobile) ── */
.clock-row {
  justify-content: center;
  padding: 8px 0 12px;
}
.panel-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 20px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
}
.panel-clock-time {
  color: #e2e8f0;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.panel-clock-date {
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  margin-top: 2px;
}

/* Connection badge */
.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 4px 12px;
  font-size: 0.72rem;
  color: #cbd5e1;
}
.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6b7280;
}
.status-badge.connected .badge-dot { background: #3b82f6; }
.status-badge.authenticated .badge-dot { background: #8b5cf6; }
.status-badge.registered .badge-dot { background: #22c55e; }
.status-badge.connecting .badge-dot { background: #f59e0b; animation: pulse .8s infinite; }
.status-badge.disconnected .badge-dot { background: #ef4444; }

/* Rename group */
.rename-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rename-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 0.75rem;
  padding: 5px 8px;
  width: 150px;
  outline: none;
  transition: border-color 0.15s;
}
.rename-input:focus {
  border-color: rgba(59,130,246,0.5);
}
.rename-ok-btn {
  background: rgba(59,130,246,0.25);
  border: 1px solid rgba(59,130,246,0.4);
  border-radius: 4px;
  color: #93c5fd;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.rename-ok-btn:hover {
  background: rgba(59,130,246,0.4);
}

/* Toggle group */
.toggle-group {
  display: flex;
  gap: 2px;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  padding: 2px;
}
.toggle-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.72rem;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.toggle-btn:hover { color: #e2e8f0; }
.toggle-btn.active {
  background: rgba(59,130,246,0.25);
  color: #fff;
}

/* Action buttons */
.actions-row {
  justify-content: flex-end;
  padding-top: 12px;
}
.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(220,38,38,0.15);
  border: 1px solid rgba(220,38,38,0.25);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 0.75rem;
  padding: 6px 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.action-btn:hover {
  background: rgba(220,38,38,0.25);
  border-color: rgba(220,38,38,0.4);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── Transition: slide up from bottom ── */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: opacity 0.2s ease;
}
.panel-slide-enter-active .status-panel,
.panel-slide-leave-active .status-panel {
  transition: transform 0.25s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
}
.panel-slide-enter-from .status-panel {
  transform: translateY(100%);
}
.panel-slide-leave-to .status-panel {
  transform: translateY(100%);
}
</style>
