<template>
  <div class="page" @contextmenu.prevent>
    <!-- Files Picker Dialog -->
    <FilesPicker
      v-model:visible="showFilePicker"
      :mode="filePickerMode"
      :title="filePickerTitle"
      :extensions="filePickerExtensions"
      :initial-path="projectRoot || '/home'"
      :default-file-name="filePickerDefaultName"
      @select="onPickerSelect"
      @cancel="onPickerCancel"
    />

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

    <!-- Activity bar -->
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
    <div v-if="sidebarVisible" class="sidebar" :style="{ width: sidebarWidth + 'px', minWidth: sidebarWidth + 'px' }">
      <!-- Explorer panel -->
      <template v-if="activePanel === 'explorer'">
        <div class="sidebar-header">
          <span class="sidebar-title">EXPLORER</span>
          <div class="sidebar-actions">
            <button class="icon-btn" title="Open Folder" @click="openFolder">
              <i class="codicon codicon-folder-opened"></i>
            </button>
            <button class="icon-btn" title="New File (Ctrl+N)" @click="createNewFile">
              <i class="codicon codicon-new-file"></i>
            </button>
            <button class="icon-btn" title="Collapse Sidebar" @click="sidebarVisible = false">
              <i class="codicon codicon-panel-left"></i>
            </button>
          </div>
        </div>
        <div class="file-list">
          <template v-if="projectRoot">
            <div
              v-for="node in flatTree"
              :key="node.path"
              class="file-item"
              :class="{ active: currentFile === node.path }"
              :style="{ paddingLeft: (12 + node.depth * 16) + 'px' }"
              @click="node.isDirectory ? toggleTreeNode(node) : openFile(node.path)"
              @dblclick="!node.isDirectory && startRenaming(node.path)"
              @contextmenu.prevent="!node.isDirectory && showFileContextMenu($event, node.path)"
            >
              <i v-if="node.isDirectory" :class="'codicon codicon-' + (node.expanded ? 'chevron-down' : 'chevron-right')" class="tree-toggle"></i>
              <span v-else class="tree-toggle-spacer"></span>
              <i v-if="node.isDirectory" class="codicon codicon-folder file-codicon folder-icon"></i>
              <i v-else :class="'codicon codicon-' + getCodiconForFile(node.name)" class="file-codicon"></i>
              <input
                v-if="renamingFile === node.path"
                ref="renameInput"
                v-model="renameValue"
                class="rename-input"
                @blur="finishRename"
                @keydown.enter="finishRename"
                @keydown.escape="cancelRename"
                @click.stop
              />
              <span v-else class="file-name">{{ node.name }}</span>
              <button
                v-if="!node.isDirectory"
                class="delete-btn"
                title="Delete"
                @click.stop="removeFile(node.path)"
              ><i class="codicon codicon-close"></i></button>
            </div>
          </template>
          <div v-if="!projectRoot" class="empty-hint">
            <i class="codicon codicon-folder-opened"></i><br/>
            No folder open.<br />Click <kbd>Open Folder</kbd> or press <kbd>Ctrl+N</kbd> to start.
          </div>
          <div v-else-if="flatTree.length === 0" class="empty-hint">
            <i class="codicon codicon-new-file"></i><br/>
            This folder is empty.<br />Press <kbd>Ctrl+N</kbd> to create a file.
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

    <!-- Sidebar resize handle -->
    <div
      v-if="sidebarVisible"
      class="sidebar-resize-handle"
      @mousedown="startResize"
      @touchstart="startResize"
    ></div>

    <!-- Main area -->
    <div class="main">
      <!-- Tab bar -->
      <div class="tab-bar" v-if="openTabs.length > 0">
        <div
          v-for="tab in openTabs"
          :key="tab.path"
          class="tab"
          :class="{ active: tab.path === currentFile, modified: tab.modified }"
          @click="switchToTab(tab.path)"
          @auxclick.middle.prevent="closeTab(tab.path)"
        >
          <i :class="'codicon codicon-' + getCodiconForFile(tab.name)" class="tab-codicon"></i>
          <span class="tab-label">{{ tab.name }}</span>
          <span v-if="tab.modified" class="tab-dot"><i class="codicon codicon-circle-filled"></i></span>
          <button class="tab-close" @click.stop="closeTab(tab.path)"><i class="codicon codicon-close"></i></button>
        </div>
      </div>

      <!-- Breadcrumbs -->
      <div v-if="currentFile" class="breadcrumbs">
        <i class="codicon codicon-home breadcrumb-home" @click="togglePanel('explorer')"></i>
        <i class="codicon codicon-chevron-right breadcrumb-sep"></i>
        <i :class="'codicon codicon-' + getCodiconForFile(openTabs.find(t => t.path === currentFile)?.name || '')" class="breadcrumb-icon"></i>
        <span class="breadcrumb-item">{{ openTabs.find(t => t.path === currentFile)?.name || '' }}</span>
        <i class="codicon codicon-chevron-right breadcrumb-sep"></i>
        <span class="breadcrumb-lang">{{ getLanguageLabel(openTabs.find(t => t.path === currentFile)?.name || '') }}</span>
      </div>

      <!-- Editor -->
      <div v-show="currentFile" id="monaco-container" ref="monacoContainer"></div>

      <!-- Welcome page -->
      <div v-if="!currentFile" class="welcome">
        <div class="welcome-content">
          <div class="welcome-logo"><i class="codicon codicon-code welcome-code-icon"></i></div>
          <h1>Stark Code</h1>
          <p class="welcome-subtitle">Editing evolved</p>

          <div class="welcome-sections">
            <div class="welcome-section">
              <h3><i class="codicon codicon-rocket"></i> Start</h3>
              <div class="welcome-link" @click="openFolder"><i class="codicon codicon-folder-opened"></i> Open Folder...</div>
              <div class="welcome-link" @click="createNewFile"><i class="codicon codicon-new-file"></i> New File...</div>
              <div class="welcome-link" @click="openFilePicker"><i class="codicon codicon-go-to-file"></i> Open File...</div>
              <div class="welcome-link" @click="openCommandPalette('commands')"><i class="codicon codicon-terminal"></i> Command Palette...</div>
            </div>
            <div class="welcome-section">
              <h3><i class="codicon codicon-history"></i> Recent</h3>
              <template v-if="openTabs.length > 0">
                <div
                  v-for="tab in openTabs.slice(0, 5)"
                  :key="tab.path"
                  class="welcome-link"
                  @click="openFile(tab.path)"
                ><i :class="'codicon codicon-' + getCodiconForFile(tab.name)"></i> {{ tab.name }}</div>
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
              <a href="https://github.com/microsoft/vscode-codicons" target="_blank">Codicons</a>,
              and <a href="https://github.com/xtermjs/xterm.js" target="_blank">xterm.js</a>
            </span>
          </div>
        </div>
      </div>

      <!-- Terminal panel (SharedTerminal component) -->
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
        <div class="terminal-body">
          <SharedTerminal ref="terminalRef" :initial-path="terminalInitialPath" />
        </div>
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
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue';
import SharedTerminal from '../../shared/components/SharedTerminal.vue';
import FilesPicker from '../../shared/components/FilesPicker.vue';
import type { PickerResult, ExtensionFilter } from '../../shared/components/FilesPicker.vue';
import {
  getStarkOpfsRoot,
  buildOpfsFS,
  normalizePath,
  getPathParts,
  getIconSvg,
  getIconColor,
  type ReadonlyFS,
} from '../../shared/utils';
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
  path: string;  // full OPFS path
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
interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  expanded: boolean;
  children: TreeNode[];
  depth: number;
}

