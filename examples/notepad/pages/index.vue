<template>
  <div class="notepad" @click="closeMenus">
    <!-- Menu Bar -->
    <div class="menu-bar">
      <div class="menu-left">
        <span class="app-title">📝 Notepad</span>
        <!-- File menu -->
        <div class="menu-dropdown">
          <button class="menu-trigger" @click.stop="toggleMenu('file')">File</button>
          <div v-if="openMenu === 'file'" class="menu-items">
            <button class="menu-item" @click="newFile(); closeMenus()">
              <span>New</span><span class="shortcut">Ctrl+N</span>
            </button>
            <button class="menu-item" @click="openFilePicker(); closeMenus()">
              <span>Open…</span><span class="shortcut">Ctrl+O</span>
            </button>
            <button class="menu-item" @click="saveFile(); closeMenus()">
              <span>Save</span><span class="shortcut">Ctrl+S</span>
            </button>
            <button class="menu-item" @click="saveAsFile(); closeMenus()">
              <span>Save As…</span>
            </button>
          </div>
        </div>
        <!-- View menu -->
        <div class="menu-dropdown">
          <button class="menu-trigger" @click.stop="toggleMenu('view')">View</button>
          <div v-if="openMenu === 'view'" class="menu-items">
            <button class="menu-item" @click="wordWrap = !wordWrap; closeMenus()">
              <span>{{ wordWrap ? '✓' : '\u2003' }} Word Wrap</span>
            </button>
            <button class="menu-item" @click="showLineNumbers = !showLineNumbers; closeMenus()">
              <span>{{ showLineNumbers ? '✓' : '\u2003' }} Line Numbers</span>
            </button>
            <div class="menu-sep"></div>
            <button class="menu-item" @click="toggleFind(); closeMenus()">
              <span>Find &amp; Replace</span><span class="shortcut">Ctrl+H</span>
            </button>
          </div>
        </div>
      </div>
      <div class="menu-right">
        <span class="status-text" :class="saveStatus">{{ saveStatusText }}</span>
      </div>
    </div>

    <!-- Find & Replace Bar -->
    <div v-if="showFindBar" class="find-bar">
      <div class="find-row">
        <input
          ref="findInput"
          v-model="findText"
          class="find-input"
          placeholder="Find…"
          @keydown.enter="findNext"
          @keydown.escape="showFindBar = false"
        />
        <span class="match-count">{{ matchInfo }}</span>
        <button class="find-btn" title="Previous (Shift+Enter)" @click="findPrev">▲</button>
        <button class="find-btn" title="Next (Enter)" @click="findNext">▼</button>
      </div>
      <div class="find-row">
        <input
          v-model="replaceText"
          class="find-input"
          placeholder="Replace…"
          @keydown.enter="replaceOne"
          @keydown.escape="showFindBar = false"
        />
        <button class="find-btn" title="Replace" @click="replaceOne">Replace</button>
        <button class="find-btn" title="Replace All" @click="replaceAll">All</button>
      </div>
    </div>

    <!-- Editor Area -->
    <div class="editor-area" @click="focusEditor">
      <div class="editor-scroll" ref="editorScroll">
        <div class="line-numbers" v-if="showLineNumbers" ref="lineNumbersEl">
          <div v-for="n in lineCount" :key="n" class="line-num">{{ n }}</div>
        </div>
        <textarea
          ref="textareaEl"
          v-model="content"
          class="editor-textarea"
          :class="{ 'word-wrap': wordWrap }"
          spellcheck="false"
          @input="onInput"
          @scroll="syncScroll"
          @keydown="onKeydown"
        ></textarea>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
      <span>{{ currentFilePath || 'Untitled' }}</span>
      <span>Ln {{ cursorLine }}, Col {{ cursorCol }}</span>
      <span>{{ charCount }} chars</span>
      <span>{{ lineCount }} lines</span>
      <span>UTF-8</span>
    </div>

    <!-- File Picker -->
    <FilesPicker
      v-model:visible="showOpenPicker"
      mode="file"
      title="Open File"
      :extensions="textExtensions"
      initialPath="/home"
      @select="onFileSelected"
      @cancel="showOpenPicker = false"
    />
    <FilesPicker
      v-model:visible="showSavePicker"
      mode="save"
      title="Save As"
      :extensions="textExtensions"
      :initialPath="saveInitialPath"
      :defaultFileName="saveDefaultName"
      @select="onSaveSelected"
      @cancel="showSavePicker = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

