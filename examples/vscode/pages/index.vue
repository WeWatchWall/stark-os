<template>
  <div class="page" @contextmenu.prevent>
    <!-- Notification toasts -->
    <div class="toast-container">
      <div
        v-for="(toast, i) in toasts"
        :key="i"
        class="toast"
        :class="toast.type"
      >{{ toast.message }}</div>
    </div>

    <!-- Command palette overlay -->
    <div v-if="showCommandPalette" class="palette-overlay" @click.self="showCommandPalette = false">
      <div class="palette">
        <input
          ref="paletteInput"
          v-model="paletteQuery"
          class="palette-input"
          :placeholder="paletteMode === 'commands' ? 'Type a command...' : 'Search files by name...'"
          @keydown.escape="showCommandPalette = false"
          @keydown.enter="executePaletteSelection"
          @keydown.down.prevent="paletteIndex = Math.min(paletteIndex + 1, filteredPaletteItems.length - 1)"
          @keydown.up.prevent="paletteIndex = Math.max(paletteIndex - 1, 0)"
        />
        <div class="palette-results">
          <div
            v-for="(item, idx) in filteredPaletteItems"
            :key="idx"
            class="palette-item"
            :class="{ active: idx === paletteIndex }"
            @click="executePaletteItem(item)"
            @mouseenter="paletteIndex = idx"
          >
            <span class="palette-icon">{{ item.icon }}</span>
            <span class="palette-label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="palette-shortcut">{{ item.shortcut }}</span>
          </div>
          <div v-if="filteredPaletteItems.length === 0" class="palette-empty">No results found</div>
        </div>
      </div>
    </div>

    <!-- Search panel overlay -->
    <div v-if="showSearchPanel" class="search-overlay" @click.self="showSearchPanel = false">
      <div class="search-panel">
        <div class="search-panel-header">
          <span>Search in Files</span>
          <button class="close-btn" @click="showSearchPanel = false">×</button>
        </div>
        <div class="search-input-row">
          <input
            ref="searchInput"
            v-model="searchQuery"
            class="search-field"
            placeholder="Search..."
            @keydown.escape="showSearchPanel = false"
            @keydown.enter="performSearch"
          />
          <button class="search-go-btn" @click="performSearch">Go</button>
        </div>
        <div class="search-results">
          <div v-if="searchResults.length === 0 && searchQuery" class="search-empty">No results</div>
          <div
            v-for="(result, idx) in searchResults"
            :key="idx"
            class="search-result-item"
            @click="openSearchResult(result)"
          >
            <span class="search-result-file">{{ result.file }}:{{ result.line }}</span>
            <span class="search-result-text">{{ result.text.trim() }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Context menu -->
    <div
      v-if="contextMenu.show"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <div class="context-item" @click="renameFileFromContext">Rename</div>
      <div class="context-item" @click="duplicateFileFromContext">Duplicate</div>
      <div class="context-separator"></div>
      <div class="context-item danger" @click="deleteFileFromContext">Delete</div>
    </div>

    <!-- Activity bar -->
    <div class="activity-bar">
      <button
        class="activity-btn"
        :class="{ active: activePanel === 'explorer' && sidebarVisible }"
        title="Explorer (Ctrl+Shift+E)"
        @click="togglePanel('explorer')"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 0h-9L7 1.5V6H2.5L1 7.5v13.7l.7.8h12.8l.8-.8V17H21l.5-.5V4.7L17.5 0zm0 2.1l2.4 2.4H17.5V2.1zM13.5 21H2V8h5v8.5l1.5 1.5h5v3zm1-4H9V6h4.5v3.5l1.5 1.5H19v6h-4.5zm.5-6.5V7.1l2.4 2.4H15z"/></svg>
      </button>
      <button
        class="activity-btn"
        :class="{ active: activePanel === 'search' && sidebarVisible }"
        title="Search (Ctrl+Shift+F)"
        @click="togglePanel('search')"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.25 0a8.25 8.25 0 0 0-6.18 13.72L1 21.79l1.42 1.42 8.07-8.07A8.25 8.25 0 1 0 15.25.01V0zm0 14.5a6.25 6.25 0 1 1 0-12.5 6.25 6.25 0 0 1 0 12.5z"/></svg>
      </button>
      <div class="activity-spacer"></div>
      <button
        class="activity-btn"
        title="Settings"
        @click="openCommandPalette('commands')"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>
      </button>
    </div>

    <!-- Sidebar -->
    <div v-if="sidebarVisible" class="sidebar">
      <!-- Explorer panel -->
      <template v-if="activePanel === 'explorer'">
        <div class="sidebar-header">
          <span class="sidebar-title">EXPLORER</span>
          <div class="sidebar-actions">
            <button class="icon-btn" title="New File (Ctrl+N)" @click="createNewFile">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M12 3H8.5L7.5 2H4.5l-1 1H1v1h1v9.5l.5.5h11l.5-.5V4h1V3h-2zm0 10H3V4h3.5l1-1h2l1 1H12v9zM7 6v2H5v1h2v2h1V9h2V8H8V6H7z"/></svg>
            </button>
            <button class="icon-btn" title="Collapse Sidebar" @click="sidebarVisible = false">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1H3L2 2v11l1 1h11l1-1V2l-1-1zM6 13V2h8v11H6z"/></svg>
            </button>
          </div>
        </div>
        <div class="file-list">
          <div
            v-for="file in files"
            :key="file"
            class="file-item"
            :class="{ active: openTabs.some(t => t.name === file) }"
            @click="openFile(file)"
            @dblclick="startRenaming(file)"
            @contextmenu.prevent="showFileContextMenu($event, file)"
          >
            <span class="file-icon">{{ getFileIcon(file) }}</span>
            <input
              v-if="renamingFile === file"
              ref="renameInput"
              v-model="renameValue"
              class="rename-input"
              @blur="finishRename"
              @keydown.enter="finishRename"
              @keydown.escape="cancelRename"
              @click.stop
            />
            <span v-else class="file-name">{{ file }}</span>
            <button
              class="delete-btn"
              title="Delete"
              @click.stop="removeFile(file)"
            >×</button>
          </div>
          <div v-if="files.length === 0" class="empty-hint">
            No files yet.<br />Press Ctrl+N to create one.
          </div>
        </div>
      </template>

      <!-- Search panel -->
      <template v-if="activePanel === 'search'">
        <div class="sidebar-header">
          <span class="sidebar-title">SEARCH</span>
        </div>
        <div class="sidebar-search">
          <input
            ref="sidebarSearchInput"
            v-model="sidebarSearchQuery"
            class="sidebar-search-field"
            placeholder="Search"
            @keydown.enter="performSidebarSearch"
            @keydown.escape="sidebarSearchQuery = ''; sidebarSearchResults = []"
          />
          <div class="search-results-list">
            <template v-if="sidebarSearchResults.length > 0">
              <div class="search-results-count">{{ sidebarSearchResults.length }} result{{ sidebarSearchResults.length !== 1 ? 's' : '' }}</div>
              <div
                v-for="(result, idx) in sidebarSearchResults"
                :key="idx"
                class="search-result-entry"
                @click="openSearchResultFromSidebar(result)"
              >
                <div class="search-result-header">{{ result.file }}:{{ result.line }}</div>
                <div class="search-result-preview">{{ result.text.trim().substring(0, 120) }}</div>
              </div>
            </template>
            <div v-else-if="sidebarSearchQuery && sidebarSearchDone" class="search-empty-hint">No results found</div>
          </div>
        </div>
      </template>
    </div>

    <!-- Main area -->
    <div class="main">
      <!-- Tab bar -->
      <div class="tab-bar" v-if="openTabs.length > 0">
        <div
          v-for="tab in openTabs"
          :key="tab.name"
          class="tab"
          :class="{ active: tab.name === currentFile, modified: tab.modified }"
          @click="switchToTab(tab.name)"
          @auxclick.middle.prevent="closeTab(tab.name)"
        >
          <span class="tab-icon">{{ getFileIcon(tab.name) }}</span>
          <span class="tab-label">{{ tab.name }}</span>
          <span v-if="tab.modified" class="tab-dot">●</span>
          <button class="tab-close" @click.stop="closeTab(tab.name)">×</button>
        </div>
      </div>

      <!-- Breadcrumbs -->
      <div v-if="currentFile" class="breadcrumbs">
        <span class="breadcrumb-item" @click="togglePanel('explorer')">{{ getFileIcon(currentFile) }} {{ currentFile }}</span>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-lang">{{ getLanguageLabel(currentFile) }}</span>
      </div>

      <!-- Editor -->
      <div v-if="currentFile" id="monaco-container" ref="monacoContainer"></div>

      <!-- Welcome page -->
      <div v-else class="welcome">
        <div class="welcome-content">
          <div class="welcome-logo">💻</div>
          <h1>VS Code</h1>
          <p class="welcome-subtitle">Editing evolved</p>

          <div class="welcome-sections">
            <div class="welcome-section">
              <h3>Start</h3>
              <div class="welcome-link" @click="createNewFile">New File...</div>
              <div class="welcome-link" @click="openCommandPalette('files')">Open File...</div>
            </div>
            <div class="welcome-section">
              <h3>Recent</h3>
              <template v-if="files.length > 0">
                <div
                  v-for="file in files.slice(0, 5)"
                  :key="file"
                  class="welcome-link"
                  @click="openFile(file)"
                >{{ getFileIcon(file) }} {{ file }}</div>
              </template>
              <div v-else class="welcome-hint">No recent files</div>
            </div>
            <div class="welcome-section">
              <h3>Keyboard Shortcuts</h3>
              <div class="shortcut-row"><kbd>Ctrl+Shift+P</kbd> <span>Command Palette</span></div>
              <div class="shortcut-row"><kbd>Ctrl+P</kbd> <span>Quick Open File</span></div>
              <div class="shortcut-row"><kbd>Ctrl+N</kbd> <span>New File</span></div>
              <div class="shortcut-row"><kbd>Ctrl+S</kbd> <span>Save File</span></div>
              <div class="shortcut-row"><kbd>Ctrl+W</kbd> <span>Close Tab</span></div>
              <div class="shortcut-row"><kbd>Ctrl+Shift+F</kbd> <span>Search in Files</span></div>
              <div class="shortcut-row"><kbd>Ctrl+B</kbd> <span>Toggle Sidebar</span></div>
              <div class="shortcut-row"><kbd>F2</kbd> <span>Rename File</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Status bar -->
      <div class="status-bar">
        <div class="status-left">
          <span v-if="currentFile" class="status-item">
            Ln {{ cursorLine }}, Col {{ cursorColumn }}
          </span>
          <span v-if="currentFile" class="status-item">
            Spaces: {{ editorTabSize }}
          </span>
        </div>
        <div class="status-right">
          <span class="status-item clickable" @click="toggleWordWrap">
            {{ wordWrapEnabled ? 'Word Wrap: On' : 'Word Wrap: Off' }}
          </span>
          <span v-if="currentFile" class="status-item">
            {{ getLanguageLabel(currentFile) }}
          </span>
          <span class="status-item">UTF-8</span>
          <span class="status-item save-indicator" :class="saveStatus">{{ saveStatusText }}</span>
        </div>
      </div>
    </div>

    <!-- Click blocker for context menu -->
    <div v-if="contextMenu.show" class="click-blocker" @click="contextMenu.show = false" @contextmenu.prevent="contextMenu.show = false"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import {
  listFiles,
  saveFile,
  loadFile,
  deleteFile,
  renameFile,
  searchInFiles,
} from '~/composables/useOpfsStorage';

// ─── Types ──────────────────────────────────────────
interface Tab {
  name: string;
  modified: boolean;
}
interface SearchResult {
  file: string;
  line: number;
  text: string;
}
interface PaletteItem {
  icon: string;
  label: string;
  shortcut?: string;
  action: () => void;
}
interface ToastMsg {
  message: string;
  type: 'info' | 'success' | 'error';
}

// ─── Constants ──────────────────────────────────────
const SAVE_DELAY = 1000;

// ─── State ──────────────────────────────────────────
const monacoContainer = ref<HTMLElement | null>(null);
const paletteInput = ref<HTMLInputElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const sidebarSearchInput = ref<HTMLInputElement | null>(null);
const renameInput = ref<HTMLInputElement | null>(null);

const files = ref<string[]>([]);
const currentFile = ref<string | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');
const openTabs = ref<Tab[]>([]);
const sidebarVisible = ref(true);
const activePanel = ref<'explorer' | 'search'>('explorer');
const cursorLine = ref(1);
const cursorColumn = ref(1);
const editorTabSize = ref(2);
const wordWrapEnabled = ref(true);

// Command palette
const showCommandPalette = ref(false);
const paletteQuery = ref('');
const paletteIndex = ref(0);
const paletteMode = ref<'commands' | 'files'>('commands');

// Search
const showSearchPanel = ref(false);
const searchQuery = ref('');
const searchResults = ref<SearchResult[]>([]);
const sidebarSearchQuery = ref('');
const sidebarSearchResults = ref<SearchResult[]>([]);
const sidebarSearchDone = ref(false);

// Rename
const renamingFile = ref<string | null>(null);
const renameValue = ref('');

// Context menu
const contextMenu = reactive({ show: false, x: 0, y: 0, file: '' });

// Notifications
const toasts = ref<ToastMsg[]>([]);

// Editor internals
let editor: any = null;
let monacoModule: any = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let isLoadingFile = false;
const fileModels = new Map<string, any>();

// ─── Computed ───────────────────────────────────────
const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return '✓ Saved';
    case 'saving': return '⏳ Saving...';
    default: return '';
  }
});