// ─── Constants ──────────────────────────────────────
const SAVE_DELAY = 1000;

// ─── Shared OPFS FS ────────────────────────────────
let opfsRoot: FileSystemDirectoryHandle | null = null;
let fs: ReadonlyFS | null = null;

// ─── State ──────────────────────────────────────────
const monacoContainer = ref<HTMLElement | null>(null);
const terminalRef = ref<InstanceType<typeof SharedTerminal> | null>(null);
const paletteInput = ref<HTMLInputElement | null>(null);
const sidebarSearchInput = ref<HTMLInputElement | null>(null);
const renameInput = ref<HTMLInputElement | null>(null);

const projectRoot = ref<string | null>(null);  // null = no project open
const treeNodes = ref<TreeNode[]>([]);
const currentFile = ref<string | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');
const openTabs = ref<Tab[]>([]);
const sidebarVisible = ref(true);
const sidebarWidth = ref(260);
const activePanel = ref<'explorer' | 'search' | 'extensions'>('explorer');
const cursorLine = ref(1);
const cursorColumn = ref(1);
const editorTabSize = ref(2);
const wordWrapEnabled = ref(true);
const terminalVisible = ref(false);

// Files-picker state
const showFilePicker = ref(false);
const filePickerMode = ref<'file' | 'files' | 'directory' | 'save'>('file');
const filePickerTitle = ref('');
const filePickerExtensions = ref<ExtensionFilter[]>([]);
const filePickerDefaultName = ref('');
let filePickerResolve: ((result: PickerResult | null) => void) | null = null;

