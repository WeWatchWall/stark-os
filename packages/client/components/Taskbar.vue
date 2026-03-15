<template>
  <header
    class="taskbar"
    :class="[shell.taskbarPosition, { mobile: isMobile }]"
  >
    <!-- Logo / Start Menu -->
    <button class="logo-btn" @click="shell.toggleStartMenu()" title="Start Menu" aria-label="Start Menu">
      <img src="~/assets/Logo2Small.png" alt="StarkOS" class="taskbar-logo" />
    </button>

    <!-- Desktop: brand title + connection dot + window tabs -->
    <template v-if="!isMobile">
      <div class="node-name-group" @click="openRenameDropdown">
        <span class="taskbar-title">{{ nodeName }}</span>
        <span class="conn-dot" :class="connectionState" :title="connectionState" />
      </div>

      <!-- Rename dropdown -->
      <div v-if="renameOpen" class="rename-dropdown" @click.stop>
        <input
          ref="renameInputRef"
          v-model="renameValue"
          class="rename-input"
          placeholder="Node name"
          @keydown.enter="submitRename"
          @keydown.escape="renameOpen = false"
        />
        <button class="rename-ok-btn" @click="submitRename">OK</button>
      </div>
      <div v-if="renameOpen" class="rename-backdrop" @click="renameOpen = false" />

      <div class="taskbar-center">
        <button
          v-for="win in shell.activeWindows"
          :key="win.id"
          class="tab-btn"
          :class="{ focused: win.id === shell.focusedWindowId, minimized: win.minimized }"
          @click="shell.focusWindow(win.id)"
        >
          {{ win.title }}
        </button>
      </div>

      <!-- Desktop right controls: clock → settings → minimize-all (corner) -->
      <div class="taskbar-right">
        <!-- Stylish clock -->
        <div class="clock-box">
          <span class="clock-time">{{ clockTime }}</span>
          <span class="clock-date">{{ clockDate }}</span>
        </div>

        <button class="icon-btn" @click="$emit('toggle-status')" title="Settings" aria-label="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        <button class="minimize-all-btn" title="Minimize All" aria-label="Minimize All" @click="shell.minimizeAll()">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="18" x2="19" y2="18" />
          </svg>
        </button>
      </div>
    </template>

    <!-- Mobile: connection dot + current window title + switcher badge + status toggle -->
    <template v-else>
      <span class="conn-dot conn-dot-mobile" :class="connectionState" @click="$emit('toggle-status')" />

      <!-- Current focused window title (tap to open app switcher) -->
      <button class="mobile-current-window" @click="shell.toggleAppSwitcher()">
        <span class="current-title">{{ currentWindowTitle }}</span>
        <span v-if="shell.activeWindows.length > 1" class="window-count">{{ shell.activeWindows.length }}</span>
      </button>

      <!-- App switcher button -->
      <button
        class="switcher-btn"
        @click="shell.toggleAppSwitcher()"
        title="App Switcher"
        aria-label="App Switcher"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>

      <!-- Mobile mode/settings toggle (opens status panel) -->
      <button class="icon-btn-mobile" @click="$emit('toggle-status')" title="Settings" aria-label="Settings">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      <!-- Minimize all (half-width in corner, half-height on landscape) -->
      <button class="minimize-all-btn" title="Minimize All" aria-label="Minimize All" @click="shell.minimizeAll()">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="18" x2="19" y2="18" />
        </svg>
      </button>
    </template>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { useShellStore } from '~/stores/shell';

const props = defineProps<{ connectionState: string; nodeName: string }>();
const emit = defineEmits<{ 'toggle-status': []; 'rename-node': [name: string] }>();

const shell = useShellStore();

const isMobile = computed(() => shell.layoutMode === 'mobile');

const currentWindowTitle = computed(() => {
  if (!shell.focusedWindowId) return props.nodeName;
  const win = shell.activeWindows.find(w => w.id === shell.focusedWindowId);
  return win?.title ?? props.nodeName;
});

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

onMounted(() => {
  clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});

/* ── Rename dropdown state ── */
const renameOpen = ref(false);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

function openRenameDropdown() {
  renameValue.value = props.nodeName;
  renameOpen.value = true;
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
}

function submitRename() {
  const trimmed = renameValue.value.trim();
  if (trimmed && trimmed !== props.nodeName) {
    emit('rename-node', trimmed);
  }
  renameOpen.value = false;
}
</script>

<style scoped>
/* ── Base taskbar (desktop: horizontal top, 48px) ── */
.taskbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  display: flex;
  align-items: center;
  padding: 0 12px;
  z-index: 99999;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  gap: 8px;
  user-select: none;
}

/* ── Bottom position (desktop: stays 48px) ── */
.taskbar.bottom {
  top: auto;
  bottom: 0;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.4);
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* ── Mobile size override (36px for horizontal) ── */
.taskbar.mobile {
  height: 36px;
  padding: 0 8px;
  gap: 6px;
}

/* ── Left position (mobile landscape) ── */
.taskbar.left {
  top: 0;
  left: 0;
  right: auto;
  bottom: 0;
  width: 36px;
  height: auto;
  flex-direction: column;
  padding: 8px 0;
  gap: 6px;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.4);
  border-right: 1px solid rgba(255,255,255,0.06);
}

