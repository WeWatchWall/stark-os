<template>
  <div
    class="window-frame"
    :class="{
      focused: isFocused,
      maximized: win.maximized,
      minimized: win.minimized,
      'mobile-full': isMobile && win.mobileSnap === 'full',
      'mobile-half-top': isMobile && win.mobileSnap === 'half-top',
      'mobile-half-bottom': isMobile && win.mobileSnap === 'half-bottom',
    }"
    :style="frameStyle"
    @mousedown="shell.focusWindow(win.id)"
  >
    <!-- Title bar (drag handle) -->
    <div
      class="title-bar"
      @mousedown.prevent="startDrag"
      @dblclick="shell.toggleMaximize(win.id)"
    >
      <span class="title-text">{{ win.title }}</span>
      <div class="title-controls">
        <!-- Mobile snap controls -->
        <template v-if="isMobile">
          <button class="ctrl-btn" title="Full screen" @mousedown.stop @click="shell.setMobileSnap(win.id, 'full')">⛶</button>
          <button class="ctrl-btn" title="Top half" @mousedown.stop @click="shell.setMobileSnap(win.id, 'half-top')">⬆</button>
          <button class="ctrl-btn" title="Bottom half" @mousedown.stop @click="shell.setMobileSnap(win.id, 'half-bottom')">⬇</button>
        </template>
        <!-- Desktop controls -->
        <template v-else>
          <button class="ctrl-btn" title="Minimize" @mousedown.stop @click="shell.minimizeWindow(win.id)">─</button>
          <button class="ctrl-btn" title="Maximize" @mousedown.stop @click="shell.toggleMaximize(win.id)">☐</button>
        </template>
        <button class="ctrl-btn close" title="Close" @mousedown.stop @click="shell.closeWindow(win.id)">✕</button>
      </div>
    </div>

    <!-- Surface mount: iframe container -->
    <div class="surface" :id="win.containerId">
      <!-- Pods attach iframes here via the containerId -->
    </div>

    <!-- Resize handles (desktop + not maximized only) -->
    <template v-if="!isMobile && !win.maximized">
      <div class="rh rh-n" @mousedown.prevent="startResize($event, 'n')" />
      <div class="rh rh-s" @mousedown.prevent="startResize($event, 's')" />
      <div class="rh rh-e" @mousedown.prevent="startResize($event, 'e')" />
      <div class="rh rh-w" @mousedown.prevent="startResize($event, 'w')" />
      <div class="rh rh-ne" @mousedown.prevent="startResize($event, 'ne')" />
      <div class="rh rh-nw" @mousedown.prevent="startResize($event, 'nw')" />
      <div class="rh rh-se" @mousedown.prevent="startResize($event, 'se')" />
      <div class="rh rh-sw" @mousedown.prevent="startResize($event, 'sw')" />
    </template>

    <!-- Interaction overlay while dragging/resizing (captures events over iframes) -->
    <div v-if="interacting" class="interaction-overlay" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useShellStore, type ShellWindow } from '~/stores/shell';

const props = defineProps<{ win: ShellWindow }>();
const shell = useShellStore();

const isFocused = computed(() => shell.focusedWindowId === props.win.id);
const isMobile = computed(() => shell.layoutMode === 'mobile');

const interacting = ref(false);

/* ── Computed style ── */
const frameStyle = computed(() => {
  const w = props.win;
  if (isMobile.value) {
    return { zIndex: w.zIndex };
  }
  if (w.maximized) {
    return {
      top: shell.TASKBAR_HEIGHT + 'px',
      left: '0px',
      width: '100vw',
      height: `calc(100vh - ${shell.TASKBAR_HEIGHT}px)`,
      zIndex: w.zIndex,
    };
  }
  return {
    top: w.y + 'px',
    left: w.x + 'px',
    width: w.width + 'px',
    height: w.height + 'px',
    zIndex: w.zIndex,
  };
});