const commandList = computed<PaletteItem[]>(() => [
  { icon: '📄', label: 'New File', shortcut: 'Ctrl+N', action: createNewFile },
  { icon: '💾', label: 'Save File', shortcut: 'Ctrl+S', action: saveCurrentFile },
  { icon: '🔍', label: 'Search in Files', shortcut: 'Ctrl+Shift+F', action: () => openSidebarSearch() },
  { icon: '📂', label: 'Quick Open File', shortcut: 'Ctrl+P', action: () => openCommandPalette('files') },
  { icon: '✕', label: 'Close Tab', shortcut: 'Ctrl+W', action: () => currentFile.value && closeTab(currentFile.value) },
  { icon: '📋', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => { sidebarVisible.value = !sidebarVisible.value } },
  { icon: '↩', label: 'Toggle Word Wrap', action: toggleWordWrap },
  { icon: '🗺', label: 'Toggle Minimap', action: toggleMinimap },
  { icon: '🔤', label: 'Change Tab Size: 2', action: () => setTabSize(2) },
  { icon: '🔤', label: 'Change Tab Size: 4', action: () => setTabSize(4) },
]);

const filteredPaletteItems = computed<PaletteItem[]>(() => {
  if (paletteMode.value === 'files') {
    const q = paletteQuery.value.toLowerCase();
    return files.value
      .filter(f => f.toLowerCase().includes(q))
      .map(f => ({
        icon: getFileIcon(f),
        label: f,
        action: () => openFile(f),
      }));
  }
  const q = paletteQuery.value.toLowerCase();
  return commandList.value.filter(c => c.label.toLowerCase().includes(q));
});