// Sidebar resize state
let isResizing = false;
let resizeStartX = 0;
let resizeStartWidth = 0;

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
const contextMenu = reactive({ show: false, x: 0, y: 0, file: '', path: '' });

// Notifications
const toasts = ref<ToastMsg[]>([]);

// Editor internals
let editor: any = null;
let monacoModule: any = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let isLoadingFile = false;
const fileModels = new Map<string, any>();

// Extensions state
const extSearchQuery = ref('');
const extCategoryFilter = ref('');
const selectedExt = ref<Extension | null>(null);
const extState = ref<ExtensionState>({ installed: [], enabled: [] });
const extCategories = getCategories();
const activeExtDisposers = new Map<string, () => void>();

// ─── Terminal path ──────────────────────────────────
const terminalInitialPath = computed(() => projectRoot.value || '/home');

// ─── Files Picker helpers ───────────────────────────
function openPickerDialog(
  mode: 'file' | 'files' | 'directory' | 'save',
  title: string,
  extensions: ExtensionFilter[] = [],
  defaultName = '',
): Promise<PickerResult | null> {
  return new Promise((resolve) => {
    filePickerMode.value = mode;
    filePickerTitle.value = title;
    filePickerExtensions.value = extensions;
    filePickerDefaultName.value = defaultName;
    filePickerResolve = resolve;
    showFilePicker.value = true;
  });
}

function onPickerSelect(result: PickerResult) {
  showFilePicker.value = false;
  if (filePickerResolve) {
    filePickerResolve(result);
    filePickerResolve = null;
  }
}

function onPickerCancel() {
  showFilePicker.value = false;
  if (filePickerResolve) {
    filePickerResolve(null);
    filePickerResolve = null;
  }
}

// ─── Sidebar Resize ─────────────────────────────────
function startResize(e: MouseEvent | TouchEvent) {
  isResizing = true;
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  resizeStartX = clientX;
  resizeStartWidth = sidebarWidth.value;
  e.preventDefault();
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
  document.addEventListener('touchmove', onResize);
  document.addEventListener('touchend', stopResize);
}

function onResize(e: MouseEvent | TouchEvent) {
  if (!isResizing) return;
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const delta = clientX - resizeStartX;
  sidebarWidth.value = Math.max(150, Math.min(600, resizeStartWidth + delta));
}

function stopResize() {
  isResizing = false;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
  document.removeEventListener('touchmove', onResize);
  document.removeEventListener('touchend', stopResize);
}

// ─── Tree Operations ────────────────────────────────
async function loadTree(rootPath: string): Promise<TreeNode[]> {
  if (!fs) return [];
  try {
    const entries = await fs.readdirWithTypes(rootPath);
    const nodes: TreeNode[] = [];
    const parts = getPathParts(rootPath);
    const depth = parts.length - (projectRoot.value ? getPathParts(projectRoot.value).length : 0);
    for (const entry of entries) {
      const childPath = normalizePath(rootPath + '/' + entry.name);
      nodes.push({
        name: entry.name,
        path: childPath,
        isDirectory: entry.isDirectory(),
        expanded: false,
        children: [],
        depth,
      });
    }
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  } catch {
    return [];
  }
}

async function refreshTree() {
  if (!projectRoot.value) {
    treeNodes.value = [];
    return;
  }
  treeNodes.value = await loadTree(projectRoot.value);
}

async function toggleTreeNode(node: TreeNode) {
  if (!node.isDirectory) return;
  node.expanded = !node.expanded;
  if (node.expanded && node.children.length === 0) {
    node.children = await loadTree(node.path);
  }
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.isDirectory && node.expanded) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