/* ── Drag (move) ── */
function startDrag(e: MouseEvent) {
  if (isMobile.value || props.win.maximized) return;
  interacting.value = true;
  const startX = e.clientX - props.win.x;
  const startY = e.clientY - props.win.y;

  const onMove = (ev: MouseEvent) => {
    shell.moveWindow(
      props.win.id,
      Math.max(0, ev.clientX - startX),
      Math.max(shell.TASKBAR_HEIGHT, ev.clientY - startY),
    );
  };
  const onUp = () => {
    interacting.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

/* ── Resize ── */
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function startResize(e: MouseEvent, edge: Edge) {
  interacting.value = true;
  const startMX = e.clientX;
  const startMY = e.clientY;
  const startW = props.win.width;
  const startH = props.win.height;
  const startX = props.win.x;
  const startY = props.win.y;

  const onMove = (ev: MouseEvent) => {
    const dx = ev.clientX - startMX;
    const dy = ev.clientY - startMY;
    let nw = startW, nh = startH, nx = startX, ny = startY;

    if (edge.includes('e')) nw = startW + dx;
    if (edge.includes('w')) { nw = startW - dx; nx = startX + dx; }
    if (edge.includes('s')) nh = startH + dy;
    if (edge.includes('n')) { nh = startH - dy; ny = startY + dy; }

    nw = Math.max(300, nw);
    nh = Math.max(200, nh);
    // Clamp position to avoid out of screen
    if (edge.includes('w') && nw === 300) nx = startX + startW - 300;
    if (edge.includes('n') && nh === 200) ny = startY + startH - 200;

    shell.resizeWindow(props.win.id, nw, nh);
    shell.moveWindow(props.win.id, nx, ny);
  };
  const onUp = () => {
    interacting.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

<style scoped>
.window-frame {
  position: absolute;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255,255,255,0.08);
  background: #1a1a2e;
  transition: box-shadow 0.15s;
}
.window-frame.focused {
  box-shadow: 0 12px 48px rgba(59,130,246,0.25), 0 8px 32px rgba(0,0,0,0.5);
  border-color: rgba(59,130,246,0.3);
}
.window-frame.minimized {
  display: none;
}

/* ── Title bar ── */
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 8px 0 14px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  cursor: grab;
  flex-shrink: 0;
  user-select: none;
}
.title-bar:active { cursor: grabbing; }
.title-text {
  color: #cbd5e1;
  font-size: 0.78rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.title-controls {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.ctrl-btn {
  background: rgba(255,255,255,0.06);
  border: none;
  color: #94a3b8;
  width: 26px;
  height: 22px;
  border-radius: 4px;
  font-size: 0.7rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, color 0.12s;
}
.ctrl-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
.ctrl-btn.close:hover { background: rgba(220,38,38,0.35); color: #fca5a5; }

/* ── Surface (iframe host) ── */
.surface {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #111827;
}

/* ── Resize handles ── */
.rh { position: absolute; z-index: 10; }
.rh:hover, .rh:active { background: rgba(59,130,246,0.15); }
.rh-n  { top: -4px; left: 14px; right: 14px; height: 8px; cursor: n-resize; }
.rh-s  { bottom: -4px; left: 14px; right: 14px; height: 8px; cursor: s-resize; }
.rh-e  { right: -4px; top: 14px; bottom: 14px; width: 8px; cursor: e-resize; }
.rh-w  { left: -4px; top: 14px; bottom: 14px; width: 8px; cursor: w-resize; }
.rh-ne { top: -4px; right: -4px; width: 14px; height: 14px; cursor: ne-resize; }
.rh-nw { top: -4px; left: -4px; width: 14px; height: 14px; cursor: nw-resize; }
.rh-se { bottom: -4px; right: -4px; width: 14px; height: 14px; cursor: se-resize; }
.rh-sw { bottom: -4px; left: -4px; width: 14px; height: 14px; cursor: sw-resize; }

/* ── Interaction overlay (captures events over iframes during drag/resize) ── */
.interaction-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
}

/* ── Maximized ── */
.window-frame.maximized {
  border-radius: 0;
  border: none;
}

/* ── Mobile full-screen ── */
.window-frame.mobile-full {
  position: fixed !important;
  top: 48px !important;
  left: 0 !important;
  width: 100vw !important;
  height: calc(100vh - 48px) !important;
  border-radius: 0;
  border: none;
}
.window-frame.mobile-half-top {
  position: fixed !important;
  top: 48px !important;
  left: 0 !important;
  width: 100vw !important;
  height: calc(50vh - 24px) !important;
  border-radius: 0;
  border: none;
}
.window-frame.mobile-half-bottom {
  position: fixed !important;
  top: calc(50vh + 24px) !important;
  left: 0 !important;
  width: 100vw !important;
  height: calc(50vh - 24px) !important;
  border-radius: 0;
  border: none;
}
</style>
