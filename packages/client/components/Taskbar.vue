<template>
  <header
    class="taskbar"
    :class="{ bottom: isMobile }"
  >
    <!-- Logo / Start Menu -->
    <button class="logo-btn" @click="shell.toggleStartMenu()" title="Start Menu" aria-label="Start Menu">
      <img src="~/assets/Logo2Small.png" alt="StarkOS" class="taskbar-logo" />
    </button>

    <!-- Desktop: brand title + connection dot + window tabs -->
    <template v-if="!isMobile">
      <span class="taskbar-title">StarkOS</span>
      <span class="conn-dot" :class="connectionState" :title="connectionState" />

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

      <!-- Desktop right controls -->
      <div class="taskbar-right">
        <div class="ws-picker">
          <button
            v-for="ws in shell.workspaces"
            :key="ws.id"
            class="ws-btn"
            :class="{ active: ws.id === shell.activeWorkspaceId }"
            @click="shell.switchWorkspace(ws.id)"
            :title="ws.name"
          >
            {{ ws.name }}
          </button>
          <button class="ws-btn ws-add" @click="shell.addWorkspace()" title="Add workspace" aria-label="Add workspace">＋</button>
        </div>

        <button class="icon-btn" :title="`Mode: ${shell.layoutMode}`" @click="toggleLayout">
          {{ shell.layoutMode === 'desktop' ? '🖥' : '📱' }}
        </button>

        <button class="icon-btn sign-out" title="Sign Out" aria-label="Sign Out" @click="$emit('signout')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
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
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      </button>
    </template>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useShellStore } from '~/stores/shell';

defineProps<{ connectionState: string }>();
defineEmits<{ signout: []; 'toggle-status': [] }>();

const shell = useShellStore();

const isMobile = computed(() => shell.layoutMode === 'mobile');

const currentWindowTitle = computed(() => {
  if (!shell.focusedWindowId) return 'StarkOS';
  const win = shell.activeWindows.find(w => w.id === shell.focusedWindowId);
  return win?.title ?? 'StarkOS';
});

function toggleLayout() {
  if (shell.manualOverride) {
    shell.setManualLayoutMode(null);
  } else {
    shell.setManualLayoutMode(shell.layoutMode === 'desktop' ? 'mobile' : 'desktop');
  }
}
</script>

<style scoped>
/* ── Base taskbar (desktop: top) ── */
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

/* ── Mobile bottom taskbar ── */
.taskbar.bottom {
  top: auto;
  bottom: 0;
  height: 36px;
  padding: 0 8px;
  gap: 6px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.4);
  border-top: 1px solid rgba(255,255,255,0.06);
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
.taskbar.bottom .taskbar-logo {
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

.ws-picker {
  display: flex;
  gap: 3px;
}
.ws-btn {
  background: rgba(255,255,255,0.06);
  color: #94a3b8;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 0.7rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.ws-btn:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
.ws-btn.active { background: rgba(59,130,246,0.3); color: #fff; border-color: rgba(59,130,246,0.5); }
.ws-add { font-size: 0.85rem; padding: 3px 7px; }

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
}
.icon-btn:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
.icon-btn.sign-out:hover { background: rgba(220,38,38,0.25); color: #fca5a5; border-color: rgba(220,38,38,0.4); }

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
