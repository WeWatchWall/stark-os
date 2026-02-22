<template>
  <div class="page">
    <div class="toolbar">
      <span class="title">📽️ Univer Slides</span>
      <span class="status" :class="saveStatus">{{ saveStatusText }}</span>
    </div>
    <div id="univer-container" ref="univerContainer"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Univer, LocaleType, UniverInstanceType } from '@univerjs/core';
import { defaultTheme } from '@univerjs/design';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverDrawingPlugin } from '@univerjs/drawing';
import { UniverSlidesPlugin } from '@univerjs/slides';
import { UniverSlidesUIPlugin } from '@univerjs/slides-ui';
import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import '@univerjs/slides-ui/lib/index.css';
import { saveToOpfs, loadFromOpfs } from '~/composables/useOpfsStorage';

const OPFS_FILENAME = 'univer-slides.json';
const SAVE_INTERVAL = 5000;

const univerContainer = ref<HTMLElement | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');

let univer: any = null;
let slideUnit: any = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved to OPFS';
    case 'saving': return '⏳ Saving...';
    default: return '';
  }
});

const DEFAULT_SLIDE_DATA = {
  id: 'default-slide',
  locale: null,
  name: '',
  appVersion: '',
  title: 'My Presentation',
  body: {
    pages: {
      'slide_1': {
        id: 'slide_1',
        pageType: 0,
        zIndex: 1,
        title: 'Slide 1',
        description: '',
        pageBackgroundFill: { rgb: '#FFFFFF' },
        defaultTextStyle: {},
        pageElements: {},
      },
    },
    pageOrder: ['slide_1'],
  },
  pageSize: {
    width: 960,
    height: 540,
  },
};

async function saveData() {
  if (!slideUnit) return;
  try {
    saveStatus.value = 'saving';
    const snapshot = JSON.parse(JSON.stringify(slideUnit.getSnapshot()));
    await saveToOpfs(OPFS_FILENAME, snapshot);
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to save to OPFS:', e);
    saveStatus.value = 'idle';
  }
}

onMounted(async () => {
  const savedData = await loadFromOpfs(OPFS_FILENAME);

  univer = new Univer({
    locale: LocaleType.EN_US,
    theme: defaultTheme,
  });

  univer.registerPlugin(UniverRenderEnginePlugin);
  univer.registerPlugin(UniverUIPlugin, {
    container: 'univer-container',
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverFormulaEnginePlugin);
  univer.registerPlugin(UniverDrawingPlugin);
  univer.registerPlugin(UniverSlidesPlugin);
  univer.registerPlugin(UniverSlidesUIPlugin);

  slideUnit = univer.createUnit(
    UniverInstanceType.UNIVER_SLIDE,
    savedData || DEFAULT_SLIDE_DATA,
  );

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