watch(paletteQuery, () => { paletteIndex.value = 0; });

// ─── Helpers ────────────────────────────────────────
function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    js: '📜', ts: '📘', json: '📋', html: '🌐', css: '🎨',
    md: '📝', py: '🐍', go: '🔵', rs: '🦀', java: '☕',
    vue: '💚', txt: '📄', sh: '⚡', yaml: '⚙', yml: '⚙',
    xml: '📰', sql: '🗃', scss: '🎨', less: '🎨', c: '🔧',
    cpp: '🔧', jsx: '⚛', tsx: '⚛', rb: '💎', php: '🐘',
    swift: '🦅', kt: '🟣', dart: '🎯', r: '📊', lua: '🌙',
    toml: '⚙', ini: '⚙', env: '🔒', dockerfile: '🐳',
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
    rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin', dart: 'dart',
    r: 'r', lua: 'lua', toml: 'plaintext', ini: 'ini',
  };
  return map[ext] || 'plaintext';
}

function getLanguageLabel(filename: string): string {
  const lang = getLanguage(filename);
  const labels: Record<string, string> = {
    javascript: 'JavaScript', typescript: 'TypeScript', json: 'JSON',
    html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less',
    markdown: 'Markdown', python: 'Python', go: 'Go', rust: 'Rust',
    java: 'Java', c: 'C', cpp: 'C++', xml: 'XML', yaml: 'YAML',
    shell: 'Shell', sql: 'SQL', plaintext: 'Plain Text', ruby: 'Ruby',
    php: 'PHP', swift: 'Swift', kotlin: 'Kotlin', dart: 'Dart',
    r: 'R', lua: 'Lua', ini: 'INI',
  };
  return labels[lang] || lang;
}

