<template>
  <div class="page" @contextmenu.prevent>
    <!-- Notification toasts -->
    <div class="toast-container">
      <div
        v-for="(toast, i) in toasts"
        :key="i"
        class="toast"
        :class="toast.type"
      ><i :class="'codicon codicon-' + (toast.type === 'error' ? 'error' : toast.type === 'success' ? 'check' : 'info')"></i> {{ toast.message }}</div>
    </div>

    <!-- Command palette overlay -->
    <div v-if="showCommandPalette" class="palette-overlay" @click.self="showCommandPalette = false">
      <div class="palette">
        <div class="palette-input-row">
          <i class="codicon codicon-search palette-input-icon"></i>
          <input
            ref="paletteInput"
            v-model="paletteQuery"
            class="palette-input"
            :placeholder="paletteMode === 'commands' ? '> Type a command...' : 'Type to search files...'"
            @keydown.escape="showCommandPalette = false"
            @keydown.enter="executePaletteSelection"
            @keydown.down.prevent="paletteIndex = Math.min(paletteIndex + 1, filteredPaletteItems.length - 1)"
            @keydown.up.prevent="paletteIndex = Math.max(paletteIndex - 1, 0)"
          />
        </div>
        <div class="palette-results">
          <div
            v-for="(item, idx) in filteredPaletteItems"
            :key="idx"
            class="palette-item"
            :class="{ active: idx === paletteIndex }"
            @click="executePaletteItem(item)"
            @mouseenter="paletteIndex = idx"
          >
            <i :class="'codicon codicon-' + item.codicon" class="palette-item-icon"></i>
            <span class="palette-label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="palette-shortcut">{{ item.shortcut }}</span>
          </div>
          <div v-if="filteredPaletteItems.length === 0" class="palette-empty">No results found</div>
        </div>
      </div>
    </div>

    <!-- Context menu -->
    <div
      v-if="contextMenu.show"
      class="context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <div class="context-item" @click="renameFileFromContext"><i class="codicon codicon-edit"></i> Rename</div>
      <div class="context-item" @click="duplicateFileFromContext"><i class="codicon codicon-copy"></i> Duplicate</div>
      <div class="context-separator"></div>
      <div class="context-item danger" @click="deleteFileFromContext"><i class="codicon codicon-trash"></i> Delete</div>
    </div>

    <!-- Activity bar (from VS Code's workbench) -->
    <div class="activity-bar">
      <button
        class="activity-btn"
        :class="{ active: activePanel === 'explorer' && sidebarVisible }"
        title="Explorer (Ctrl+Shift+E)"
        @click="togglePanel('explorer')"
      >
        <i class="codicon codicon-files"></i>
      </button>
      <button
        class="activity-btn"
        :class="{ active: activePanel === 'search' && sidebarVisible }"
        title="Search (Ctrl+Shift+F)"
        @click="togglePanel('search')"
      >
        <i class="codicon codicon-search"></i>
      </button>
      <button
        class="activity-btn"
        :class="{ active: activePanel === 'extensions' && sidebarVisible }"
        title="Extensions (Ctrl+Shift+X)"
        @click="togglePanel('extensions')"
      >
        <i class="codicon codicon-extensions"></i>
      </button>
      <div class="activity-spacer"></div>
      <button
        class="activity-btn"
        title="Command Palette"
        @click="openCommandPalette('commands')"
      >
        <i class="codicon codicon-settings-gear"></i>
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
              <i class="codicon codicon-new-file"></i>
            </button>
            <button class="icon-btn" title="Collapse Sidebar" @click="sidebarVisible = false">
              <i class="codicon codicon-panel-left"></i>
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
            <i :class="'codicon codicon-' + getCodiconForFile(file)" class="file-codicon"></i>
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
            ><i class="codicon codicon-close"></i></button>
          </div>
          <div v-if="files.length === 0" class="empty-hint">
            <i class="codicon codicon-new-file"></i><br/>
            No files yet.<br />Press <kbd>Ctrl+N</kbd> to create one.
          </div>
        </div>
      </template>

      <!-- Search panel -->
      <template v-if="activePanel === 'search'">
        <div class="sidebar-header">
          <span class="sidebar-title">SEARCH</span>
        </div>
        <div class="sidebar-search">
          <div class="search-input-wrapper">
            <i class="codicon codicon-search search-icon"></i>
            <input
              ref="sidebarSearchInput"
              v-model="sidebarSearchQuery"
              class="sidebar-search-field"
              placeholder="Search"
              @keydown.enter="performSidebarSearch"
              @keydown.escape="sidebarSearchQuery = ''; sidebarSearchResults = []"
            />
          </div>
          <div class="search-results-list">
            <template v-if="sidebarSearchResults.length > 0">
              <div class="search-results-count">{{ sidebarSearchResults.length }} result{{ sidebarSearchResults.length !== 1 ? 's' : '' }} in files</div>
              <div
                v-for="(result, idx) in sidebarSearchResults"
                :key="idx"
                class="search-result-entry"
                @click="openSearchResultFromSidebar(result)"
              >
                <div class="search-result-header"><i class="codicon codicon-file"></i> {{ result.file }}:{{ result.line }}</div>
                <div class="search-result-preview">{{ result.text.trim().substring(0, 120) }}</div>
              </div>
            </template>
            <div v-else-if="sidebarSearchQuery && sidebarSearchDone" class="search-empty-hint">
              <i class="codicon codicon-info"></i> No results found
            </div>
          </div>
        </div>
      </template>

      <!-- Extensions panel -->
      <template v-if="activePanel === 'extensions'">
        <div class="sidebar-header">
          <span class="sidebar-title">EXTENSIONS</span>
          <div class="sidebar-actions">
            <button class="icon-btn" title="Refresh" @click="refreshExtensionState">
              <i class="codicon codicon-refresh"></i>
            </button>
          </div>
        </div>
        <div class="ext-search-wrapper">
          <div class="search-input-wrapper">
            <i class="codicon codicon-search search-icon"></i>
            <input
              v-model="extSearchQuery"
              class="sidebar-search-field"
              placeholder="Search Extensions in Marketplace"
            />
          </div>
        </div>
        <!-- Category filter -->
        <div class="ext-category-bar">
          <button
            class="ext-cat-btn"
            :class="{ active: extCategoryFilter === '' }"
            @click="extCategoryFilter = ''"
          >All</button>
          <button
            v-for="cat in extCategories"
            :key="cat"
            class="ext-cat-btn"
            :class="{ active: extCategoryFilter === cat }"
            @click="extCategoryFilter = cat"
          >{{ cat }}</button>
        </div>
        <!-- Installed extensions -->
        <div v-if="installedExtensions.length > 0 && !extSearchQuery && !extCategoryFilter" class="ext-section-label">
          <i class="codicon codicon-check"></i> Installed
        </div>
        <div class="ext-list">
          <template v-if="!extSearchQuery && !extCategoryFilter">
            <div
              v-for="ext in installedExtensions"
              :key="ext.id"
              class="ext-item"
              :class="{ selected: selectedExt?.id === ext.id }"
              @click="selectedExt = ext"
            >
              <div class="ext-icon"><i :class="'codicon codicon-' + ext.codicon"></i></div>
              <div class="ext-info">
                <div class="ext-name">{{ ext.displayName }}</div>
                <div class="ext-publisher">{{ ext.publisher }}</div>
              </div>
              <div class="ext-badge installed"><i class="codicon codicon-check"></i></div>
            </div>
            <div v-if="filteredCatalog.length > 0" class="ext-section-label">
              <i class="codicon codicon-cloud-download"></i> Marketplace
            </div>
          </template>
          <div
            v-for="ext in filteredCatalog"
            :key="ext.id"
            class="ext-item"
            :class="{ selected: selectedExt?.id === ext.id }"
            @click="selectedExt = ext"
          >
            <div class="ext-icon"><i :class="'codicon codicon-' + ext.codicon"></i></div>
            <div class="ext-info">
              <div class="ext-name">{{ ext.displayName }}</div>
              <div class="ext-publisher">{{ ext.publisher }}</div>
            </div>
            <div v-if="isInstalled(ext.id)" class="ext-badge installed"><i class="codicon codicon-check"></i></div>
          </div>
          <div v-if="filteredCatalog.length === 0 && installedExtensions.length === 0" class="ext-empty">
            No extensions found
          </div>
        </div>
        <!-- Extension detail view -->
        <div v-if="selectedExt" class="ext-detail">
          <div class="ext-detail-header">
            <div class="ext-detail-icon"><i :class="'codicon codicon-' + selectedExt.codicon"></i></div>
            <div class="ext-detail-meta">
              <div class="ext-detail-name">{{ selectedExt.displayName }}</div>
              <div class="ext-detail-pub">{{ selectedExt.publisher }} · v{{ selectedExt.version }}</div>
            </div>
          </div>
          <div class="ext-detail-desc">{{ selectedExt.description }}</div>
          <div class="ext-detail-stats">
            <span><i class="codicon codicon-cloud-download"></i> {{ selectedExt.downloads }}</span>
            <span><i class="codicon codicon-star-full"></i> {{ selectedExt.rating }}</span>
            <span class="ext-detail-cat">{{ selectedExt.category }}</span>
          </div>
          <div class="ext-detail-actions">
            <button
              v-if="!isInstalled(selectedExt.id)"
              class="ext-btn install"
              @click="installExtension(selectedExt.id)"
            ><i class="codicon codicon-cloud-download"></i> Install</button>
            <template v-else>
              <button
                v-if="isEnabled(selectedExt.id)"
                class="ext-btn disable"
                @click="disableExtension(selectedExt.id)"
              ><i class="codicon codicon-circle-slash"></i> Disable</button>
              <button
                v-else
                class="ext-btn enable"
                @click="enableExtension(selectedExt.id)"
              ><i class="codicon codicon-check"></i> Enable</button>
              <button
                class="ext-btn uninstall"
                @click="uninstallExtension(selectedExt.id)"
              ><i class="codicon codicon-trash"></i> Uninstall</button>
            </template>
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
          <i :class="'codicon codicon-' + getCodiconForFile(tab.name)" class="tab-codicon"></i>
          <span class="tab-label">{{ tab.name }}</span>
          <span v-if="tab.modified" class="tab-dot"><i class="codicon codicon-circle-filled"></i></span>
          <button class="tab-close" @click.stop="closeTab(tab.name)"><i class="codicon codicon-close"></i></button>
        </div>
      </div>

      <!-- Breadcrumbs -->
      <div v-if="currentFile" class="breadcrumbs">
        <i class="codicon codicon-home breadcrumb-home" @click="togglePanel('explorer')"></i>
        <i class="codicon codicon-chevron-right breadcrumb-sep"></i>
        <i :class="'codicon codicon-' + getCodiconForFile(currentFile)" class="breadcrumb-icon"></i>
        <span class="breadcrumb-item">{{ currentFile }}</span>
        <i class="codicon codicon-chevron-right breadcrumb-sep"></i>
        <span class="breadcrumb-lang">{{ getLanguageLabel(currentFile) }}</span>
      </div>

      <!-- Editor -->
      <div v-show="currentFile" id="monaco-container" ref="monacoContainer"></div>

      <!-- Welcome page -->
      <div v-if="!currentFile" class="welcome">
        <div class="welcome-content">
          <div class="welcome-logo"><i class="codicon codicon-code welcome-code-icon"></i></div>
          <h1>Visual Studio Code</h1>
          <p class="welcome-subtitle">Editing evolved</p>

          <div class="welcome-sections">
            <div class="welcome-section">
              <h3><i class="codicon codicon-rocket"></i> Start</h3>
              <div class="welcome-link" @click="createNewFile"><i class="codicon codicon-new-file"></i> New File...</div>
              <div class="welcome-link" @click="openCommandPalette('files')"><i class="codicon codicon-folder-opened"></i> Open File...</div>
              <div class="welcome-link" @click="openCommandPalette('commands')"><i class="codicon codicon-terminal"></i> Command Palette...</div>
            </div>
            <div class="welcome-section">
              <h3><i class="codicon codicon-history"></i> Recent</h3>
              <template v-if="files.length > 0">
                <div
                  v-for="file in files.slice(0, 5)"
                  :key="file"
                  class="welcome-link"
                  @click="openFile(file)"
                ><i :class="'codicon codicon-' + getCodiconForFile(file)"></i> {{ file }}</div>
              </template>
              <div v-else class="welcome-hint">No recent files</div>
            </div>
            <div class="welcome-section">
              <h3><i class="codicon codicon-keyboard"></i> Shortcuts</h3>
              <div class="shortcut-row"><kbd>Ctrl+Shift+P</kbd> <span>Command Palette</span></div>
              <div class="shortcut-row"><kbd>Ctrl+P</kbd> <span>Quick Open File</span></div>
              <div class="shortcut-row"><kbd>Ctrl+N</kbd> <span>New File</span></div>
              <div class="shortcut-row"><kbd>Ctrl+S</kbd> <span>Save File</span></div>
              <div class="shortcut-row"><kbd>Ctrl+W</kbd> <span>Close Tab</span></div>
              <div class="shortcut-row"><kbd>Ctrl+Shift+F</kbd> <span>Search in Files</span></div>
              <div class="shortcut-row"><kbd>Ctrl+B</kbd> <span>Toggle Sidebar</span></div>
              <div class="shortcut-row"><kbd>Ctrl+`</kbd> <span>Toggle Terminal</span></div>
              <div class="shortcut-row"><kbd>F2</kbd> <span>Rename File</span></div>
            </div>
          </div>

          <div class="welcome-footer">
            <span class="welcome-powered">
              Powered by
              <a href="https://github.com/microsoft/monaco-editor" target="_blank">Monaco Editor</a>,
              <a href="https://github.com/microsoft/vscode-codicons" target="_blank">@vscode/codicons</a>,
              and <a href="https://github.com/xtermjs/xterm.js" target="_blank">xterm.js</a>
              from the VS Code ecosystem
            </span>
          </div>
        </div>
      </div>

      <!-- Terminal panel (xterm.js — VS Code's integrated terminal) -->
      <div v-if="terminalVisible" class="terminal-panel">
        <div class="terminal-header">
          <div class="terminal-tabs">
            <div class="terminal-tab active"><i class="codicon codicon-terminal"></i> Terminal</div>
          </div>
          <div class="terminal-actions">
            <button class="terminal-action-btn" title="Clear" @click="clearTerminal">
              <i class="codicon codicon-clear-all"></i>
            </button>
            <button class="terminal-action-btn" title="Close Panel" @click="terminalVisible = false">
              <i class="codicon codicon-close"></i>
            </button>
          </div>
        </div>
        <div ref="terminalContainer" class="terminal-body"></div>
      </div>

      <!-- Status bar -->
      <div class="status-bar">
        <div class="status-left">
          <span v-if="currentFile" class="status-item">
            <i class="codicon codicon-text-size"></i> Ln {{ cursorLine }}, Col {{ cursorColumn }}
          </span>
          <span v-if="currentFile" class="status-item">
            Spaces: {{ editorTabSize }}
          </span>
        </div>
        <div class="status-right">
          <span class="status-item clickable" @click="terminalVisible = !terminalVisible" title="Toggle Terminal">
            <i class="codicon codicon-terminal"></i>
          </span>
          <span class="status-item clickable" @click="toggleWordWrap">
            {{ wordWrapEnabled ? 'Word Wrap' : 'No Wrap' }}
          </span>
          <span v-if="currentFile" class="status-item">
            {{ getLanguageLabel(currentFile) }}
          </span>
          <span class="status-item">UTF-8</span>
          <span class="status-item save-indicator" :class="saveStatus">
            <i v-if="saveStatus !== 'idle'" :class="'codicon codicon-' + (saveStatus === 'saved' ? 'check' : 'sync')"></i>
            {{ saveStatusText }}
          </span>
        </div>
      </div>
    </div>

    <!-- Click blocker for context menu -->
    <div v-if="contextMenu.show" class="click-blocker" @click="contextMenu.show = false" @contextmenu.prevent="contextMenu.show = false"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
// VS Code ecosystem: xterm.js terminal emulator (used by VS Code's integrated terminal)
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  listFiles,
  saveFile,
  loadFile,
  deleteFile,
  renameFile,
  searchInFiles,
} from '~/composables/useOpfsStorage';
import {
  extensionCatalog,
  loadExtensionState,
  saveExtensionState,
  getCategories,
  defineCustomThemes,
  applyExtension,
  type Extension,
  type ExtensionState,
  type ExtensionCategory,
} from '~/composables/useExtensions';

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
  codicon: string;
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
const terminalContainer = ref<HTMLElement | null>(null);
const paletteInput = ref<HTMLInputElement | null>(null);
const sidebarSearchInput = ref<HTMLInputElement | null>(null);
const renameInput = ref<HTMLInputElement | null>(null);

const files = ref<string[]>([]);
const currentFile = ref<string | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');
const openTabs = ref<Tab[]>([]);
const sidebarVisible = ref(true);
const activePanel = ref<'explorer' | 'search' | 'extensions'>('explorer');
const cursorLine = ref(1);
const cursorColumn = ref(1);
const editorTabSize = ref(2);
const wordWrapEnabled = ref(true);
const terminalVisible = ref(false);

// Command palette
const showCommandPalette = ref(false);
const paletteQuery = ref('');
const paletteIndex = ref(0);
const paletteMode = ref<'commands' | 'files'>('commands');

// Search
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

// Terminal internals (xterm.js from VS Code)
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let terminalInputBuffer = '';
let terminalInitialized = false;

// Extensions state
const extSearchQuery = ref('');
const extCategoryFilter = ref('');
const selectedExt = ref<Extension | null>(null);
const extState = ref<ExtensionState>({ installed: [], enabled: [] });
const extCategories = getCategories();
const activeExtDisposers = new Map<string, () => void>();

// ─── Computed ───────────────────────────────────────
const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return 'Saved';
    case 'saving': return 'Saving...';
    default: return '';
  }
});

const commandList = computed<PaletteItem[]>(() => [
  { codicon: 'new-file', label: 'New File', shortcut: 'Ctrl+N', action: createNewFile },
  { codicon: 'save', label: 'Save File', shortcut: 'Ctrl+S', action: saveCurrentFile },
  { codicon: 'search', label: 'Search in Files', shortcut: 'Ctrl+Shift+F', action: () => openSidebarSearch() },
  { codicon: 'go-to-file', label: 'Quick Open File', shortcut: 'Ctrl+P', action: () => openCommandPalette('files') },
  { codicon: 'close', label: 'Close Tab', shortcut: 'Ctrl+W', action: () => currentFile.value && closeTab(currentFile.value) },
  { codicon: 'layout-sidebar-left', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => { sidebarVisible.value = !sidebarVisible.value } },
  { codicon: 'terminal', label: 'Toggle Terminal', shortcut: "Ctrl+`", action: () => toggleTerminal() },
  { codicon: 'word-wrap', label: 'Toggle Word Wrap', action: toggleWordWrap },
  { codicon: 'layout-sidebar-right', label: 'Toggle Minimap', action: toggleMinimap },
  { codicon: 'indent', label: 'Indent Using Spaces: 2', action: () => setTabSize(2) },
  { codicon: 'indent', label: 'Indent Using Spaces: 4', action: () => setTabSize(4) },
  { codicon: 'fold', label: 'Fold All', action: () => editorAction('editor.foldAll') },
  { codicon: 'unfold', label: 'Unfold All', action: () => editorAction('editor.unfoldAll') },
  { codicon: 'find', label: 'Find', shortcut: 'Ctrl+F', action: () => editorAction('actions.find') },
  { codicon: 'replace', label: 'Find and Replace', shortcut: 'Ctrl+H', action: () => editorAction('editor.action.startFindReplaceAction') },
  { codicon: 'go-to-file', label: 'Go to Line', shortcut: 'Ctrl+G', action: () => editorAction('editor.action.gotoLine') },
  { codicon: 'symbol-method', label: 'Format Document', shortcut: 'Shift+Alt+F', action: () => editorAction('editor.action.formatDocument') },
]);

