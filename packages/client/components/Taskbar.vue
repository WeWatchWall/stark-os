<template>
  <header
    class="taskbar"
    :class="{
      bottom: shell.taskbarPosition === 'bottom',
    }"
  >
    <!-- Left: Logo / brand -->
    <div class="taskbar-left">
      <button class="logo-btn" @click="shell.toggleStartMenu()" title="Start Menu" aria-label="Start Menu">
        <img src="~/assets/Logo2Small.png" alt="StarkOS" class="taskbar-logo" />
      </button>
      <span v-if="shell.taskbarPosition === 'top'" class="taskbar-title">StarkOS</span>

      <!-- Connection indicator -->
      <span class="conn-dot" :class="connectionState" :title="connectionState" />
    </div>

    <!-- Center: window tabs -->
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

    <!-- Right: controls -->
    <div class="taskbar-right">
      <!-- Workspace picker (hidden on mobile bottom bar to save space) -->
      <div v-if="shell.taskbarPosition === 'top'" class="ws-picker">
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

      <!-- Layout mode toggle -->
      <button class="icon-btn" :title="`Mode: ${shell.layoutMode}`" @click="toggleLayout">
        {{ shell.layoutMode === 'desktop' ? '🖥' : '📱' }}
      </button>

      <!-- Sign out -->
      <button class="icon-btn sign-out" title="Sign Out" aria-label="Sign Out" @click="$emit('signout')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useShellStore } from '~/stores/shell';

defineProps<{ connectionState: string }>();
defineEmits<{ signout: [] }>();

const shell = useShellStore();

function toggleLayout() {
  if (shell.manualOverride) {
    shell.setManualLayoutMode(null); // back to auto
  } else {
    shell.setManualLayoutMode(shell.layoutMode === 'desktop' ? 'mobile' : 'desktop');
  }
}
</script>

<style scoped>
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
  transition: transform 0.3s ease;
}

/* ── Bottom taskbar (mobile) ── */
.taskbar.bottom {
  top: auto;
  bottom: 0;
  height: 36px;
  padding: 0 6px;
  gap: 4px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.4);
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* ── Left ── */
.taskbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.taskbar.bottom .taskbar-left {
  gap: 4px;
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
  height: 28px;
}
.logo-btn:hover .taskbar-logo {
  filter: blur(0.2px) drop-shadow(0 0 10px rgba(99, 179, 237, 0.75));
}
.logo-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  line-height: 0;
  border-radius: 6px;
  transition: background 0.15s;
}
.logo-btn:hover {
  background: rgba(255,255,255,0.08);
}
.taskbar-title {
  color: #cbd5e1;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* Connection dot */
.conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;
  flex-shrink: 0;
}
.conn-dot.connected { background: #3b82f6; }
.conn-dot.authenticated { background: #8b5cf6; }
.conn-dot.registered { background: #22c55e; }
.conn-dot.connecting { background: #f59e0b; animation: pulse .8s infinite; }
.conn-dot.disconnected { background: #ef4444; }

/* Center: tabs */
.taskbar-center {
  flex: 1;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 0 8px;
  min-width: 0;
}
.taskbar.bottom .taskbar-center {
  gap: 3px;
  padding: 0 4px;
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
.taskbar.bottom .tab-btn {
  padding: 2px 10px;
  font-size: 0.68rem;
  max-width: 110px;
  border-radius: 4px;
}
.tab-btn:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
.tab-btn.focused { background: rgba(59,130,246,0.25); color: #fff; border-color: rgba(59,130,246,0.4); }
.tab-btn.minimized { opacity: 0.5; }

/* Right */
.taskbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}
.taskbar.bottom .taskbar-right {
  gap: 3px;
}

/* Workspace picker */
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

/* Icon buttons */
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
.taskbar.bottom .icon-btn {
  padding: 2px 6px;
  font-size: 0.85rem;
  border-radius: 4px;
}
.icon-btn:hover { background: rgba(255,255,255,0.12); color: #e2e8f0; }
.icon-btn.sign-out:hover { background: rgba(220,38,38,0.25); color: #fca5a5; border-color: rgba(220,38,38,0.4); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
