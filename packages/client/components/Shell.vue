<template>
  <div class="shell" @mousedown="onDesktopClick">
    <!-- Taskbar -->
    <Taskbar :connectionState="connectionState" @signout="$emit('signout')" />

    <!-- Desktop area -->
    <div class="desktop">
      <!-- Render ALL windows; hide those not on active workspace via v-show -->
      <WindowFrame
        v-for="win in shell.windows"
        :key="win.id"
        :win="win"
        v-show="win.workspaceId === shell.activeWorkspaceId"
      />

      <!-- Empty state -->
      <div v-if="shell.activeWindows.length === 0" class="empty-desktop">
        <img src="~/assets/Logo.png" alt="StarkOS" class="watermark" />
        <p class="hint">No windows open.<br />Pods with UI capability will appear here.</p>
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

/* Auto-detect layout mode on resize */
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
  shell.detectLayoutMode();
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
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

/* Empty state */
.empty-desktop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.25;
  pointer-events: none;
  user-select: none;
}
.watermark {
  width: 260px;
  height: auto;
  margin-bottom: 1.5rem;
}
.hint {
  color: #94a3b8;
  font-size: 0.9rem;
  text-align: center;
  line-height: 1.6;
}
</style>