const flatTree = computed(() => flattenTree(treeNodes.value));

// ─── OPFS File Operations ───────────────────────────
async function opfsReadFile(path: string): Promise<string | null> {
  if (!fs) return null;
  try { return await fs.readFile(path); } catch { return null; }
}

async function opfsSaveFile(path: string, content: string): Promise<void> {
  if (!fs) return;
  // Ensure parent directories exist
  const parts = getPathParts(path);
  if (parts.length > 1) {
    const dirParts = parts.slice(0, -1);
    await fs.mkdir('/' + dirParts.join('/'), true);
  }
  await fs.writeFile(path, content);
}

async function opfsDeleteFile(path: string): Promise<boolean> {
  if (!fs) return false;
  try { await fs.unlink(path); return true; } catch { return false; }
}

async function opfsRenameFile(oldPath: string, newPath: string): Promise<boolean> {
  if (!fs) return false;
  try { await fs.rename(oldPath, newPath); return true; } catch { return false; }
}

async function searchInFiles(query: string): Promise<SearchResult[]> {
  if (!query || !fs || !projectRoot.value) return [];
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  async function searchDir(dirPath: string) {
    try {
      const entries = await fs!.readdirWithTypes(dirPath);
      for (const entry of entries) {
        const childPath = normalizePath(dirPath + '/' + entry.name);
        if (entry.isDirectory()) {
          await searchDir(childPath);
        } else {
          try {
            const content = await fs!.readFile(childPath);
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(lowerQuery)) {
                // Show relative path from project root
                const relPath = childPath.startsWith(projectRoot.value!)
                  ? childPath.slice(projectRoot.value!.length + 1)
                  : childPath;
                results.push({ file: relPath, line: i + 1, text: lines[i] });
              }
            }
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  await searchDir(projectRoot.value);
  return results;
}

// ─── Extension Computed & Functions ─────────────────
const installedExtensions = computed(() =>
  extensionCatalog.filter(e => extState.value.installed.includes(e.id))
);

const filteredCatalog = computed(() => {
  let list = extensionCatalog;
  if (extSearchQuery.value) {
    const q = extSearchQuery.value.toLowerCase();
    list = list.filter(e =>
      e.displayName.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.publisher.toLowerCase().includes(q)
    );
  }
  if (extCategoryFilter.value) {
    list = list.filter(e => e.category === extCategoryFilter.value);
  }
  // When showing "Marketplace" subsection, hide already-installed ones
  if (!extSearchQuery.value && !extCategoryFilter.value) {
    list = list.filter(e => !extState.value.installed.includes(e.id));
  }
  return list;
});

function isInstalled(id: string): boolean {
  return extState.value.installed.includes(id);
}

function isEnabled(id: string): boolean {
  return extState.value.enabled.includes(id);
}

async function refreshExtensionState() {
  extState.value = await loadExtensionState();
}

async function installExtension(id: string) {
  if (extState.value.installed.includes(id)) return;
  extState.value.installed.push(id);
  extState.value.enabled.push(id);
  await saveExtensionState(extState.value);
  applyExt(id);
  const ext = extensionCatalog.find(e => e.id === id);
  notify(`Installed: ${ext?.displayName || id}`, 'success');
}

async function uninstallExtension(id: string) {
  unapplyExt(id);
  extState.value.installed = extState.value.installed.filter(e => e !== id);
  extState.value.enabled = extState.value.enabled.filter(e => e !== id);
  await saveExtensionState(extState.value);
  selectedExt.value = null;
  const ext = extensionCatalog.find(e => e.id === id);
  notify(`Uninstalled: ${ext?.displayName || id}`, 'info');
}

async function enableExtension(id: string) {
  if (!extState.value.enabled.includes(id)) {
    extState.value.enabled.push(id);
  }
  await saveExtensionState(extState.value);
  applyExt(id);
  const ext = extensionCatalog.find(e => e.id === id);
  notify(`Enabled: ${ext?.displayName || id}`, 'success');
}

async function disableExtension(id: string) {
  unapplyExt(id);
  extState.value.enabled = extState.value.enabled.filter(e => e !== id);
  await saveExtensionState(extState.value);
  const ext = extensionCatalog.find(e => e.id === id);
  notify(`Disabled: ${ext?.displayName || id}`, 'info');
}

function applyExt(id: string) {
  if (activeExtDisposers.has(id)) return; // already applied
  if (!monacoModule || !editor) return;
  const disposer = applyExtension(id, editor, monacoModule);
  if (disposer) activeExtDisposers.set(id, disposer);
}

function unapplyExt(id: string) {
  const disposer = activeExtDisposers.get(id);
  if (disposer) {
    disposer();
    activeExtDisposers.delete(id);
  }
}

function applyAllEnabledExtensions() {
  if (!monacoModule) return;
  defineCustomThemes(monacoModule);
  for (const id of extState.value.enabled) {
    applyExt(id);
  }
}

// ─── Computed ───────────────────────────────────────
const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saved': return 'Saved';
    case 'saving': return 'Saving...';
    default: return '';
  }
});

