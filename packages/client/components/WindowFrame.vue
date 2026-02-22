<template>
  <div
    class="window-frame"
    :class="{
      focused: isFocused,
      maximized: win.maximized,
      minimized: win.minimized,
      'mobile-full': isMobile && win.mobileSnap === 'full',
      'mobile-half-first': isMobile && win.mobileSnap === 'half-first',
      'mobile-half-second': isMobile && win.mobileSnap === 'half-second',
      'portrait': shell.isPortrait,
      'landscape': !shell.isPortrait,
      'mobile': isMobile,
    }"
    :style="frameStyle"
    @mousedown="shell.focusWindow(win.id)"
    @touchstart.passive="onFrameTouchStart"
    @touchmove.passive="onFrameTouchMove"
    @touchend.passive="onFrameTouchEnd"
  >
    <!-- Title bar (drag handle) -->
    <div
      class="title-bar"
      :class="{ 'title-bar-mobile': isMobile }"
      @mousedown.prevent="startDrag"
      @dblclick="toggleMax"
    >
      <span class="title-text">{{ win.title }}</span>
      <div class="title-controls">
        <!-- Mobile controls: compact overflow menu + close -->
        <template v-if="isMobile">
          <button class="ctrl-btn" title="Window menu" aria-label="Window menu" @mousedown.stop @click.stop="toggleMobileMenu">⋮</button>
          <button class="ctrl-btn close" title="Close" aria-label="Close window" @mousedown.stop @click="shell.closeWindow(win.id)">✕</button>
        </template>
        <!-- Desktop controls -->
        <template v-else>
          <button class="ctrl-btn" title="Minimize" aria-label="Minimize" @mousedown.stop @click="shell.minimizeWindow(win.id)">─</button>
          <button class="ctrl-btn" title="Maximize" aria-label="Maximize" @mousedown.stop @click="toggleMax">☐</button>
          <button class="ctrl-btn close" title="Close" aria-label="Close window" @mousedown.stop @click="shell.closeWindow(win.id)">✕</button>
        </template>
      </div>
    </div>

    <!-- Mobile overflow menu dropdown -->
    <div v-if="isMobile && mobileMenuOpen" class="mobile-menu" @mousedown.stop>
      <button class="mobile-menu-item" @click="doMobileAction('full')">
        <span class="menu-icon">⛶</span> Full Screen
      </button>
      <button class="mobile-menu-item" @click="doMobileAction('half-first')">
        <span class="menu-icon">{{ firstHalfIcon }}</span> {{ firstHalfLabel }}
      </button>
      <button class="mobile-menu-item" @click="doMobileAction('half-second')">
        <span class="menu-icon">{{ secondHalfIcon }}</span> {{ secondHalfLabel }}
      </button>
      <button class="mobile-menu-item" @click="doMobileAction('minimize')">
        <span class="menu-icon">─</span> Minimize
      </button>
    </div>

    <!-- Surface mount: iframe container -->
    <div class="surface" :id="win.containerId">
      <!-- Pods attach iframes here via the containerId -->
    </div>

    <!-- Focus overlay: captures mousedown over iframes on unfocused windows -->
    <div v-if="!isFocused" class="focus-overlay" @mousedown="shell.focusWindow(win.id)" />

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
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useShellStore, type ShellWindow } from '~/stores/shell';

const props = defineProps<{ win: ShellWindow }>();
const shell = useShellStore();

const isFocused = computed(() => shell.focusedWindowId === props.win.id);
const isMobile = computed(() => shell.layoutMode === 'mobile');

/* Orientation-aware labels for half-screen buttons */
const firstHalfLabel = computed(() => shell.isPortrait ? 'Top half' : 'Left half');
const secondHalfLabel = computed(() => shell.isPortrait ? 'Bottom half' : 'Right half');
const firstHalfIcon = computed(() => shell.isPortrait ? '⬆' : '⬅');
const secondHalfIcon = computed(() => shell.isPortrait ? '⬇' : '➡');

const interacting = ref(false);

/* ── Mobile overflow menu ── */
const mobileMenuOpen = ref(false);

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value;
}

function doMobileAction(action: string) {
  mobileMenuOpen.value = false;
  if (action === 'minimize') {
    shell.minimizeWindow(props.win.id);
  } else {
    shell.setMobileSnap(props.win.id, action as 'full' | 'half-first' | 'half-second');
  }
}

/* Close mobile menu on any outside click */
function onOutsideClick() {
  if (mobileMenuOpen.value) mobileMenuOpen.value = false;
}
onMounted(() => document.addEventListener('mousedown', onOutsideClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onOutsideClick));

/* ── Touch swipe: swipe down on title bar → minimize ── */
let touchStartY = 0;
let touchStartX = 0;
let touchOnTitleBar = false;

function onFrameTouchStart(e: TouchEvent) {
  const target = e.target as HTMLElement;
  touchOnTitleBar = !!target.closest('.title-bar');
  if (touchOnTitleBar) {
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }
}

function onFrameTouchMove(_e: TouchEvent) {
  /* passive — no preventDefault needed */
}

