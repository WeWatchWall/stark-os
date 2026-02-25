<template>
  <div class="page">
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">EXPLORER</span>
        <button class="icon-btn" title="New File" @click="createNewFile">+</button>
      </div>
      <div class="file-list">
        <div
          v-for="file in files"
          :key="file"
          class="file-item"
          :class="{ active: file === currentFile }"
          @click="openFile(file)"
        >
          <span class="file-icon">{{ getFileIcon(file) }}</span>
          <span class="file-name">{{ file }}</span>
          <button
            class="delete-btn"
            title="Delete"
            @click.stop="removeFile(file)"
          >×</button>
        </div>
        <div v-if="files.length === 0" class="empty-hint">
          No files yet.<br />Click + to create one.
        </div>
      </div>
    </div>

    <div class="main">
      <div class="toolbar">
        <span class="title">
          <template v-if="currentFile">{{ currentFile }}</template>
          <template v-else>VS Code</template>
        </span>
        <span class="status" :class="saveStatus">{{ saveStatusText }}</span>
      </div>
      <div v-if="currentFile" id="monaco-container" ref="monacoContainer"></div>
      <div v-else class="welcome">
        <div class="welcome-content">
          <h1>💻 VS Code</h1>
          <p>Create or open a file to start editing.</p>
          <button class="welcome-btn" @click="createNewFile">New File</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import {
  listFiles,
  saveFile,
  loadFile,
  deleteFile,
} from '~/composables/useOpfsStorage';

const SAVE_DELAY = 1000;

const monacoContainer = ref<HTMLElement | null>(null);
const files = ref<string[]>([]);
const currentFile = ref<string | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');

let editor: any = null;
let monacoModule: any = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let isLoadingFile = false;

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved to OPFS';
    case 'saving': return '⏳ Saving...';
    default: return '';
  }
});

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    js: '📜', ts: '📘', json: '📋', html: '🌐', css: '🎨',
    md: '📝', py: '🐍', go: '🔵', rs: '🦀', java: '☕',
    vue: '💚', txt: '📄',
  };
  return icons[ext] || '📄';
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss',
    less: 'less', md: 'markdown', py: 'python', go: 'go', rs: 'rust',
    java: 'java', c: 'c', cpp: 'cpp', xml: 'xml', yaml: 'yaml',
    yml: 'yaml', sh: 'shell', sql: 'sql', vue: 'html', txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

async function refreshFiles() {
  files.value = await listFiles();
}

async function createNewFile() {
  const name = prompt('Enter file name:');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  await saveFile(trimmed, '');
  await refreshFiles();
  await openFile(trimmed);
}

async function openFile(filename: string) {
  // Save current file before switching
  if (currentFile.value && editor) {
    await saveCurrentFile();
  }

  currentFile.value = filename;
  const content = await loadFile(filename) || '';

  await nextTick();

  if (!editor && monacoContainer.value) {
    await initEditor(content, filename);
  } else if (editor) {
    isLoadingFile = true;
    const model = monacoModule.editor.createModel(
      content,
      getLanguage(filename),
    );
    editor.setModel(model);
    isLoadingFile = false;
  }

  saveStatus.value = 'idle';
}

async function initEditor(content: string, filename: string) {
  monacoModule = await import('monaco-editor');

  // Configure Monaco environment for worker-less operation
  (self as any).MonacoEnvironment = {
    getWorker() {
      return null as any;
    },
  };

  editor = monacoModule.editor.create(monacoContainer.value!, {
    value: content,
    language: getLanguage(filename),
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    tabSize: 2,
  });

  editor.onDidChangeModelContent(() => {
    if (isLoadingFile) return;
    scheduleSave();
  });
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveCurrentFile(), SAVE_DELAY);
}

async function saveCurrentFile() {
  if (!currentFile.value || !editor) return;
  try {
    saveStatus.value = 'saving';
    const content = editor.getValue();
    await saveFile(currentFile.value, content);
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to save to OPFS:', e);
    saveStatus.value = 'idle';
  }
}

async function removeFile(filename: string) {
  if (!confirm(`Delete "${filename}"?`)) return;
  await deleteFile(filename);

  if (currentFile.value === filename) {
    currentFile.value = null;
    if (editor) {
      editor.dispose();
      editor = null;
    }
  }

  await refreshFiles();
}

onMounted(async () => {
  await refreshFiles();
});

onBeforeUnmount(() => {
  if (saveTimeout) clearTimeout(saveTimeout);
  if (editor) editor.dispose();
});
</script>

<style scoped>
.page {
  display: flex;
  width: 100%;
  height: 100vh;
  background: #1e1e1e;
  color: #cccccc;
}

.sidebar {
  width: 240px;
  min-width: 240px;
  background: #252526;
  border-right: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #bbbbbb;
  border-bottom: 1px solid #3c3c3c;
}

.icon-btn {
  background: none;
  border: 1px solid #555;
  color: #cccccc;
  font-size: 1rem;
  cursor: pointer;
  border-radius: 3px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.icon-btn:hover {
  background: #3c3c3c;
}

.file-list {
  flex: 1;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 0.3rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
  gap: 0.4rem;
}

.file-item:hover {
  background: #2a2d2e;
}

.file-item.active {
  background: #37373d;
  color: #ffffff;
}

.file-icon {
  font-size: 0.8rem;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 1rem;
  cursor: pointer;
  opacity: 0;
  padding: 0 2px;
  line-height: 1;
}

.file-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #e06c75;
}

.empty-hint {
  padding: 1rem;
  text-align: center;
  color: #666;
  font-size: 0.8rem;
  line-height: 1.6;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 1rem;
  background: #3c3c3c;
  border-bottom: 1px solid #252526;
  min-height: 35px;
}

.title {
  font-weight: 500;
  font-size: 0.85rem;
  color: #cccccc;
}

.status {
  font-size: 0.75rem;
  color: #666;
  transition: color 0.2s;
}

.status.saved {
  color: #22c55e;
}

.status.saving {
  color: #f59e0b;
}

#monaco-container {
  flex: 1;
  overflow: hidden;
}

.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome-content {
  text-align: center;
}

.welcome-content h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  font-weight: 300;
  color: #cccccc;
}

.welcome-content p {
  color: #888;
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.welcome-btn {
  background: #0e639c;
  color: #ffffff;
  border: none;
  padding: 0.6rem 1.5rem;
  font-size: 0.9rem;
  border-radius: 3px;
  cursor: pointer;
}

.welcome-btn:hover {
  background: #1177bb;
}
</style>
