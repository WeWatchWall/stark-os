<template>
  <div class="graphite">
    <!-- Graphite editor iframe -->
    <div class="editor-area">
      <iframe
        ref="iframeEl"
        :src="graphiteUrl"
        class="graphite-iframe"
        allow="cross-origin-isolated"
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads allow-forms"
        title="Graphite Editor"
      ></iframe>
      <div v-if="!iframeLoaded" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>Loading Graphite Editor…</p>
        <p class="loading-hint">Connecting to editor.graphite.rs</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const GRAPHITE_URL = 'https://editor.graphite.rs/';

const graphiteUrl = ref(GRAPHITE_URL);
const iframeEl = ref<HTMLIFrameElement | null>(null);
const iframeLoaded = ref(false);

/* ── Lifecycle ── */

onMounted(() => {
  if (iframeEl.value) {
    iframeEl.value.addEventListener('load', () => {
      iframeLoaded.value = true;
    });
  }
});
</script>

<style scoped>
.graphite {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #222;
  color: #d4d4d4;
}

/* Editor area */
.editor-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.graphite-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: #222;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #888;
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid #444;
  border-top-color: #007acc;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-hint {
  font-size: 12px;
  color: #666;
}
</style>
