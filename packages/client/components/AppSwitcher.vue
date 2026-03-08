<template>
  <Teleport to="body">
    <transition name="switcher-fade">
      <div v-if="shell.appSwitcherVisible" class="switcher-overlay" @click.self="shell.hideAppSwitcher()">
        <div class="switcher-container">
          <!-- Header -->
          <div class="switcher-header">
            <span class="switcher-title">Open Windows</span>
            <button class="switcher-close" @click="shell.hideAppSwitcher()" aria-label="Close switcher">✕</button>
          </div>

          <!-- Window cards -->
          <div class="card-grid" v-if="shell.activeWindows.length > 0">
            <div
              v-for="win in shell.activeWindows"
              :key="win.id"
              class="window-card"
              :class="{
                focused: win.id === shell.focusedWindowId,
                minimized: win.minimized,
              }"
              @click="selectWindow(win.id)"
              @touchstart.passive="onCardTouchStart($event, win.id)"
              @touchmove.passive="onCardTouchMove($event, win.id)"
              @touchend.passive="onCardTouchEnd($event, win.id)"
              :style="cardSwipeStyle(win.id)"
            >
              <div class="card-header">
                <span class="card-dot" :class="{ active: !win.minimized }" />
                <span class="card-title">{{ win.title }}</span>
                <button class="card-close-btn" @click.stop="shell.closeWindow(win.id)" aria-label="Close window">✕</button>
              </div>
              <div class="card-footer">
                <button
                  v-for="snap in snapOptions"
                  :key="snap.value"
                  class="snap-btn"
                  :class="{ active: win.mobileSnap === snap.value }"
                  @click.stop="setSnap(win.id, snap.value)"
                >
                  {{ snap.icon }}
                </button>
                <button
                  class="snap-btn minimize-btn"
                  :class="{ active: win.minimized }"
                  @click.stop="shell.minimizeWindow(win.id)"
                >
                  ─
                </button>
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else class="empty-state">
            <span class="empty-icon">🪟</span>
            <span class="empty-text">No open windows</span>
          </div>

          <!-- Workspace switcher at bottom -->
          <div class="workspace-bar">
            <div class="ws-grid">
              <button
                v-for="ws in shell.workspaces"
                :key="ws.id"
                class="ws-cell"
                :class="{ active: ws.id === shell.activeWorkspaceId }"
                @click="shell.switchWorkspace(ws.id)"
                :title="'Workspace ' + ws.name"
              />
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useShellStore, type MobileSnap } from '~/stores/shell';

const shell = useShellStore();

const snapOptions = computed(() => {
  if (shell.isPortrait) {
    return [
      { value: 'full' as const, icon: '⛶' },
      { value: 'half-first' as const, icon: '⬆' },
      { value: 'half-second' as const, icon: '⬇' },
    ];
  }
  return [
    { value: 'full' as const, icon: '⛶' },
    { value: 'half-first' as const, icon: '⬅' },
    { value: 'half-second' as const, icon: '➡' },
  ];
});

function selectWindow(id: string) {
  shell.focusWindow(id);
  shell.hideAppSwitcher();
}

function setSnap(id: string, snap: MobileSnap) {
  shell.setMobileSnap(id, snap);
}

/* ── Swipe-to-close on cards ── */
const swipeState = reactive<Record<string, { startX: number; offsetX: number; swiping: boolean }>>({});

function onCardTouchStart(e: TouchEvent, id: string) {
  swipeState[id] = { startX: e.touches[0].clientX, offsetX: 0, swiping: true };
}

function onCardTouchMove(e: TouchEvent, id: string) {
  const state = swipeState[id];
  if (!state?.swiping) return;
  state.offsetX = e.touches[0].clientX - state.startX;
}

function onCardTouchEnd(_e: TouchEvent, id: string) {
  const state = swipeState[id];
  if (!state) return;
  // If swiped far enough (>120px), close the window
  if (Math.abs(state.offsetX) > 120) {
    shell.closeWindow(id);
  }
  // Reset
  state.offsetX = 0;
  state.swiping = false;
}

