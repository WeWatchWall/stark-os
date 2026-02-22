<template>
  <Teleport to="body">
    <transition name="panel-slide">
      <div v-if="visible" class="status-overlay" @click.self="$emit('close')">
        <div class="status-panel">
          <!-- Drag handle -->
          <div class="panel-handle" />

          <!-- Connection status -->
          <div class="status-row">
            <span class="status-label">Connection</span>
            <span class="status-badge" :class="connectionState">
              <span class="badge-dot" />
              {{ connectionLabel }}
            </span>
          </div>

          <!-- Current workspace -->
          <div class="status-row">
            <span class="status-label">Workspace</span>
            <div class="ws-chips">
              <button
                v-for="ws in shell.workspaces"
                :key="ws.id"
                class="ws-chip"
                :class="{ active: ws.id === shell.activeWorkspaceId }"
                @click="shell.switchWorkspace(ws.id)"
              >
                {{ ws.name }}
              </button>
              <button class="ws-chip add" @click="shell.addWorkspace()" aria-label="Add workspace">＋</button>
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

          <!-- Quick actions -->
          <div class="status-row actions-row">
            <button class="action-btn" @click="$emit('signout')">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h4" />
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
import { computed } from 'vue';
import { useShellStore } from '~/stores/shell';

const props = defineProps<{ visible: boolean; connectionState: string }>();
defineEmits<{ close: []; signout: [] }>();

const shell = useShellStore();

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

function setMode(mode: 'desktop' | 'mobile') {
  if (shell.layoutMode === mode) {
    shell.setManualLayoutMode(null); // back to auto
  } else {
    shell.setManualLayoutMode(mode);
  }
}
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

/* Workspace chips */
.ws-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.ws-chip {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  color: #94a3b8;
  font-size: 0.68rem;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.ws-chip:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.ws-chip.active {
  background: rgba(59,130,246,0.25);
  border-color: rgba(59,130,246,0.4);
  color: #fff;
}
.ws-chip.add { font-size: 0.8rem; padding: 3px 8px; }

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