function notify(message: string, type: ToastMsg['type'] = 'info') {
  const toast: ToastMsg = { message, type };
  toasts.value.push(toast);
  setTimeout(() => {
    const idx = toasts.value.indexOf(toast);
    if (idx !== -1) toasts.value.splice(idx, 1);
  }, 3000);
}

// ─── Tab Management ─────────────────────────────────
function getOrCreateTab(filename: string): Tab {
  let tab = openTabs.value.find(t => t.name === filename);
  if (!tab) {
    tab = { name: filename, modified: false };
    openTabs.value.push(tab);
  }
  return tab;
}

async function switchToTab(filename: string) {
  if (currentFile.value === filename) return;
  await openFile(filename);
}

async function closeTab(filename: string) {
  const idx = openTabs.value.findIndex(t => t.name === filename);
  if (idx === -1) return;

  // Save before closing if modified
  const tab = openTabs.value[idx];
  if (tab.modified && editor && currentFile.value === filename) {
    await saveCurrentFile();
  }

  // Dispose model
  const model = fileModels.get(filename);
  if (model) {
    model.dispose();
    fileModels.delete(filename);
  }

  openTabs.value.splice(idx, 1);

  if (currentFile.value === filename) {
    if (openTabs.value.length > 0) {
      const nextIdx = Math.min(idx, openTabs.value.length - 1);
      await openFile(openTabs.value[nextIdx].name);
    } else {
      currentFile.value = null;
    }
  }
}

// ─── File Operations ────────────────────────────────
async function refreshFiles() {
  files.value = await listFiles();
}

async function createNewFile() {
  showCommandPalette.value = false;
  const name = prompt('Enter file name:');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  await saveFile(trimmed, '');
  await refreshFiles();
  await openFile(trimmed);
  notify(`Created ${trimmed}`, 'success');
}

