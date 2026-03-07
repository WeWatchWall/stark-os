<template>
  <SharedTerminal :initial-path="initialPath" class="terminal-wrapper" />
</template>

<script setup lang="ts">
/**
 * Stark OS Terminal Page
 *
 * Full-page terminal using xterm.js with OPFS-backed filesystem.
 * Volumes stored in OPFS are visible at /volumes/<name>.
 *
 * This page wraps the shared SharedTerminal component and provides
 * bundling. The initial path can be passed via __STARK_CONTEXT__.args[0].
 */

import SharedTerminal from '../../../examples/shared/components/SharedTerminal.vue';

function getInitialPath(): string {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { args?: string[] } | undefined;
    const arg = ctx?.args?.[0];
    if (arg && typeof arg === 'string' && arg.trim().length > 0) {
      return arg.trim();
    }
  } catch {
    /* cross-origin or no parent — ignore */
  }
  return '/home';
}

const initialPath = getInitialPath();
</script>

<style scoped>
.terminal-wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
