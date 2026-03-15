<template>
  <div class="shell" @mousedown="onDesktopClick">
    <!-- Taskbar -->
    <Taskbar
      :connectionState="connectionState"
      :nodeName="nodeName"
      @toggle-status="statusPanelOpen = !statusPanelOpen"
      @rename-node="(name: string) => $emit('rename-node', name)"
    />

    <!-- Desktop area -->
    <div class="desktop" :class="{
      'taskbar-visible-top': shell.taskbarPosition === 'top',
      'taskbar-visible-bottom': shell.taskbarPosition === 'bottom',
      'taskbar-visible-left': shell.taskbarPosition === 'left',
      'taskbar-visible-right': shell.taskbarPosition === 'right',
    }">
      <!-- Render ALL windows; hide those not on active workspace via v-show -->
      <WindowFrame
        v-for="win in shell.windows"
        :key="win.id"
        :win="win"
        v-show="win.workspaceId === shell.activeWorkspaceId"
      />

      <!-- Dismiss overlay: catches clicks outside the start menu (including over iframes) -->
      <div
        v-if="shell.startMenuVisible"
        class="start-menu-dismiss-overlay"
        @mousedown="shell.hideStartMenu()"
        @touchstart.passive="shell.hideStartMenu()"
      />

      <!-- Start Menu surface (no window chrome) -->
      <div
        class="start-menu-panel"
        :class="{
          visible: shell.startMenuVisible,
          'mobile-start': shell.layoutMode === 'mobile',
        }"
        @mousedown.stop
        @touchstart.stop
      >
        <div :id="shell.startMenuContainerId" class="start-menu-surface" />
      </div>

      <!-- Desktop grid surface (full-size background, behind windows) -->
      <div class="desktop-grid-surface">
        <div :id="shell.desktopContainerId" class="desktop-grid-inner" />
        <!-- Focus overlay: prevents desktop iframe from capturing mouse when a window is focused -->
        <div
          v-if="shell.focusedWindowId !== null"
          class="desktop-focus-overlay"
          @mousedown="onDesktopOverlayClick"
        />
      </div>

      <!-- Desktop watermark (always visible, behind windows) -->
      <div class="desktop-watermark">
        <img src="~/assets/Logo.png" alt="StarkOS" class="watermark" />
      </div>
    </div>

    <!-- App Switcher overlay (mobile) -->
    <AppSwitcher />

    <!-- Status Panel (pull-down settings, mobile) -->
    <StatusPanel
      :visible="statusPanelOpen"
      :connectionState="connectionState"
      :nodeName="nodeName"
      @close="statusPanelOpen = false"
      @signout="statusPanelOpen = false; $emit('signout')"
      @rename-node="(name: string) => $emit('rename-node', name)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useShellStore } from '~/stores/shell';

defineProps<{ connectionState: string; nodeName: string }>();
defineEmits<{ signout: []; 'rename-node': [name: string] }>();

const shell = useShellStore();
const statusPanelOpen = ref(false);

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

function onDesktopOverlayClick() {
  shell.clearFocus();
  shell.hideStartMenu();
  // Transfer keyboard focus to the desktop iframe so shortcuts work
  nextTick(() => {
    const container = document.getElementById(shell.desktopContainerId);
    if (!container) return;
    const iframe = container.querySelector('iframe') as HTMLIFrameElement | null;
    if (iframe) {
      try { iframe.contentWindow?.focus(); } catch (_) { /* cross-origin */ }
    }
  });
}

/** Hide start menu when signalled by the start-menu app (same-origin CustomEvent) */
function onStartMenuHide() {
  shell.hideStartMenu();
}

/**
 * Tell the start-menu to refresh its pack list whenever the panel opens.
 * Uses the standardised sendMessage API (via shell store) and falls back
 * to a localStorage counter for environments where the context is unavailable.
 */
watch(() => shell.startMenuVisible, (visible) => {
  if (visible) {
    shell.notifyStartMenuOpened();
  }
});

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
  transition: top 0.3s ease, bottom 0.3s ease;
}

/* Offset desktop area when taskbar is visible */
.desktop.taskbar-visible-top {
  top: 48px;
}
.desktop.taskbar-visible-bottom {
  bottom: 36px;
}
.desktop.taskbar-visible-left {
  left: 36px;
}
.desktop.taskbar-visible-right {
  right: 36px;
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

/* ── Desktop grid surface (behind windows, above watermark) ── */
.desktop-grid-surface {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: auto;
}
.desktop-grid-inner {
  width: 100%;
  height: 100%;
}
.desktop-grid-inner :deep(iframe) {
  width: 100%;
  height: 100% !important;
  border: none;
  display: block;
  background: transparent;
}
.desktop-focus-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.watermark {
  width: 260px;
  height: auto;
}

/* ── Start Menu dismiss overlay (catches clicks over iframes) ── */
.start-menu-dismiss-overlay {
  position: absolute;
  inset: 0;
  z-index: 99997;
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
  height: 100% !important;
  border: none;
  display: block;
}

/* Mobile start menu: full-width bottom sheet */
.start-menu-panel.mobile-start {
  top: auto;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 70%;
  max-height: 100%;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(59, 130, 246, 0.15);
}
</style>