async function openFile(filename: string) {
  // Save current file before switching
  if (currentFile.value && editor) {
    await saveCurrentFile();
  }

  getOrCreateTab(filename);
  currentFile.value = filename;
  showCommandPalette.value = false;

  // Load content from OPFS if not already in model cache
  let model = fileModels.get(filename);
  if (!model) {
    const content = await loadFile(filename) || '';
    await nextTick();
    if (!monacoModule) {
      await initEditor(content, filename);
      return;
    }
    const uri = monacoModule.Uri.parse(`file:///${filename}`);
    model = monacoModule.editor.createModel(content, getLanguage(filename), uri);
    fileModels.set(filename, model);
  }

  await nextTick();

  if (!editor && monacoContainer.value) {
    await initEditor('', filename);
  }

  if (editor && model) {
    isLoadingFile = true;
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

  // Create initial model if not cached
  let model = fileModels.get(filename);
  if (!model) {
    const uri = monacoModule.Uri.parse(`file:///${filename}`);
    model = monacoModule.editor.createModel(content, getLanguage(filename), uri);
    fileModels.set(filename, model);
  }

  editor = monacoModule.editor.create(monacoContainer.value!, {
    model,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: wordWrapEnabled.value ? 'on' : 'off',
    tabSize: editorTabSize.value,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    padding: { top: 8 },
    suggest: { showMethods: true, showFunctions: true, showConstructors: true },
    parameterHints: { enabled: true },
    folding: true,
    foldingStrategy: 'indentation',
    showFoldingControls: 'mouseover',
    matchBrackets: 'always',
    occurrencesHighlight: 'singleFile',
    renderLineHighlight: 'all',
    colorDecorators: true,
    linkedEditing: true,
  });

  editor.onDidChangeModelContent(() => {
    if (isLoadingFile) return;
    const tab = openTabs.value.find(t => t.name === currentFile.value);
    if (tab) tab.modified = true;
    scheduleSave();
  });

  editor.onDidChangeCursorPosition((e: any) => {
    cursorLine.value = e.position.lineNumber;
    cursorColumn.value = e.position.column;
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
    const tab = openTabs.value.find(t => t.name === currentFile.value);
    if (tab) tab.modified = false;
  } catch (e) {
    console.warn('Failed to save to OPFS:', e);
    saveStatus.value = 'idle';
    notify('Failed to save file', 'error');
  }
}

async function removeFile(filename: string) {
  contextMenu.show = false;
  if (!confirm(`Delete "${filename}"?`)) return;
  await deleteFile(filename);

  // Close tab if open
  const tabIdx = openTabs.value.findIndex(t => t.name === filename);
  if (tabIdx !== -1) {
    const model = fileModels.get(filename);
    if (model) { model.dispose(); fileModels.delete(filename); }
    openTabs.value.splice(tabIdx, 1);
  }

  if (currentFile.value === filename) {
    if (openTabs.value.length > 0) {
      await openFile(openTabs.value[0].name);
    } else {
      currentFile.value = null;
    }
  }

  await refreshFiles();
  notify(`Deleted ${filename}`, 'info');
}

// ─── Rename ─────────────────────────────────────────
function startRenaming(filename: string) {
  renamingFile.value = filename;
  renameValue.value = filename;
  nextTick(() => {
    const input = renameInput.value;
    if (Array.isArray(input) && input[0]) {
      input[0].focus();
      input[0].select();
    } else if (input && !Array.isArray(input)) {
      (input as HTMLInputElement).focus();
      (input as HTMLInputElement).select();
    }
  });
}

function cancelRename() {
  renamingFile.value = null;
  renameValue.value = '';
}

async function finishRename() {
  const oldName = renamingFile.value;
  const newName = renameValue.value.trim();
  renamingFile.value = null;

  if (!oldName || !newName || oldName === newName) return;

  const success = await renameFile(oldName, newName);
  if (!success) {
    notify('Failed to rename file', 'error');
    return;
  }

  // Update tab
  const tab = openTabs.value.find(t => t.name === oldName);
  if (tab) {
    tab.name = newName;
    // Update model
    const model = fileModels.get(oldName);
    if (model) {
      fileModels.delete(oldName);
      const content = model.getValue();
      model.dispose();
      if (monacoModule) {
        const uri = monacoModule.Uri.parse(`file:///${newName}`);
        const newModel = monacoModule.editor.createModel(content, getLanguage(newName), uri);
        fileModels.set(newName, newModel);
        if (currentFile.value === oldName && editor) {
          isLoadingFile = true;
          editor.setModel(newModel);
          isLoadingFile = false;
        }
      }
    }
  }

  if (currentFile.value === oldName) currentFile.value = newName;
  await refreshFiles();
  notify(`Renamed to ${newName}`, 'success');
}

// ─── Context Menu ───────────────────────────────────
function showFileContextMenu(event: MouseEvent, filename: string) {
  contextMenu.show = true;
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.file = filename;
}

function renameFileFromContext() {
  const file = contextMenu.file;
  contextMenu.show = false;
  startRenaming(file);
}

async function duplicateFileFromContext() {
  const file = contextMenu.file;
  contextMenu.show = false;
  const content = await loadFile(file) || '';
  const ext = file.includes('.') ? '.' + file.split('.').pop() : '';
  const base = file.includes('.') ? file.slice(0, file.lastIndexOf('.')) : file;
  const newName = `${base}-copy${ext}`;
  await saveFile(newName, content);
  await refreshFiles();
  await openFile(newName);
  notify(`Duplicated as ${newName}`, 'success');
}

function deleteFileFromContext() {
  const file = contextMenu.file;
  contextMenu.show = false;
  removeFile(file);
}

// ─── Command Palette ────────────────────────────────
function openCommandPalette(mode: 'commands' | 'files') {
  paletteMode.value = mode;
  paletteQuery.value = '';
  paletteIndex.value = 0;
  showCommandPalette.value = true;
  nextTick(() => paletteInput.value?.focus());
}

function executePaletteSelection() {
  const items = filteredPaletteItems.value;
  if (items.length > 0 && paletteIndex.value < items.length) {
    executePaletteItem(items[paletteIndex.value]);
  }
}

function executePaletteItem(item: PaletteItem) {
  showCommandPalette.value = false;
  item.action();
}

// ─── Search ─────────────────────────────────────────
function openSidebarSearch() {
  sidebarVisible.value = true;
  activePanel.value = 'search';
  nextTick(() => sidebarSearchInput.value?.focus());
}

async function performSearch() {
  if (!searchQuery.value) return;
  searchResults.value = await searchInFiles(searchQuery.value);
}

async function performSidebarSearch() {
  if (!sidebarSearchQuery.value) {
    sidebarSearchResults.value = [];
    sidebarSearchDone.value = false;
    return;
  }
  sidebarSearchResults.value = await searchInFiles(sidebarSearchQuery.value);
  sidebarSearchDone.value = true;
}

async function openSearchResult(result: SearchResult) {
  showSearchPanel.value = false;
  await openFile(result.file);
  if (editor) {
    editor.revealLineInCenter(result.line);
    editor.setPosition({ lineNumber: result.line, column: 1 });
    editor.focus();
  }
}

async function openSearchResultFromSidebar(result: SearchResult) {
  await openFile(result.file);
  if (editor) {
    editor.revealLineInCenter(result.line);
    editor.setPosition({ lineNumber: result.line, column: 1 });
    editor.focus();
  }
}

// ─── Editor Controls ────────────────────────────────
function toggleWordWrap() {
  wordWrapEnabled.value = !wordWrapEnabled.value;
  if (editor) {
    editor.updateOptions({ wordWrap: wordWrapEnabled.value ? 'on' : 'off' });
  }
}

function toggleMinimap() {
  if (editor) {
    const current = editor.getOption(monacoModule.editor.EditorOption.minimap);
    editor.updateOptions({ minimap: { enabled: !current.enabled } });
  }
}

function setTabSize(size: number) {
  editorTabSize.value = size;
  if (editor) {
    editor.getModel()?.updateOptions({ tabSize: size });
  }
}

function togglePanel(panel: 'explorer' | 'search') {
  if (activePanel.value === panel && sidebarVisible.value) {
    sidebarVisible.value = false;
  } else {
    activePanel.value = panel;
    sidebarVisible.value = true;
    if (panel === 'search') {
      nextTick(() => sidebarSearchInput.value?.focus());
    }
  }
}

// ─── Keyboard Shortcuts ─────────────────────────────
function handleKeydown(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  if (ctrl && shift && e.key === 'P') {
    e.preventDefault();
    openCommandPalette('commands');
  } else if (ctrl && !shift && e.key === 'p') {
    e.preventDefault();
    openCommandPalette('files');
  } else if (ctrl && e.key === 'n') {
    e.preventDefault();
    createNewFile();
  } else if (ctrl && e.key === 's') {
    e.preventDefault();
    saveCurrentFile();
  } else if (ctrl && e.key === 'w') {
    e.preventDefault();
    if (currentFile.value) closeTab(currentFile.value);
  } else if (ctrl && shift && e.key === 'F') {
    e.preventDefault();
    openSidebarSearch();
  } else if (ctrl && e.key === 'b') {
    e.preventDefault();
    sidebarVisible.value = !sidebarVisible.value;
  } else if (e.key === 'F2' && currentFile.value) {
    e.preventDefault();
    startRenaming(currentFile.value);
  }
}

// ─── Lifecycle ──────────────────────────────────────
onMounted(async () => {
  await refreshFiles();
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (saveTimeout) clearTimeout(saveTimeout);
  if (editor) editor.dispose();
  for (const model of fileModels.values()) {
    model.dispose();
  }
  fileModels.clear();
});
</script>

<style scoped>
/* ─── Layout ───────────────────────────────────── */
.page {
  display: flex;
  width: 100%;
  height: 100vh;
  background: #1e1e1e;
  color: #cccccc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
}

/* ─── Activity Bar ─────────────────────────────── */
.activity-bar {
  width: 48px;
  min-width: 48px;
  background: #333333;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
  gap: 2px;
  border-right: 1px solid #252526;
}

.activity-btn {
  width: 48px;
  height: 48px;
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 2px solid transparent;
  transition: color 0.15s;
}

.activity-btn:hover {
  color: #ffffff;
}

.activity-btn.active {
  color: #ffffff;
  border-left-color: #ffffff;
}

.activity-spacer {
  flex: 1;
}

/* ─── Sidebar ──────────────────────────────────── */
.sidebar {
  width: 260px;
  min-width: 260px;
  background: #252526;
  border-right: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 35px;
  min-height: 35px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #bbbbbb;
}

.sidebar-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  border-radius: 3px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
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
  padding: 0 12px;
  height: 22px;
  cursor: pointer;
  font-size: 13px;
  gap: 4px;
  user-select: none;
}

.file-item:hover {
  background: #2a2d2e;
}

.file-item.active {
  background: #37373d;
  color: #ffffff;
}

.file-icon {
  font-size: 12px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  background: #3c3c3c;
  color: #cccccc;
  border: 1px solid #007acc;
  outline: none;
  font-size: 13px;
  padding: 0 4px;
  height: 20px;
  font-family: inherit;
}

.delete-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 14px;
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
  padding: 16px 12px;
  text-align: center;
  color: #666;
  font-size: 12px;
  line-height: 1.6;
}

