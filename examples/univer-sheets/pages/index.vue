<template>
  <div class="page">
    <div class="toolbar">
      <span class="title">📊 Univer Sheets</span>
      <span class="status" :class="saveStatus">{{ saveStatusText }}</span>
    </div>
    <div id="univer-container" ref="univerContainer"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { saveToOpfs, loadFromOpfs } from '~/composables/useOpfsStorage';

const OPFS_FILENAME = 'univer-sheets.json';
const SAVE_INTERVAL = 5000;

const univerContainer = ref<HTMLElement | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');

let univerAPI: any = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved to OPFS';
    case 'saving': return '⏳ Saving...';
    default: return '';
  }
});

async function saveData() {
  if (!univerAPI) return;
  try {
    const workbook = univerAPI.getActiveWorkbook();
    if (!workbook) return;
    saveStatus.value = 'saving';
    const snapshot = workbook.save();
    await saveToOpfs(OPFS_FILENAME, snapshot);
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to save to OPFS:', e);
    saveStatus.value = 'idle';
  }
}

onMounted(async () => {
  const { createUniver, defaultTheme, LocaleType } = await import('@univerjs/presets');
  const { UniverSheetsCorePreset } = await import('@univerjs/presets/preset-sheets-core');
  await import('@univerjs/presets/lib/styles/preset-sheets-core.css');

  const savedData = await loadFromOpfs(OPFS_FILENAME);

  const result = createUniver({
    locale: LocaleType.EN_US,
    theme: defaultTheme,
    presets: [
      UniverSheetsCorePreset({ container: 'univer-container' }),
    ],
  });

  univerAPI = result.univerAPI;

  if (savedData) {
    univerAPI.createWorkbook(savedData);
  } else {
    univerAPI.createWorkbook({ name: 'My Spreadsheet' });
  }

  // Auto-save periodically
  saveTimer = setInterval(saveData, SAVE_INTERVAL);
});

onBeforeUnmount(() => {
  if (saveTimer) clearInterval(saveTimer);
});
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #e2e8f0;
}

.title {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1a1a2e;
}

.status {
  font-size: 0.75rem;
  color: #94a3b8;
  transition: color 0.2s;
}

.status.saved {
  color: #22c55e;
}

.status.saving {
  color: #f59e0b;
}

#univer-container {
  flex: 1;
  overflow: hidden;
}
</style>