const commandList = computed<PaletteItem[]>(() => [
  { codicon: 'folder-opened', label: 'Open Folder...', action: openFolder },
  { codicon: 'go-to-file', label: 'Open File...', shortcut: 'Ctrl+P', action: () => openFilePicker() },
  { codicon: 'new-file', label: 'New File', shortcut: 'Ctrl+N', action: createNewFile },
  { codicon: 'save', label: 'Save File', shortcut: 'Ctrl+S', action: saveCurrentFile },
  { codicon: 'save-as', label: 'Save As...', action: saveAsFile },
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
  { codicon: 'extensions', label: 'Show Extensions', shortcut: 'Ctrl+Shift+X', action: () => togglePanel('extensions') },
  { codicon: 'extensions', label: 'Install Extension...', action: () => { togglePanel('extensions'); extSearchQuery.value = ''; } },
]);

const filteredPaletteItems = computed<PaletteItem[]>(() => {
  if (paletteMode.value === 'files') {
    const q = paletteQuery.value.toLowerCase();
    // Collect all files from the tree (recursive)
    const allFiles: { name: string; path: string }[] = [];
    function collectFiles(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (!node.isDirectory) {
          allFiles.push({ name: node.name, path: node.path });
        }
        if (node.isDirectory && node.expanded) {
          collectFiles(node.children);
        }
      }
    }
    collectFiles(treeNodes.value);
    // Also include open tabs that may not be in tree
    for (const tab of openTabs.value) {
      if (!allFiles.some(f => f.path === tab.path)) {
        const parts = getPathParts(tab.path);
        allFiles.push({ name: parts[parts.length - 1] || tab.name, path: tab.path });
      }
    }
    return allFiles
      .filter(f => f.name.toLowerCase().includes(q))
      .map(f => ({
        codicon: getCodiconForFile(f.name),
        label: f.name,
        action: () => openFile(f.path),
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

// ─── Monaco Editor Actions (built-in editor commands) ──
function editorAction(actionId: string) {
  if (!editor) return;
  const action = editor.getAction(actionId);
  if (action) action.run();
}

// ─── Tab Management ─────────────────────────────────
function getOrCreateTab(path: string): Tab {
  let tab = openTabs.value.find(t => t.path === path);
  if (!tab) {
    const parts = getPathParts(path);
    const name = parts[parts.length - 1] || path;
    tab = { name, path, modified: false };
    openTabs.value.push(tab);
  }
  return tab;
}

async function switchToTab(path: string) {
  if (currentFile.value === path) return;
  await openFile(path);
}

async function closeTab(path: string) {
  const idx = openTabs.value.findIndex(t => t.path === path);
  if (idx === -1) return;

  const tab = openTabs.value[idx];
  if (tab.modified && editor && currentFile.value === path) {
    await saveCurrentFile();
  }

  const model = fileModels.get(path);
  if (model) { model.dispose(); fileModels.delete(path); }

  openTabs.value.splice(idx, 1);

  if (currentFile.value === path) {
    if (openTabs.value.length > 0) {
      const nextIdx = Math.min(idx, openTabs.value.length - 1);
      await openFile(openTabs.value[nextIdx].path);
    } else {
      currentFile.value = null;
    }
  }
}

// ─── File Operations ────────────────────────────────

async function openFolder() {
  const result = await openPickerDialog('directory', 'Open Folder');
  if (!result) return;
  projectRoot.value = result.paths[0];
  await refreshTree();
  // Close all open tabs from different project
  for (const tab of [...openTabs.value]) {
    await closeTab(tab.path);
  }
  currentFile.value = null;
  notify(`Opened folder: ${projectRoot.value}`, 'success');
}

async function openFilePicker() {
  const result = await openPickerDialog('file', 'Open File');
  if (!result || result.paths.length === 0) return;
  const filePath = result.paths[0];
  // If no project is open, set project root to the file's directory
  if (!projectRoot.value) {
    const parts = getPathParts(filePath);
    parts.pop();
    projectRoot.value = '/' + parts.join('/');
    await refreshTree();
  }
  await openFile(filePath);
}

async function createNewFile() {
  showCommandPalette.value = false;
  const result = await openPickerDialog(
    'save',
    'New File',
    [],
    'untitled.txt',
  );
  if (!result || !result.fileName) return;
  const fullPath = result.paths[0];
  await opfsSaveFile(fullPath, '');
  // If no project open, set project root
  if (!projectRoot.value) {
    projectRoot.value = result.directory;
  }
  await refreshTree();
  await openFile(fullPath);
  notify(`Created ${result.fileName}`, 'success');
}

async function saveAsFile() {
  if (!currentFile.value || !editor) return;
  const content = editor.getValue();
  const currentName = openTabs.value.find(t => t.path === currentFile.value)?.name || 'file.txt';
  const ext = currentName.includes('.') ? '.' + currentName.split('.').pop() : '.txt';
  const result = await openPickerDialog(
    'save',
    'Save As',
    [{ label: `${ext.toUpperCase().slice(1)} File`, extensions: [ext] }],
    currentName,
  );
  if (!result || !result.fileName) return;
  await opfsSaveFile(result.paths[0], content);
  await refreshTree();
  await openFile(result.paths[0]);
  notify(`Saved as ${result.fileName}`, 'success');
}

async function openFile(path: string) {
  if (currentFile.value && editor) {
    await saveCurrentFile();
  }

  getOrCreateTab(path);
  currentFile.value = path;
  showCommandPalette.value = false;

  const parts = getPathParts(path);
  const filename = parts[parts.length - 1] || 'file';

  let model = fileModels.get(path);
  if (!model) {
    const content = await opfsReadFile(path) || '';
    await nextTick();
    if (!monacoModule) {
      await initEditor(content, filename, path);
      return;
    }
    const uri = monacoModule.Uri.parse(`file:///${path.replace(/^\//, '')}`);
    model = monacoModule.editor.createModel(content, getLanguage(filename), uri);
    fileModels.set(path, model);
  }

  await nextTick();

  if (!editor && monacoContainer.value) {
    await initEditor('', filename, path);
  }

  if (editor && model) {
    isLoadingFile = true;
    editor.setModel(model);
    isLoadingFile = false;
  }

  saveStatus.value = 'idle';
}

async function initEditor(content: string, filename: string, path: string) {
  // Monaco Editor — the core editor component
  monacoModule = await import('monaco-editor');

  (self as any).MonacoEnvironment = {
    getWorker() { return null as any; },
  };

  let model = fileModels.get(path);
  if (!model) {
    const uri = monacoModule.Uri.parse(`file:///${path.replace(/^\//, '')}`);
    model = monacoModule.editor.createModel(content, getLanguage(filename), uri);
    fileModels.set(path, model);
  }

  editor = monacoModule.editor.create(monacoContainer.value!, {
    model,
    theme: 'vs-dark',
    automaticLayout: true,
    // Editor settings
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
    const tab = openTabs.value.find(t => t.path === currentFile.value);
    if (tab) tab.modified = true;
    scheduleSave();
  });

  editor.onDidChangeCursorPosition((e: any) => {
    cursorLine.value = e.position.lineNumber;
    cursorColumn.value = e.position.column;
  });

  // Apply enabled extensions after editor is ready
  applyAllEnabledExtensions();
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
    await opfsSaveFile(currentFile.value, content);
    saveStatus.value = 'saved';
    const tab = openTabs.value.find(t => t.path === currentFile.value);
    if (tab) tab.modified = false;
  } catch (e) {
    console.warn('Failed to save to OPFS:', e);
    saveStatus.value = 'idle';
    notify('Failed to save file', 'error');
  }
}

async function removeFile(path: string) {
  contextMenu.show = false;
  const parts = getPathParts(path);
  const name = parts[parts.length - 1] || path;
  if (!confirm(`Delete "${name}"?`)) return;
  await opfsDeleteFile(path);

  const tabIdx = openTabs.value.findIndex(t => t.path === path);
  if (tabIdx !== -1) {
    const model = fileModels.get(path);
    if (model) { model.dispose(); fileModels.delete(path); }
    openTabs.value.splice(tabIdx, 1);
  }

  if (currentFile.value === path) {
    if (openTabs.value.length > 0) {
      await openFile(openTabs.value[0].path);
    } else {
      currentFile.value = null;
    }
  }

  await refreshTree();
  notify(`Deleted ${name}`, 'info');
}

// ─── Rename ─────────────────────────────────────────
function startRenaming(path: string) {
  const parts = getPathParts(path);
  renamingFile.value = path;
  renameValue.value = parts[parts.length - 1] || '';
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
  const oldPath = renamingFile.value;
  const newName = renameValue.value.trim();
  renamingFile.value = null;
  if (!oldPath || !newName) return;
  const oldParts = getPathParts(oldPath);
  const oldName = oldParts[oldParts.length - 1] || '';
  if (oldName === newName) return;

  // Build new path
  const dirParts = oldParts.slice(0, -1);
  const newPath = '/' + [...dirParts, newName].join('/');

  const success = await opfsRenameFile(oldPath, newPath);
  if (!success) { notify('Failed to rename file', 'error'); return; }

  const tab = openTabs.value.find(t => t.path === oldPath);
  if (tab) {
    tab.path = newPath;
    tab.name = newName;
    const model = fileModels.get(oldPath);
    if (model) {
      fileModels.delete(oldPath);
      const content = model.getValue();
      model.dispose();
      if (monacoModule) {
        const uri = monacoModule.Uri.parse(`file:///${newPath.replace(/^\//, '')}`);
        const newModel = monacoModule.editor.createModel(content, getLanguage(newName), uri);
        fileModels.set(newPath, newModel);
        if (currentFile.value === oldPath && editor) {
          isLoadingFile = true;
          editor.setModel(newModel);
          isLoadingFile = false;
        }
      }
    }
  }

  if (currentFile.value === oldPath) currentFile.value = newPath;
  await refreshTree();
  notify(`Renamed to ${newName}`, 'success');
}

// ─── Context Menu ───────────────────────────────────
function showFileContextMenu(event: MouseEvent, path: string) {
  const parts = getPathParts(path);
  contextMenu.show = true;
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.file = parts[parts.length - 1] || '';
  contextMenu.path = path;
}

function renameFileFromContext() {
  const path = contextMenu.path;
  contextMenu.show = false;
  startRenaming(path);
}

async function duplicateFileFromContext() {
  const path = contextMenu.path;
  const name = contextMenu.file;
  contextMenu.show = false;
  const content = await opfsReadFile(path) || '';
  const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  const newName = `${base}-copy${ext}`;
  const parts = getPathParts(path);
  const dirParts = parts.slice(0, -1);
  const newPath = '/' + [...dirParts, newName].join('/');
  await opfsSaveFile(newPath, content);
  await refreshTree();
  await openFile(newPath);
  notify(`Duplicated as ${newName}`, 'success');
}

function deleteFileFromContext() {
  const path = contextMenu.path;
  contextMenu.show = false;
  removeFile(path);
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
  // result.file is relative to project root
  const fullPath = projectRoot.value
    ? normalizePath(projectRoot.value + '/' + result.file)
    : result.file;
  await openFile(fullPath);
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

function togglePanel(panel: 'explorer' | 'search' | 'extensions') {
  if (activePanel.value === panel && sidebarVisible.value) {
    sidebarVisible.value = false;
  } else {
    activePanel.value = panel;
    sidebarVisible.value = true;
    if (panel === 'search') nextTick(() => sidebarSearchInput.value?.focus());
  }
}

// ─── Terminal (SharedTerminal component) ─
function toggleTerminal() {
  terminalVisible.value = !terminalVisible.value;
  if (terminalVisible.value) {
    nextTick(() => {
      if (terminalRef.value) terminalRef.value.fit();
    });
  }
}

function clearTerminal() {
  if (terminalRef.value) terminalRef.value.clear();
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
  } else if (ctrl && shift && e.key === 'X') {
    e.preventDefault(); togglePanel('extensions');
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
  opfsRoot = await getStarkOpfsRoot();
  if (opfsRoot) {
    fs = buildOpfsFS(opfsRoot);
  }
  await refreshExtensionState();
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (saveTimeout) clearTimeout(saveTimeout);
  if (editor) editor.dispose();
  for (const disposer of activeExtDisposers.values()) disposer();
  activeExtDisposers.clear();
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
  min-width: 150px;
  max-width: 600px;
  background: #252526;
  border-right: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Sidebar Resize Handle ────────────────────── */
.sidebar-resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
  z-index: 10;
}
.sidebar-resize-handle:hover,
.sidebar-resize-handle:active {
  background: #007acc;
}

@media (pointer: coarse) {
  .sidebar-resize-handle {
    width: 8px;
  }
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

.tree-toggle {
  font-size: 12px;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  color: #888;
}
.tree-toggle-spacer {
  width: 16px;
  flex-shrink: 0;
}

.folder-icon { color: #dcb67a !important; }

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

/* ─── Extensions Panel ─────────────────────────── */
.ext-search-wrapper { padding: 8px 12px 4px; }

.ext-category-bar {
  display: flex;
  gap: 2px;
  padding: 4px 12px 6px;
  flex-wrap: wrap;
}

.ext-cat-btn {
  background: none;
  border: 1px solid #3c3c3c;
  color: #888;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
}

.ext-cat-btn:hover { color: #ccc; border-color: #555; }
.ext-cat-btn.active { color: #fff; border-color: #007acc; background: #007acc; }

.ext-section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #888;
  padding: 8px 12px 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ext-section-label .codicon { font-size: 12px; }

.ext-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.ext-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  gap: 8px;
  cursor: pointer;
  border-left: 2px solid transparent;
}

.ext-item:hover { background: #2a2d2e; }
.ext-item.selected { background: #37373d; border-left-color: #007acc; }

.ext-icon {
  width: 32px;
  height: 32px;
  background: #3c3c3c;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ext-icon .codicon { font-size: 18px; color: #75beff; }

.ext-info { flex: 1; min-width: 0; }

.ext-name {
  font-size: 13px;
  font-weight: 500;
  color: #cccccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ext-publisher {
  font-size: 11px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ext-badge {
  flex-shrink: 0;
}

.ext-badge.installed .codicon {
  font-size: 14px;
  color: #22c55e;
}

.ext-empty {
  padding: 16px 12px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

/* Extension detail panel */
.ext-detail {
  border-top: 1px solid #3c3c3c;
  padding: 10px 12px;
  flex-shrink: 0;
}

.ext-detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.ext-detail-icon {
  width: 40px;
  height: 40px;
  background: #3c3c3c;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ext-detail-icon .codicon { font-size: 22px; color: #75beff; }

.ext-detail-meta { flex: 1; min-width: 0; }

.ext-detail-name {
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
}

.ext-detail-pub {
  font-size: 11px;
  color: #888;
}

.ext-detail-desc {
  font-size: 12px;
  color: #aaa;
  line-height: 1.4;
  margin-bottom: 8px;
}

.ext-detail-stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #888;
  margin-bottom: 10px;
  align-items: center;
}

.ext-detail-stats .codicon { font-size: 12px; }

.ext-detail-cat {
  background: #333;
  border: 1px solid #555;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.ext-detail-actions {
  display: flex;
  gap: 6px;
}

.ext-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 3px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ext-btn .codicon { font-size: 12px; }
.ext-btn.install { background: #007acc; color: #fff; }
.ext-btn.install:hover { background: #006bb3; }
.ext-btn.enable { background: #007acc; color: #fff; }
.ext-btn.enable:hover { background: #006bb3; }
.ext-btn.disable { background: #3c3c3c; color: #ccc; }
.ext-btn.disable:hover { background: #555; }
.ext-btn.uninstall { background: #3c3c3c; color: #e06c75; }
.ext-btn.uninstall:hover { background: #5a1d1d; }
</style>