/* ─── Sidebar Search ───────────────────────────── */
.sidebar-search {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.sidebar-search-field {
  width: 100%;
  background: #3c3c3c;
  color: #cccccc;
  border: 1px solid #3c3c3c;
  outline: none;
  padding: 4px 8px;
  font-size: 13px;
  border-radius: 2px;
}

.sidebar-search-field:focus {
  border-color: #007acc;
}

.search-results-list {
  flex: 1;
  overflow-y: auto;
}

.search-results-count {
  font-size: 11px;
  color: #888;
  padding: 4px 0;
}

.search-result-entry {
  padding: 4px 0;
  cursor: pointer;
  border-bottom: 1px solid #3c3c3c;
}

.search-result-entry:hover {
  background: #2a2d2e;
}

.search-result-header {
  font-size: 12px;
  color: #e8a838;
  font-weight: 500;
}

.search-result-preview {
  font-size: 12px;
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-top: 2px;
}

.search-empty-hint {
  font-size: 12px;
  color: #666;
  padding: 8px 0;
  text-align: center;
}

/* ─── Main Area ────────────────────────────────── */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* ─── Tab Bar ──────────────────────────────────── */
.tab-bar {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #1e1e1e;
  overflow-x: auto;
  min-height: 35px;
  max-height: 35px;
}

.tab-bar::-webkit-scrollbar {
  height: 3px;
}

.tab-bar::-webkit-scrollbar-thumb {
  background: #555;
}

.tab {
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 35px;
  cursor: pointer;
  font-size: 13px;
  gap: 6px;
  border-right: 1px solid #1e1e1e;
  background: #2d2d2d;
  color: #969696;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 0;
}

.tab:hover {
  background: #2d2d2d;
}

.tab.active {
  background: #1e1e1e;
  color: #ffffff;
  border-bottom: 1px solid #1e1e1e;
  margin-bottom: -1px;
}

.tab-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-dot {
  color: #e8a838;
  font-size: 14px;
  flex-shrink: 0;
}

.tab-close {
  background: none;
  border: none;
  color: transparent;
  font-size: 16px;
  cursor: pointer;
  padding: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  flex-shrink: 0;
}

.tab:hover .tab-close {
  color: #969696;
}

.tab-close:hover {
  background: #3c3c3c;
  color: #ffffff;
}

/* ─── Breadcrumbs ──────────────────────────────── */
.breadcrumbs {
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 22px;
  min-height: 22px;
  font-size: 12px;
  background: #1e1e1e;
  border-bottom: 1px solid #2d2d2d;
  gap: 4px;
  color: #969696;
}

.breadcrumb-item {
  cursor: pointer;
}

.breadcrumb-item:hover {
  color: #cccccc;
}

.breadcrumb-sep {
  color: #555;
}

.breadcrumb-lang {
  color: #777;
}

/* ─── Editor ───────────────────────────────────── */
#monaco-container {
  flex: 1;
  overflow: hidden;
}