const content = ref('');
const currentFilePath = ref('');
const saveStatus = ref<'saved' | 'saving' | 'idle' | 'modified'>('idle');
const wordWrap = ref(true);
const showLineNumbers = ref(true);
const showFindBar = ref(false);
const findText = ref('');
const replaceText = ref('');
const cursorLine = ref(1);
const cursorCol = ref(1);

const showOpenPicker = ref(false);
const showSavePicker = ref(false);
const openMenu = ref<string | null>(null);

const textareaEl = ref<HTMLTextAreaElement | null>(null);
const lineNumbersEl = ref<HTMLElement | null>(null);
const editorScroll = ref<HTMLElement | null>(null);
const findInput = ref<HTMLInputElement | null>(null);

let opfsRoot: FileSystemDirectoryHandle | null = null;
let dirty = false;
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

const textExtensions = [
  { label: 'Text Files', extensions: ['.txt', '.md', '.log', '.csv', '.json', '.xml', '.yaml', '.yml', '.ini', '.cfg', '.conf', '.sh', '.bash', '.env'] },
  { label: 'All Files', extensions: ['*'] },
];

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved';
    case 'saving': return '⏳ Saving…';
    case 'modified': return '● Modified';
    default: return '';
  }
});

const lineCount = computed(() => {
  const c = content.value;
  if (!c) return 1;
  let count = 1;
  for (let i = 0; i < c.length; i++) {
    if (c[i] === '\n') count++;
  }
  return count;
});

const charCount = computed(() => content.value.length);

const saveInitialPath = computed(() => {
  if (currentFilePath.value) {
    const parts = currentFilePath.value.split('/');
    parts.pop();
    return parts.join('/') || '/home';
  }
  return '/home';
});

const saveDefaultName = computed(() => {
  if (currentFilePath.value) {
    const parts = currentFilePath.value.split('/');
    return parts[parts.length - 1] || 'untitled.txt';
  }
  return 'untitled.txt';
});

/* ── Menu helpers ── */

function toggleMenu(name: string) {
  openMenu.value = openMenu.value === name ? null : name;
}

function closeMenus() {
  openMenu.value = null;
}

/* ── Find/Replace ── */

const matchInfo = computed(() => {
  if (!findText.value) return '';
  const text = content.value;
  const search = findText.value;
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(search, idx)) !== -1) {
    count++;
    idx += search.length;
  }
  return `${count} match${count !== 1 ? 'es' : ''}`;
});

function findNext() {
  if (!findText.value || !textareaEl.value) return;
  const ta = textareaEl.value;
  const start = ta.selectionEnd;
  const idx = content.value.indexOf(findText.value, start);
  if (idx !== -1) {
    ta.setSelectionRange(idx, idx + findText.value.length);
    ta.focus();
  } else {
    // Wrap around
    const wrapIdx = content.value.indexOf(findText.value);
    if (wrapIdx !== -1) {
      ta.setSelectionRange(wrapIdx, wrapIdx + findText.value.length);
      ta.focus();
    }
  }
}

function findPrev() {
  if (!findText.value || !textareaEl.value) return;
  const ta = textareaEl.value;
  const end = ta.selectionStart;
  const idx = content.value.lastIndexOf(findText.value, end - 1);
  if (idx !== -1) {
    ta.setSelectionRange(idx, idx + findText.value.length);
    ta.focus();
  } else {
    const wrapIdx = content.value.lastIndexOf(findText.value);
    if (wrapIdx !== -1) {
      ta.setSelectionRange(wrapIdx, wrapIdx + findText.value.length);
      ta.focus();
    }
  }
}