const filteredPaletteItems = computed<PaletteItem[]>(() => {
  if (paletteMode.value === 'files') {
    const q = paletteQuery.value.toLowerCase();
    return files.value
      .filter(f => f.toLowerCase().includes(q))
      .map(f => ({
        codicon: getCodiconForFile(f),
        label: f,
        action: () => openFile(f),
      }));
  }
  const q = paletteQuery.value.toLowerCase();
  return commandList.value.filter(c => c.label.toLowerCase().includes(q));
});

watch(paletteQuery, () => { paletteIndex.value = 0; });

// ─── Codicon Helpers (from @vscode/codicons) ────────
function getCodiconForFile(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const base = filename.toLowerCase();
  // Special filenames
  if (base === 'package.json' || base === 'tsconfig.json') return 'json';
  if (base === 'dockerfile' || base.startsWith('docker')) return 'file-code';
  if (base === '.gitignore' || base === '.env') return 'gear';
  // By extension
  const map: Record<string, string> = {
    js: 'file-code', ts: 'file-code', jsx: 'file-code', tsx: 'file-code',
    json: 'json', html: 'file-code', htm: 'file-code', css: 'file-code',
    scss: 'file-code', less: 'file-code', md: 'markdown', py: 'file-code',
    go: 'file-code', rs: 'file-code', java: 'file-code', c: 'file-code',
    cpp: 'file-code', xml: 'file-code', yaml: 'file-code', yml: 'file-code',
    sh: 'terminal-bash', sql: 'database', vue: 'file-code', txt: 'file',
    rb: 'file-code', php: 'file-code', swift: 'file-code', kt: 'file-code',
    dart: 'file-code', r: 'file-code', lua: 'file-code', toml: 'gear',
    ini: 'gear', env: 'gear', svg: 'file-media', png: 'file-media',
    jpg: 'file-media', gif: 'file-media', ico: 'file-media',
  };
  return map[ext] || 'file';
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
    shell: 'Shell Script', sql: 'SQL', plaintext: 'Plain Text', ruby: 'Ruby',
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

// ─── Monaco Editor Actions (built-in VS Code commands) ──
function editorAction(actionId: string) {
  if (!editor) return;
  const action = editor.getAction(actionId);
  if (action) action.run();
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

  const tab = openTabs.value[idx];
  if (tab.modified && editor && currentFile.value === filename) {
    await saveCurrentFile();
  }

  const model = fileModels.get(filename);
  if (model) { model.dispose(); fileModels.delete(filename); }

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
  if (currentFile.value && editor) {
    await saveCurrentFile();
  }

  getOrCreateTab(filename);
  currentFile.value = filename;
  showCommandPalette.value = false;

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
  // Monaco Editor — the core editor component from microsoft/vscode
  monacoModule = await import('monaco-editor');

  (self as any).MonacoEnvironment = {
    getWorker() { return null as any; },
  };

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
    // VS Code default editor settings
    minimap: { enabled: true },
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
    fontLigatures: true,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: wordWrapEnabled.value ? 'on' : 'off',
    tabSize: editorTabSize.value,
    renderWhitespace: 'selection',
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    padding: { top: 8 },
    suggest: {
      showMethods: true, showFunctions: true, showConstructors: true,
      showFields: true, showVariables: true, showClasses: true,
      showStructs: true, showInterfaces: true, showModules: true,
      showProperties: true, showEvents: true, showOperators: true,
      showUnits: true, showValues: true, showConstants: true,
      showEnums: true, showEnumMembers: true, showKeywords: true,
      showWords: true, showColors: true, showFiles: true,
      showReferences: true, showSnippets: true,
    },
    parameterHints: { enabled: true },
    folding: true,
    foldingStrategy: 'indentation',
    showFoldingControls: 'mouseover',
    matchBrackets: 'always',
    occurrencesHighlight: 'singleFile',
    renderLineHighlight: 'all',
    colorDecorators: true,
    linkedEditing: true,
    stickyScroll: { enabled: true },
    inlayHints: { enabled: 'on' },
    quickSuggestions: { other: true, comments: false, strings: true },
    acceptSuggestionOnCommitCharacter: true,
    tabCompletion: 'on',
    snippetSuggestions: 'inline',
    formatOnPaste: true,
    formatOnType: true,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoIndent: 'full',
    dragAndDrop: true,
    links: true,
    mouseWheelZoom: true,
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
      input[0].focus(); input[0].select();
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
  if (!success) { notify('Failed to rename file', 'error'); return; }

  const tab = openTabs.value.find(t => t.name === oldName);
  if (tab) {
    tab.name = newName;
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

async function performSidebarSearch() {
  if (!sidebarSearchQuery.value) {
    sidebarSearchResults.value = [];
    sidebarSearchDone.value = false;
    return;
  }
  sidebarSearchResults.value = await searchInFiles(sidebarSearchQuery.value);
  sidebarSearchDone.value = true;
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
  if (editor) editor.updateOptions({ wordWrap: wordWrapEnabled.value ? 'on' : 'off' });
}

function toggleMinimap() {
  if (editor) {
    const current = editor.getOption(monacoModule.editor.EditorOption.minimap);
    editor.updateOptions({ minimap: { enabled: !current.enabled } });
  }
}

function setTabSize(size: number) {
  editorTabSize.value = size;
  if (editor) editor.getModel()?.updateOptions({ tabSize: size });
}

function togglePanel(panel: 'explorer' | 'search') {
  if (activePanel.value === panel && sidebarVisible.value) {
    sidebarVisible.value = false;
  } else {
    activePanel.value = panel;
    sidebarVisible.value = true;
    if (panel === 'search') nextTick(() => sidebarSearchInput.value?.focus());
  }
}

// ─── Terminal (xterm.js — VS Code's integrated terminal) ─
const TERM_PROMPT = '\r\n\x1b[1;34mjs\x1b[0m \x1b[1;32m>\x1b[0m ';

function toggleTerminal() {
  terminalVisible.value = !terminalVisible.value;
  if (terminalVisible.value) {
    nextTick(() => initTerminal());
  }
}

function initTerminal() {
  if (terminalInitialized || !terminalContainer.value) return;
  terminalInitialized = true;

  terminal = new Terminal({
    theme: {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#aeafad',
      selectionBackground: '#264f78',
      black: '#1e1e1e',
      red: '#f44747',
      green: '#6a9955',
      yellow: '#dcdcaa',
      blue: '#569cd6',
      magenta: '#c586c0',
      cyan: '#4ec9b0',
      white: '#d4d4d4',
      brightBlack: '#808080',
      brightRed: '#f44747',
      brightGreen: '#6a9955',
      brightYellow: '#dcdcaa',
      brightBlue: '#569cd6',
      brightMagenta: '#c586c0',
      brightCyan: '#4ec9b0',
      brightWhite: '#ffffff',
    },
    fontFamily: "'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
    fontSize: 13,
    cursorBlink: true,
    convertEol: true,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer.value);
  fitAddon.fit();

  terminal.writeln('\x1b[1;36m  VS Code Terminal\x1b[0m \x1b[2m(powered by xterm.js from VS Code)\x1b[0m');
  terminal.writeln('  JavaScript REPL + OPFS file commands. Type \x1b[1;33mhelp\x1b[0m for commands.');
  terminal.write(TERM_PROMPT);

  terminal.onData((data) => handleTerminalInput(data));

  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon) fitAddon.fit();
  });
  resizeObserver.observe(terminalContainer.value);
}

function handleTerminalInput(data: string) {
  if (!terminal) return;
  for (const ch of data) {
    if (ch === '\r') {
      terminal.write('\r\n');
      executeTerminalCommand(terminalInputBuffer.trim());
      terminalInputBuffer = '';
    } else if (ch === '\x7f') {
      if (terminalInputBuffer.length > 0) {
        terminalInputBuffer = terminalInputBuffer.slice(0, -1);
        terminal.write('\b \b');
      }
    } else if (ch === '\x03') {
      terminalInputBuffer = '';
      terminal.write('^C');
      terminal.write(TERM_PROMPT);
    } else if (ch >= '\x20') {
      terminalInputBuffer += ch;
      terminal.write(ch);
    }
  }
}

async function executeTerminalCommand(input: string) {
  if (!terminal) return;
  if (!input) { terminal.write(TERM_PROMPT); return; }

  const parts = input.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  try {
    switch (cmd) {
      case 'help':
        terminal.writeln('\x1b[1;33mAvailable commands:\x1b[0m');
        terminal.writeln('  \x1b[1;32mls\x1b[0m              List files in OPFS');
        terminal.writeln('  \x1b[1;32mcat\x1b[0m <file>       Show file contents');
        terminal.writeln('  \x1b[1;32mtouch\x1b[0m <file>     Create an empty file');
        terminal.writeln('  \x1b[1;32mrm\x1b[0m <file>        Delete a file');
        terminal.writeln('  \x1b[1;32mecho\x1b[0m <text>      Print text');
        terminal.writeln('  \x1b[1;32mwc\x1b[0m <file>        Word/line/char count');
        terminal.writeln('  \x1b[1;32mhead\x1b[0m <file> [n]  Show first n lines');
        terminal.writeln('  \x1b[1;32mclear\x1b[0m            Clear the terminal');
        terminal.writeln('  \x1b[1;32mhelp\x1b[0m             Show this help');
        terminal.writeln('  \x1b[1;36m<expr>\x1b[0m           Evaluate JavaScript');
        break;

      case 'ls': {
        const allFiles = await listFiles();
        if (allFiles.length === 0) {
          terminal.writeln('\x1b[2m(no files)\x1b[0m');
        } else {
          for (const f of allFiles) terminal.writeln(`  \x1b[1;34m${f}\x1b[0m`);
          terminal.writeln(`\x1b[2m${allFiles.length} file(s)\x1b[0m`);
        }
        break;
      }

      case 'cat': {
        if (!args[0]) { terminal.writeln('\x1b[1;31mUsage: cat <filename>\x1b[0m'); break; }
        const content = await loadFile(args[0]);
        if (content === null) {
          terminal.writeln(`\x1b[1;31mFile not found: ${args[0]}\x1b[0m`);
        } else {
          for (const line of content.split('\n')) terminal.writeln(line);
        }
        break;
      }

      case 'touch': {
        if (!args[0]) { terminal.writeln('\x1b[1;31mUsage: touch <filename>\x1b[0m'); break; }
        await saveFile(args[0], '');
        await refreshFiles();
        terminal.writeln(`\x1b[1;32mCreated ${args[0]}\x1b[0m`);
        break;
      }

      case 'rm': {
        if (!args[0]) { terminal.writeln('\x1b[1;31mUsage: rm <filename>\x1b[0m'); break; }
        const ok = await deleteFile(args[0]);
        await refreshFiles();
        terminal.writeln(ok ? `\x1b[1;32mDeleted ${args[0]}\x1b[0m` : `\x1b[1;31mFailed: ${args[0]}\x1b[0m`);
        break;
      }

      case 'echo':
        terminal.writeln(args.join(' '));
        break;

      case 'wc': {
        if (!args[0]) { terminal.writeln('\x1b[1;31mUsage: wc <filename>\x1b[0m'); break; }
        const wc = await loadFile(args[0]);
        if (wc === null) { terminal.writeln(`\x1b[1;31mFile not found: ${args[0]}\x1b[0m`); break; }
        terminal.writeln(`  ${wc.split('\n').length} lines, ${wc.split(/\s+/).filter(Boolean).length} words, ${wc.length} chars`);
        break;
      }

      case 'head': {
        if (!args[0]) { terminal.writeln('\x1b[1;31mUsage: head <file> [n]\x1b[0m'); break; }
        const hc = await loadFile(args[0]);
        if (hc === null) { terminal.writeln(`\x1b[1;31mFile not found: ${args[0]}\x1b[0m`); break; }
        for (const line of hc.split('\n').slice(0, parseInt(args[1]) || 10)) terminal.writeln(line);
        break;
      }

      case 'clear':
        terminal.clear();
        break;

      default: {
        try {
          const result = (0, eval)(input);
          if (result !== undefined) {
            const str = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
            for (const line of str.split('\n')) terminal.writeln(`\x1b[1;33m${line}\x1b[0m`);
          }
        } catch (e: any) {
          terminal.writeln(`\x1b[1;31m${e.message || e}\x1b[0m`);
        }
        break;
      }
    }
  } catch (e: any) {
    terminal.writeln(`\x1b[1;31mError: ${e.message || e}\x1b[0m`);
  }

  terminal.write(TERM_PROMPT);
}

function clearTerminal() {
  if (terminal) terminal.clear();
}

// ─── Keyboard Shortcuts ─────────────────────────────
function handleKeydown(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  if (ctrl && shift && e.key === 'P') {
    e.preventDefault(); openCommandPalette('commands');
  } else if (ctrl && !shift && e.key === 'p') {
    e.preventDefault(); openCommandPalette('files');
  } else if (ctrl && e.key === 'n') {
    e.preventDefault(); createNewFile();
  } else if (ctrl && e.key === 's') {
    e.preventDefault(); saveCurrentFile();
  } else if (ctrl && e.key === 'w') {
    e.preventDefault();
    if (currentFile.value) closeTab(currentFile.value);
  } else if (ctrl && shift && e.key === 'F') {
    e.preventDefault(); openSidebarSearch();
  } else if (ctrl && e.key === 'b') {
    e.preventDefault(); sidebarVisible.value = !sidebarVisible.value;
  } else if (ctrl && e.key === '`') {
    e.preventDefault(); toggleTerminal();
  } else if (e.key === 'F2' && currentFile.value) {
    e.preventDefault(); startRenaming(currentFile.value);
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
  if (terminal) terminal.dispose();
  for (const model of fileModels.values()) model.dispose();
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
  overflow: hidden;
}

/* ─── Codicon base tweaks ──────────────────────── */
.codicon { font-size: 16px; line-height: 1; }

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

.activity-btn .codicon { font-size: 24px; }
.activity-btn:hover { color: #ffffff; }
.activity-btn.active { color: #ffffff; border-left-color: #ffffff; }
.activity-spacer { flex: 1; }

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
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #bbbbbb;
}

.sidebar-actions { display: flex; gap: 2px; }

.icon-btn {
  background: none;
  border: none;
  color: #cccccc;
  cursor: pointer;
  border-radius: 3px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.icon-btn:hover { background: #3c3c3c; }
.icon-btn .codicon { font-size: 16px; }

.file-list { flex: 1; overflow-y: auto; }

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

.file-item:hover { background: #2a2d2e; }
.file-item.active { background: #37373d; color: #ffffff; }

.file-codicon {
  font-size: 14px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  color: #75beff;
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
  cursor: pointer;
  opacity: 0;
  padding: 0;
  line-height: 1;
  display: flex;
  align-items: center;
}

.delete-btn .codicon { font-size: 14px; }
.file-item:hover .delete-btn { opacity: 1; }
.delete-btn:hover { color: #e06c75; }

.empty-hint {
  padding: 16px 12px;
  text-align: center;
  color: #666;
  font-size: 12px;
  line-height: 1.8;
}

.empty-hint .codicon { font-size: 32px; color: #555; display: block; margin-bottom: 8px; }
.empty-hint kbd {
  background: #333;
  border: 1px solid #555;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 11px;
  font-family: monospace;
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

.search-input-wrapper { position: relative; }

.search-icon {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  color: #888;
}

.sidebar-search-field {
  width: 100%;
  background: #3c3c3c;
  color: #cccccc;
  border: 1px solid #3c3c3c;
  outline: none;
  padding: 4px 8px 4px 26px;
  font-size: 13px;
  border-radius: 2px;
}

.sidebar-search-field:focus { border-color: #007acc; }

.search-results-list { flex: 1; overflow-y: auto; }
.search-results-count { font-size: 11px; color: #888; padding: 4px 0; }

.search-result-entry {
  padding: 4px 0;
  cursor: pointer;
  border-bottom: 1px solid #3c3c3c;
}

.search-result-entry:hover { background: #2a2d2e; }

.search-result-header {
  font-size: 12px;
  color: #e8a838;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-result-header .codicon { font-size: 12px; }

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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
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

.tab-bar::-webkit-scrollbar { height: 3px; }
.tab-bar::-webkit-scrollbar-thumb { background: #555; }

.tab {
  display: flex;
  align-items: center;
  padding: 0 10px;
  height: 35px;
  cursor: pointer;
  font-size: 13px;
  gap: 6px;
  border-right: 1px solid #1e1e1e;
  background: #2d2d2d;
  color: #969696;
  white-space: nowrap;
  flex-shrink: 0;
}

.tab:hover { background: #2d2d2d; }

.tab.active {
  background: #1e1e1e;
  color: #ffffff;
  border-bottom: 1px solid #1e1e1e;
  margin-bottom: -1px;
}

.tab-codicon { font-size: 14px; flex-shrink: 0; color: #75beff; }
.tab-label { overflow: hidden; text-overflow: ellipsis; }
.tab-dot { color: #e8a838; flex-shrink: 0; }
.tab-dot .codicon { font-size: 10px; }

.tab-close {
  background: none;
  border: none;
  color: transparent;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  flex-shrink: 0;
}

.tab-close .codicon { font-size: 14px; }
.tab:hover .tab-close { color: #969696; }
.tab-close:hover { background: #3c3c3c; color: #ffffff; }

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

.breadcrumb-home { cursor: pointer; font-size: 14px; }
.breadcrumb-home:hover { color: #cccccc; }
.breadcrumb-sep { font-size: 12px; color: #555; }
.breadcrumb-icon { font-size: 12px; color: #75beff; }
.breadcrumb-item { cursor: default; }
.breadcrumb-lang { color: #777; }

/* ─── Editor ───────────────────────────────────── */
#monaco-container { flex: 1; overflow: hidden; }

/* ─── Terminal Panel (xterm.js) ────────────────── */
.terminal-panel {
  border-top: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
  height: 250px;
  min-height: 120px;
  background: #1e1e1e;
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 35px;
  min-height: 35px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  padding: 0 8px;
}

.terminal-tabs { display: flex; align-items: center; gap: 4px; }

.terminal-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cccccc;
  padding: 0 8px;
  height: 35px;
  border-bottom: 1px solid #cccccc;
  margin-bottom: -1px;
}

.terminal-tab .codicon { font-size: 14px; }
.terminal-actions { display: flex; gap: 2px; }

.terminal-action-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.terminal-action-btn:hover { background: #3c3c3c; color: #cccccc; }

.terminal-body {
  flex: 1;
  padding: 4px 0 4px 8px;
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

.status-left, .status-right { display: flex; align-items: center; gap: 2px; }

.status-item {
  padding: 0 6px;
  height: 22px;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.status-item .codicon { font-size: 14px; }
.status-item.clickable { cursor: pointer; }
.status-item.clickable:hover { background: rgba(255,255,255,0.12); }
.save-indicator { font-weight: 500; }

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
  max-width: 650px;
  padding: 2rem;
}

.welcome-logo { margin-bottom: 0.5rem; }
.welcome-code-icon { font-size: 72px !important; color: #007acc; }

.welcome-content h1 {
  font-size: 2rem;
  margin-bottom: 0.25rem;
  font-weight: 300;
  color: #cccccc;
}

.welcome-subtitle { color: #666; margin-bottom: 2rem; font-size: 1rem; }

.welcome-sections {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  text-align: left;
}

.welcome-section h3 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.welcome-section h3 .codicon { font-size: 14px; }

.welcome-link {
  font-size: 13px;
  color: #3794ff;
  cursor: pointer;
  padding: 3px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.welcome-link .codicon { font-size: 14px; }
.welcome-link:hover { text-decoration: underline; }
.welcome-hint { font-size: 12px; color: #555; }

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 12px;
}

.shortcut-row span { color: #999; }

kbd {
  background: #333;
  border: 1px solid #555;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 11px;
  font-family: monospace;
  color: #ccc;
  white-space: nowrap;
}

.welcome-footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #333;
}

.welcome-powered { font-size: 12px; color: #666; }
.welcome-powered a { color: #3794ff; text-decoration: none; }
.welcome-powered a:hover { text-decoration: underline; }

/* ─── Command Palette ──────────────────────────── */
.palette-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1000;
  display: flex;
  justify-content: center;
  padding-top: 12vh;
}

.palette {
  width: 520px;
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

.palette-input-row { display: flex; align-items: center; position: relative; }

.palette-input-icon {
  position: absolute;
  left: 12px;
  font-size: 14px;
  color: #888;
}

.palette-input {
  width: 100%;
  background: #3c3c3c;
  color: #cccccc;
  border: none;
  outline: none;
  padding: 10px 14px 10px 34px;
  font-size: 14px;
}

.palette-results { overflow-y: auto; flex: 1; }

.palette-item {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  cursor: pointer;
  gap: 10px;
  font-size: 13px;
}

.palette-item:hover, .palette-item.active { background: #062f4a; }

.palette-item-icon {
  flex-shrink: 0;
  font-size: 16px;
  width: 20px;
  text-align: center;
  color: #75beff;
}

.palette-label { flex: 1; }

.palette-shortcut {
  font-size: 11px;
  color: #888;
  background: #333;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid #555;
  font-family: monospace;
}

.palette-empty { padding: 12px 14px; color: #666; font-size: 13px; }

/* ─── Context Menu ─────────────────────────────── */
.context-menu {
  position: fixed;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  z-index: 2000;
  min-width: 180px;
  padding: 4px 0;
}

.context-item {
  padding: 6px 20px;
  font-size: 13px;
  cursor: pointer;
  color: #cccccc;
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-item .codicon { font-size: 14px; }
.context-item:hover { background: #094771; }
.context-item.danger:hover { background: #5a1d1d; color: #e06c75; }

.context-separator { height: 1px; background: #3c3c3c; margin: 4px 0; }

.click-blocker {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
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
  background: #252526;
  color: #ccc;
  padding: 10px 16px;
  border-radius: 4px;
  font-size: 13px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  animation: slideIn 0.25s ease-out;
  border-left: 3px solid #007acc;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toast .codicon { font-size: 16px; }
.toast.success { border-left-color: #22c55e; }
.toast.success .codicon { color: #22c55e; }
.toast.error { border-left-color: #e06c75; }
.toast.error .codicon { color: #e06c75; }
.toast.info .codicon { color: #007acc; }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>
