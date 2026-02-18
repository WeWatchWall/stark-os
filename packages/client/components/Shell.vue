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
  // If click is on the desktop background (not on a window), clear focus
  if ((e.target as HTMLElement).classList.contains('desktop')) {
    shell.clearFocus();
  }
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
</style>
