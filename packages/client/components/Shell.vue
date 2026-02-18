<template>
  <div class="shell" @mousedown="onDesktopClick" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
    <!-- Taskbar -->
    <Taskbar :connectionState="connectionState" @signout="$emit('signout')" />

    <!-- Swipe hint for revealing hidden mobile taskbar -->
    <div
      v-if="shell.layoutMode === 'mobile' && !shell.taskbarVisible"
      class="swipe-edge-hint"
      :class="shell.taskbarPosition === 'left' ? 'hint-left' : 'hint-top'"
    />

    <!-- Desktop area -->
    <div class="desktop" :class="{ 'desktop-mobile': shell.layoutMode === 'mobile' }">
      <!-- Render ALL windows; hide those not on active workspace via v-show -->
      <WindowFrame
        v-for="win in shell.windows"
        :key="win.id"
        :win="win"
        v-show="win.workspaceId === shell.activeWorkspaceId"
      />

      <!-- Desktop watermark (always visible behind windows) -->
      <div class="desktop-watermark">
        <img src="~/assets/Logo.png" alt="StarkOS" class="watermark" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useShellStore } from '~/stores/shell';

defineProps<{ connectionState: string }>();
defineEmits<{ signout: [] }>();

const shell = useShellStore();

const SWIPE_THRESHOLD = 30;
const EDGE_ZONE = 30;
const touchStartPos = ref<{ x: number; y: number } | null>(null);

/* Auto-detect layout mode on resize / orientation change */
function onResize() {
  shell.detectLayoutMode();
}

function onDesktopClick(e: MouseEvent) {
  // If click is on the desktop background (not on a window), clear focus
  if ((e.target as HTMLElement).classList.contains('desktop')) {
    shell.clearFocus();
    // On mobile, tapping the desktop hides the taskbar
    if (shell.layoutMode === 'mobile' && shell.taskbarVisible) {
      shell.hideTaskbar();
    }
  }
}

/* Swipe-from-edge to reveal hidden taskbar on mobile */
function onTouchStart(e: TouchEvent) {
  if (shell.layoutMode !== 'mobile' || shell.taskbarVisible) return;
  const touch = e.touches[0];
  const pos = shell.taskbarPosition;
  if (
    (pos === 'top' && touch.clientY <= EDGE_ZONE) ||
    (pos === 'left' && touch.clientX <= EDGE_ZONE)
  ) {
    touchStartPos.value = { x: touch.clientX, y: touch.clientY };
  }
}

function onTouchEnd(e: TouchEvent) {
  if (!touchStartPos.value) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartPos.value.x;
  const dy = touch.clientY - touchStartPos.value.y;
  const pos = shell.taskbarPosition;
  if (
    (pos === 'top' && dy > SWIPE_THRESHOLD) ||
    (pos === 'left' && dx > SWIPE_THRESHOLD)
  ) {
    shell.showTaskbar();
  }
  touchStartPos.value = null;
}

onMounted(() => {
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  shell.detectLayoutMode();
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('orientationchange', onResize);
});
</script>

<style scoped>
.shell {
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
  overflow: hidden;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.desktop {
  position: absolute;
  top: 48px; /* taskbar height */
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

/* Mobile: taskbar is an overlay, desktop uses full viewport */
.desktop.desktop-mobile {
  top: 0;
}

/* Desktop watermark (always visible, behind windows) */
.desktop-watermark {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.25;
  pointer-events: none;
  user-select: none;
  z-index: 0;
}
.watermark {
  width: 260px;
  height: auto;
}

/* Swipe edge hint strip */
.swipe-edge-hint {
  position: fixed;
  z-index: 99998;
  background: rgba(59, 130, 246, 0.12);
}
.swipe-edge-hint.hint-top {
  top: 0; left: 0; right: 0; height: 4px;
}
.swipe-edge-hint.hint-left {
  top: 0; left: 0; bottom: 0; width: 4px;
}
</style>