/* ─── Status Bar ───────────────────────────────── */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 22px;
  min-height: 22px;
  background: #007acc;
  color: #ffffff;
  font-size: 12px;
  padding: 0 8px;
}

.status-left, .status-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.status-item {
  padding: 0 6px;
  height: 22px;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.status-item.clickable {
  cursor: pointer;
}

.status-item.clickable:hover {
  background: rgba(255,255,255,0.12);
}

.save-indicator {
  font-weight: 500;
}

/* ─── Welcome Page ─────────────────────────────── */
.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e1e1e;
  overflow-y: auto;
}

.welcome-content {
  text-align: center;
  max-width: 600px;
  padding: 2rem;
}

.welcome-logo {
  font-size: 4rem;
  margin-bottom: 0.5rem;
}

.welcome-content h1 {
  font-size: 2rem;
  margin-bottom: 0.25rem;
  font-weight: 300;
  color: #cccccc;
}

.welcome-subtitle {
  color: #666;
  margin-bottom: 2rem;
  font-size: 1rem;
}

.welcome-sections {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  text-align: left;
}

.welcome-section h3 {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  margin-bottom: 0.5rem;
}

.welcome-link {
  font-size: 0.85rem;
  color: #3794ff;
  cursor: pointer;
  padding: 2px 0;
}