function replaceOne() {
  if (!findText.value || !textareaEl.value) return;
  const ta = textareaEl.value;
  const selText = content.value.substring(ta.selectionStart, ta.selectionEnd);
  if (selText === findText.value) {
    const before = content.value.substring(0, ta.selectionStart);
    const after = content.value.substring(ta.selectionEnd);
    content.value = before + replaceText.value + after;
    ta.setSelectionRange(before.length, before.length + replaceText.value.length);
    dirty = true;
    saveStatus.value = 'modified';
  }
  findNext();
}

function replaceAll() {
  if (!findText.value) return;
  const escaped = findText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  content.value = content.value.replace(new RegExp(escaped, 'g'), replaceText.value);
  dirty = true;
  saveStatus.value = 'modified';
}

function toggleFind() {
  showFindBar.value = !showFindBar.value;
  if (showFindBar.value) {
    nextTick(() => findInput.value?.focus());
  }
}

/* ── Editor events ── */

function onInput() {
  dirty = true;
  saveStatus.value = 'modified';
  updateCursorPos();
}

function onKeydown(e: KeyboardEvent) {
  // Tab key inserts spaces
  if (e.key === 'Tab') {
    e.preventDefault();
    const ta = textareaEl.value!;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    content.value = content.value.substring(0, start) + '  ' + content.value.substring(end);
    nextTick(() => {
      ta.selectionStart = ta.selectionEnd = start + 2;
    });
    dirty = true;
    saveStatus.value = 'modified';
  }

  // Ctrl+S = Save
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    saveFile();
  }

  // Ctrl+O = Open
  if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    openFilePicker();
  }

  // Ctrl+H = Find & Replace
  if (e.key === 'h' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    toggleFind();
  }

  // Ctrl+F = Find
  if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    showFindBar.value = true;
    nextTick(() => findInput.value?.focus());
  }

  // Ctrl+N = New
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    newFile();
  }

  nextTick(updateCursorPos);
}

function updateCursorPos() {
  if (!textareaEl.value) return;
  const ta = textareaEl.value;
  const text = ta.value.substring(0, ta.selectionStart);
  const lines = text.split('\n');
  cursorLine.value = lines.length;
  cursorCol.value = (lines[lines.length - 1]?.length ?? 0) + 1;
}

function syncScroll() {
  if (lineNumbersEl.value && textareaEl.value) {
    lineNumbersEl.value.scrollTop = textareaEl.value.scrollTop;
  }
}

function focusEditor() {
  textareaEl.value?.focus();
}

/* ── File Operations ── */

function getInitialPath(): string | null {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { args?: string[] } | undefined;
    const arg = ctx?.args?.[0];
    if (arg && typeof arg === 'string' && arg.trim().length > 0) {
      return arg.trim();
    }
  } catch { /* cross-origin or no parent */ }
  return null;
}

async function loadFile(path: string) {
  if (!opfsRoot) return;
  try {
    const fh = await getFileHandle(opfsRoot, path);
    const file = await fh.getFile();
    content.value = await file.text();
    currentFilePath.value = normalizePath(path);
    dirty = false;
    saveStatus.value = 'saved';
    updateCursorPos();
  } catch (e) {
    console.warn('Failed to load file:', path, e);
  }
}

async function saveToPath(path: string) {
  if (!opfsRoot) return;
  try {
    saveStatus.value = 'saving';
    const fh = await getFileHandle(opfsRoot, path, true);
    const writable = await fh.createWritable();
    await writable.write(new TextEncoder().encode(content.value));
    await writable.close();
    currentFilePath.value = normalizePath(path);
    dirty = false;
    saveStatus.value = 'saved';
  } catch (e) {
    console.warn('Failed to save file:', path, e);
    saveStatus.value = 'modified';
  }
}

async function saveFile() {
  if (currentFilePath.value) {
    await saveToPath(currentFilePath.value);
  } else {
    saveAsFile();
  }
}

