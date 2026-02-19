<template>
  <div class="shell" @mousedown="onDesktopClick">
    <!-- Taskbar -->
    <Taskbar :connectionState="connectionState" @signout="$emit('signout')" />

    <!-- Desktop area -->
    <div class="desktop" :class="{
      'taskbar-visible-top': shell.taskbarPosition === 'top',
      'taskbar-visible-left': shell.taskbarPosition === 'left',
    }">
      <!-- Render ALL windows; hide those not on active workspace via v-show -->
      <WindowFrame
        v-for="win in shell.windows"
        :key="win.id"
        :win="win"
        v-show="win.workspaceId === shell.activeWorkspaceId"
      />

      <!-- Start Menu surface (no window chrome) -->
      <div
        class="start-menu-panel"
        :class="{ visible: shell.startMenuVisible }"
        @mousedown.stop
      >
        <div :id="shell.startMenuContainerId" class="start-menu-surface" />
      </div>

      <!-- Desktop watermark (always visible behind windows) -->
      <div class="desktop-watermark">
        <img src="~/assets/Logo.png" alt="StarkOS" class="watermark" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useShellStore } from '~/stores/shell';

defineProps<{ connectionState: string }>();
defineEmits<{ signout: [] }>();

const shell = useShellStore();

/* Auto-detect layout mode on resize / orientation change */
function onResize() {
  shell.detectLayoutMode();
}

function onDesktopClick(e: MouseEvent) {
  // Hide start menu on any click outside of it
  if (shell.startMenuVisible) {
    shell.hideStartMenu();
  }
  // If click is on the desktop background (not on a window), clear focus
  if ((e.target as HTMLElement).classList.contains('desktop')) {
    shell.clearFocus();
  }
}

/** Hide start menu when signalled by the start-menu app (same-origin CustomEvent) */
function onStartMenuHide() {
  shell.hideStartMenu();
}

onMounted(() => {
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.addEventListener('stark:start-menu:hide', onStartMenuHide);
  shell.detectLayoutMode();
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('orientationchange', onResize);
  window.removeEventListener('stark:start-menu:hide', onStartMenuHide);
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
  inset: 0;
  overflow: hidden;
  transition: top 0.3s ease, left 0.3s ease;
}

/* Offset desktop area when taskbar is visible */
.desktop.taskbar-visible-top {
  top: 48px;
}
.desktop.taskbar-visible-left {
  left: 48px;
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

/* ── Start Menu panel (no window chrome) ── */
.start-menu-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 280px;
  height: 420px;
  max-height: calc(100% - 8px);
  z-index: 99998;
  display: none;
  overflow: hidden;
  border-radius: 0 0 8px 0;
  box-shadow: 4px 4px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(59, 130, 246, 0.15);
}
.start-menu-panel.visible {
  display: block;
}
.start-menu-surface {
  width: 100%;
  height: 100%;
}
.start-menu-surface :deep(iframe) {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>