.welcome-link:hover {
  text-decoration: underline;
}

.welcome-hint {
  font-size: 0.8rem;
  color: #555;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 0.8rem;
}

.shortcut-row span {
  color: #999;
}

kbd {
  background: #333;
  border: 1px solid #555;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 0.75rem;
  font-family: monospace;
  color: #ccc;
  white-space: nowrap;
}

/* ─── Command Palette ──────────────────────────── */
.palette-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  padding-top: 15vh;
}

.palette {
  width: 500px;
  max-width: 90vw;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  overflow: hidden;
  max-height: 350px;
  display: flex;
  flex-direction: column;
}

.palette-input {
  width: 100%;
  background: #3c3c3c;
  color: #cccccc;
  border: none;
  outline: none;
  padding: 10px 14px;
  font-size: 14px;
}

.palette-results {
  overflow-y: auto;
  flex: 1;
}

.palette-item {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  cursor: pointer;
  gap: 10px;
  font-size: 13px;
}

.palette-item:hover, .palette-item.active {
  background: #062f4a;
}

.palette-icon {
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  font-size: 12px;
}

.palette-label {
  flex: 1;
}

.palette-shortcut {
  font-size: 11px;
  color: #888;
  background: #333;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid #555;
  font-family: monospace;
}

.palette-empty {
  padding: 12px 14px;
  color: #666;
  font-size: 13px;
}

/* ─── Search Panel ─────────────────────────────── */
.search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 900;
  display: flex;
  justify-content: center;
  padding-top: 15vh;
}

.search-panel {
  width: 500px;
  max-width: 90vw;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  overflow: hidden;
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

.search-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid #3c3c3c;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
}

.close-btn:hover {
  color: #ccc;
}

.search-input-row {
  display: flex;
  padding: 8px 14px;
  gap: 8px;
}

.search-field {
  flex: 1;
  background: #3c3c3c;
  color: #cccccc;
  border: 1px solid #3c3c3c;
  outline: none;
  padding: 6px 10px;
  font-size: 13px;
  border-radius: 2px;
}

.search-field:focus {
  border-color: #007acc;
}

.search-go-btn {
  background: #007acc;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 13px;
}

.search-go-btn:hover {
  background: #005a9e;
}

.search-results {
  overflow-y: auto;
  flex: 1;
  padding: 0 14px 8px;
}

.search-empty {
  color: #666;
  font-size: 13px;
  padding: 8px 0;
}

.search-result-item {
  padding: 6px 0;
  cursor: pointer;
  border-bottom: 1px solid #333;
}

.search-result-item:hover {
  background: #2a2d2e;
}

.search-result-file {
  font-size: 12px;
  color: #e8a838;
  font-weight: 500;
}

.search-result-text {
  display: block;
  font-size: 12px;
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── Context Menu ─────────────────────────────── */
.context-menu {
  position: fixed;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  z-index: 2000;
  min-width: 160px;
  padding: 4px 0;
}

.context-item {
  padding: 6px 20px;
  font-size: 13px;
  cursor: pointer;
  color: #cccccc;
}

.context-item:hover {
  background: #094771;
}

.context-item.danger:hover {
  background: #5a1d1d;
  color: #e06c75;
}

.context-separator {
  height: 1px;
  background: #3c3c3c;
  margin: 4px 0;
}

.click-blocker {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1999;
}

/* ─── Toast Notifications ──────────────────────── */
.toast-container {
  position: fixed;
  bottom: 30px;
  right: 12px;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toast {
  background: #333;
  color: #ccc;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  animation: slideIn 0.2s ease-out;
  border-left: 3px solid #007acc;
}

.toast.success { border-left-color: #22c55e; }
.toast.error { border-left-color: #e06c75; }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>