function saveAsFile() {
  showSavePicker.value = true;
}

function openFilePicker() {
  showOpenPicker.value = true;
}

function newFile() {
  content.value = '';
  currentFilePath.value = '';
  dirty = false;
  saveStatus.value = 'idle';
  updateCursorPos();
}

async function onFileSelected(result: { paths: string[] }) {
  if (result.paths.length > 0) {
    await loadFile(result.paths[0]);
  }
}

async function onSaveSelected(result: { paths: string[] }) {
  if (result.paths.length > 0) {
    await saveToPath(result.paths[0]);
  }
}

/* ── Auto-save ── */

async function autoSave() {
  if (dirty && currentFilePath.value) {
    await saveToPath(currentFilePath.value);
  }
}

/* ── Lifecycle ── */

onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();

  const initialPath = getInitialPath();
  if (initialPath) {
    await loadFile(initialPath);
  }

  autoSaveTimer = setInterval(autoSave, 5000);
  textareaEl.value?.focus();
});

onBeforeUnmount(() => {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
});
</script>

<style scoped>
.notepad {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
}

.menu-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  flex-shrink: 0;
  height: 30px;
}

.menu-left, .menu-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.app-title {
  font-weight: 600;
  font-size: 13px;
  margin-right: 6px;
  white-space: nowrap;
}

/* Dropdown menus */
.menu-dropdown {
  position: relative;
}

.menu-trigger {
  background: none;
  border: 1px solid transparent;
  color: #ccc;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
}
.menu-trigger:hover { background: #3c3c3c; }

.menu-items {
  position: absolute;
  top: 100%;
  left: 0;
  background: #2d2d2d;
  border: 1px solid #454545;
  border-radius: 4px;
  padding: 4px 0;
  z-index: 200;
  min-width: 200px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  color: #ccc;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  gap: 24px;
}
.menu-item:hover { background: #094771; color: #fff; }

.menu-sep {
  height: 1px;
  background: #3c3c3c;
  margin: 4px 0;
}

.shortcut {
  font-size: 11px;
  color: #888;
}
.menu-item:hover .shortcut { color: #bbb; }

.status-text {
  font-size: 11px;
  color: #888;
  margin-left: 8px;
  white-space: nowrap;
}
.status-text.saved { color: #4ec9b0; }
.status-text.saving { color: #dcdcaa; }
.status-text.modified { color: #ce9178; }

/* Find bar */
.find-bar {
  padding: 6px 8px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.find-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.find-input {
  flex: 1;
  background: #3c3c3c;
  border: 1px solid #555;
  color: #ccc;
  padding: 3px 8px;
  font-size: 12px;
  border-radius: 3px;
  outline: none;
}
.find-input:focus { border-color: #007acc; }

.match-count {
  font-size: 11px;
  color: #888;
  min-width: 60px;
  text-align: center;
  white-space: nowrap;
}

.find-btn {
  background: #3c3c3c;
  border: 1px solid #555;
  color: #ccc;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
}
.find-btn:hover { background: #505050; }

/* Editor area */
.editor-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.editor-scroll {
  display: flex;
  width: 100%;
  height: 100%;
}

.line-numbers {
  width: 50px;
  background: #1e1e1e;
  border-right: 1px solid #333;
  overflow: hidden;
  flex-shrink: 0;
  padding-top: 8px;
  user-select: none;
}

.line-num {
  text-align: right;
  padding: 0 8px 0 0;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: #858585;
  height: 21px;
}

.editor-textarea {
  flex: 1;
  background: #1e1e1e;
  color: #d4d4d4;
  border: none;
  outline: none;
  resize: none;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  padding: 8px 12px;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}

.editor-textarea.word-wrap {
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.editor-textarea::-webkit-scrollbar { width: 8px; height: 8px; }
.editor-textarea::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
.editor-textarea::-webkit-scrollbar-track { background: transparent; }

/* Status bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 2px 12px;
  background: #007acc;
  color: #fff;
  font-size: 11px;
  flex-shrink: 0;
}
</style>