function onFrameTouchEnd(e: TouchEvent) {
  if (!touchOnTitleBar || !isMobile.value) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
  // Swipe down (dy > 40px) and mostly vertical → minimize
  if (dy > 40 && dx < 60) {
    shell.minimizeWindow(props.win.id);
  }
  touchOnTitleBar = false;
}

/**
 * Force the iframe inside the surface container to re-layout after a size change.
 * Dispatches a resize event into the iframe so that content (e.g. xterm FitAddon)
 * can recalculate its dimensions without the destructive height-reset trick that
 * caused sizing loops and prompt corruption.
 */
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
function nudgeIframe() {
  // Debounce: collapse rapid calls (e.g. maximize watcher + explicit call) into one
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    const surface = document.getElementById(props.win.containerId);
    if (!surface) return;
    const iframe = surface.querySelector('iframe') as HTMLIFrameElement | null;
    if (!iframe) return;
    // Reset any pixel height set by the bundle auto-resize shim so the
    // iframe stretches to fill the surface via CSS height:100%.
    iframe.style.height = '100%';
    try { iframe.contentWindow?.dispatchEvent(new Event('resize')); } catch (_) { /* cross-origin */ }
  }, 50);
}

function toggleMax() {
  shell.toggleMaximize(props.win.id);
  // Watcher on props.win.maximized handles the nudge — no explicit call needed
}

/* Nudge iframe whenever mobile snap, maximized state, or orientation changes */
watch(() => props.win.mobileSnap, () => setTimeout(nudgeIframe, 0));
watch(() => props.win.maximized, () => setTimeout(nudgeIframe, 0));
watch(() => shell.isPortrait, () => setTimeout(nudgeIframe, 0));

/* ResizeObserver: nudge iframe whenever the surface container changes size
 * (e.g. outer browser window resize, layout shift) */
let surfaceObserver: ResizeObserver | null = null;

onMounted(() => {
  const surface = document.getElementById(props.win.containerId);
  if (surface) {
    surfaceObserver = new ResizeObserver(() => {
      nudgeIframe();
    });
    surfaceObserver.observe(surface);
  }
});

onBeforeUnmount(() => {
  if (nudgeTimer) clearTimeout(nudgeTimer);
  if (surfaceObserver) {
    surfaceObserver.disconnect();
    surfaceObserver = null;
  }
});

/* ── Computed style ── */
const frameStyle = computed(() => {
  const w = props.win;
  if (isMobile.value) {
    return { zIndex: w.zIndex };
  }
  if (w.maximized) {
    return {
      top: '0px',
      left: '0px',
      width: '100%',
      height: '100%',
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
      Math.max(0, ev.clientY - startY),
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
    nudgeIframe();
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

/* Compact mobile title bar */
.title-bar-mobile {
  height: 26px;
  padding: 0 6px 0 10px;
}

.title-text {
  color: #cbd5e1;
  font-size: 0.78rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.title-bar-mobile .title-text {
  font-size: 0.7rem;
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
.title-bar-mobile .ctrl-btn {
  width: 24px;
  height: 20px;
  font-size: 0.65rem;
}
.ctrl-btn:hover { background: rgba(255,255,255,0.14); color: #e2e8f0; }
.ctrl-btn.close:hover { background: rgba(220,38,38,0.35); color: #fca5a5; }

/* ── Mobile overflow menu ── */
.mobile-menu {
  position: absolute;
  top: 26px;
  right: 4px;
  z-index: 60;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  padding: 4px 0;
  min-width: 140px;
}
.mobile-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  color: #cbd5e1;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.12s;
  text-align: left;
}
.mobile-menu-item:hover,
.mobile-menu-item:active {
  background: rgba(59,130,246,0.2);
}
.menu-icon {
  font-size: 0.8rem;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

/* ── Surface (iframe host) ── */
.surface {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #111827;
}
.surface :deep(iframe) {
  width: 100%;
  height: 100% !important;
  border: none;
  display: block;
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

/* ── Focus overlay (captures mousedown over iframes on unfocused windows) ── */
.focus-overlay {
  position: absolute;
  top: 34px; /* below title bar */
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
}
.mobile .focus-overlay {
  top: 26px; /* below compact mobile title bar */
}

/* ── Maximized ── */
.window-frame.maximized {
  border-radius: 0;
  border: none;
}

/* ── Mobile full-screen (fills .desktop container which accounts for taskbar) ── */
.window-frame.mobile-full {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 0;
  border: none;
}

/* Portrait: split top / bottom */
.window-frame.mobile-half-first.portrait {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 50% !important;
  border-radius: 0;
  border: none;
}
.window-frame.mobile-half-second.portrait {
  position: absolute !important;
  top: 50% !important;
  left: 0 !important;
  width: 100% !important;
  height: 50% !important;
  border-radius: 0;
  border: none;
}

/* Landscape: split left / right */
.window-frame.mobile-half-first.landscape {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  width: 50% !important;
  height: 100% !important;
  border-radius: 0;
  border: none;
}
.window-frame.mobile-half-second.landscape {
  position: absolute !important;
  top: 0 !important;
  left: 50% !important;
  width: 50% !important;
  height: 100% !important;
  border-radius: 0;
  border: none;
}
</style>