function cardSwipeStyle(id: string) {
  const state = swipeState[id];
  if (!state || !state.swiping || state.offsetX === 0) return {};
  return {
    transform: `translateX(${state.offsetX}px)`,
    opacity: Math.max(0.3, 1 - Math.abs(state.offsetX) / 200),
    transition: 'none',
  };
}
</script>

<style scoped>
/* ── Overlay ── */
.switcher-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.switcher-container {
  width: 100%;
  max-width: 500px;
  max-height: 85vh;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255,255,255,0.08);
  border-bottom: none;
}

/* ── Header ── */
.switcher-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.switcher-title {
  color: #e2e8f0;
  font-size: 0.9rem;
  font-weight: 600;
}
.switcher-close {
  background: rgba(255,255,255,0.08);
  border: none;
  color: #94a3b8;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 0.8rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.switcher-close:hover { background: rgba(255,255,255,0.15); color: #e2e8f0; }

/* ── Card Grid ── */
.card-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.15) transparent;
}
.card-grid::-webkit-scrollbar {
  width: 6px;
}
.card-grid::-webkit-scrollbar-track {
  background: transparent;
}
.card-grid::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.15);
  border-radius: 3px;
}
.card-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.25);
}

/* ── Window Card ── */
.window-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.15s;
  touch-action: pan-y;
  flex-shrink: 0;
}
.window-card:active {
  transform: scale(0.98);
}
.window-card.focused {
  border-color: rgba(59,130,246,0.4);
  box-shadow: 0 0 0 1px rgba(59,130,246,0.2), 0 4px 16px rgba(59,130,246,0.1);
}
.window-card.minimized {
  opacity: 0.6;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
}
.card-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;
  flex-shrink: 0;
}
.card-dot.active {
  background: #22c55e;
}
.card-title {
  flex: 1;
  color: #e2e8f0;
  font-size: 0.8rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-close-btn {
  background: rgba(255,255,255,0.06);
  border: none;
  color: #94a3b8;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 0.65rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}
.card-close-btn:hover { background: rgba(220,38,38,0.3); color: #fca5a5; }

.card-footer {
  display: flex;
  gap: 4px;
  padding: 0 12px 10px;
}
.snap-btn {
  flex: 1;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 0.75rem;
  padding: 5px 0;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  text-align: center;
}
.snap-btn:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.snap-btn.active {
  background: rgba(59,130,246,0.2);
  border-color: rgba(59,130,246,0.4);
  color: #93c5fd;
}

/* ── Empty state ── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 8px;
}
.empty-icon {
  font-size: 2rem;
  opacity: 0.5;
}
.empty-text {
  color: #64748b;
  font-size: 0.85rem;
}

/* ── Workspace bar ── */
.workspace-bar {
  display: flex;
  justify-content: center;
  padding: 10px 16px 14px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.ws-grid {
  display: grid;
  grid-template-columns: repeat(2, 18px);
  grid-template-rows: repeat(2, 18px);
  gap: 3px;
}
.ws-cell {
  width: 18px;
  height: 18px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 3px;
  padding: 0;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.ws-cell:hover { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.3); }
.ws-cell.active { background: rgba(59,130,246,0.5); border-color: rgba(59,130,246,0.7); }

/* ── Transition ── */
.switcher-fade-enter-active,
.switcher-fade-leave-active {
  transition: opacity 0.2s ease;
}
.switcher-fade-enter-active .switcher-container,
.switcher-fade-leave-active .switcher-container {
  transition: transform 0.25s ease;
}
.switcher-fade-enter-from,
.switcher-fade-leave-to {
  opacity: 0;
}
.switcher-fade-enter-from .switcher-container {
  transform: translateY(100%);
}
.switcher-fade-leave-to .switcher-container {
  transform: translateY(100%);
}
</style>