/* ── Right position (mobile landscape flipped) ── */
.taskbar.right {
  top: 0;
  left: auto;
  right: 0;
  bottom: 0;
  width: 36px;
  height: auto;
  flex-direction: column;
  padding: 8px 0;
  gap: 6px;
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.4);
  border-left: 1px solid rgba(255,255,255,0.06);
}

/* ── Logo ── */
.logo-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  line-height: 0;
  border-radius: 6px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.logo-btn:hover {
  background: rgba(255,255,255,0.08);
}
.taskbar-logo {
  height: 48px;
  width: auto;
  object-fit: contain;
  image-rendering: auto;
  filter: blur(0.4px) drop-shadow(0 0 6px rgba(99, 179, 237, 0.45));
  transition: filter 0.2s ease;
}
.taskbar.mobile .taskbar-logo {
  height: 26px;
}
.taskbar.left .taskbar-logo,
.taskbar.right .taskbar-logo {
  height: 26px;
}
.logo-btn:hover .taskbar-logo {
  filter: blur(0.2px) drop-shadow(0 0 10px rgba(99, 179, 237, 0.75));
}

.taskbar-title {
  color: #cbd5e1;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

/* ── Node name group (clickable for rename) ── */
.node-name-group {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s;
  flex-shrink: 0;
}
.node-name-group:hover {
  background: rgba(255,255,255,0.08);
}

/* ── Rename dropdown ── */
.rename-dropdown {
  position: fixed;
  top: 48px;
  left: 60px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 6px 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  z-index: 100002;
}
.rename-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  color: #e2e8f0;
  font-size: 0.78rem;
  padding: 5px 8px;
  width: 180px;
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
.rename-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100001;
}

/* ── Connection dot ── */
.conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;
  flex-shrink: 0;
}
.conn-dot-mobile {
  cursor: pointer;
  width: 7px;
  height: 7px;
}
.conn-dot.connected { background: #3b82f6; }
.conn-dot.authenticated { background: #8b5cf6; }
.conn-dot.registered { background: #22c55e; }
.conn-dot.connecting { background: #f59e0b; animation: pulse .8s infinite; }
.conn-dot.disconnected { background: #ef4444; }

/* ── Desktop: center tabs ── */
.taskbar-center {
  flex: 1;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 0 8px;
  min-width: 0;
}
.tab-btn {
  background: rgba(255,255,255,0.06);
  color: #94a3b8;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 4px 14px;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-btn:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
.tab-btn.focused { background: rgba(59,130,246,0.25); color: #fff; border-color: rgba(59,130,246,0.4); }
.tab-btn.minimized { opacity: 0.5; }

/* ── Desktop: right controls ── */
.taskbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

/* ── Desktop: clock box ── */
.clock-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 2px 10px;
  border-radius: 6px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  line-height: 1.2;
  flex-shrink: 0;
}
.clock-time {
  color: #e2e8f0;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  font-variant-numeric: tabular-nums;
}
.clock-date {
  color: #64748b;
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.icon-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 1rem;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }

/* ── Minimize-all button (in the corner) ── */
.minimize-all-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
  width: 16px;
  height: 32px;
  padding: 0;
}
.minimize-all-btn:hover,
.minimize-all-btn:active {
  background: rgba(255,255,255,0.12);
  color: #e2e8f0;
}
/* Mobile horizontal: half-width */
.taskbar.mobile .minimize-all-btn {
  width: 14px;
  height: 22px;
}
/* Mobile vertical (left/right): half-height */
.taskbar.left .minimize-all-btn,
.taskbar.right .minimize-all-btn {
  width: 26px;
  height: 14px;
}

/* ── Mobile: current window button ── */
.mobile-current-window {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.15s;
}
.mobile-current-window:hover,
.mobile-current-window:active {
  background: rgba(255,255,255,0.1);
}
.current-title {
  color: #e2e8f0;
  font-size: 0.72rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  text-align: left;
}
.window-count {
  background: rgba(59,130,246,0.3);
  color: #93c5fd;
  font-size: 0.6rem;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  flex-shrink: 0;
}

/* ── Left/right taskbar: vertical text for landscape ── */
.taskbar.left .mobile-current-window,
.taskbar.right .mobile-current-window {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 10px 3px;
  min-width: unset;
  min-height: 0;
}
.taskbar.left .current-title,
.taskbar.right .current-title {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.taskbar.left .window-count,
.taskbar.right .window-count {
  min-width: 16px;
  min-height: 16px;
}
.taskbar.left .switcher-btn,
.taskbar.left .icon-btn-mobile,
.taskbar.right .switcher-btn,
.taskbar.right .icon-btn-mobile {
  width: 26px;
  height: 26px;
}

/* ── Mobile: switcher button ── */
.switcher-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: #94a3b8;
  width: 30px;
  height: 26px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.switcher-btn:hover,
.switcher-btn:active {
  background: rgba(59,130,246,0.2);
  color: #93c5fd;
  border-color: rgba(59,130,246,0.3);
}

/* ── Mobile: settings button ── */
.icon-btn-mobile {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: #94a3b8;
  width: 30px;
  height: 26px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.icon-btn-mobile:hover,
.icon-btn-mobile:active {
  background: rgba(255,255,255,0.12);
  color: #e2e8f0;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
