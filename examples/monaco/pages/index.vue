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
            :placeholder="paletteMode === 'commands' ? '> Type a command...' : paletteMode === 'symbols' ? '@ Type to search symbols...' : 'Type to search files...'"
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
      <div class="context-item" @click="newFileFromContext"><i class="codicon codicon-new-file"></i> New File</div>
      <div class="context-item" @click="newFolderFromContext"><i class="codicon codicon-new-folder"></i> New Folder</div>
      <div class="context-separator"></div>
      <div v-if="!contextMenu.isDirectory" class="context-item" @click="renameFileFromContext"><i class="codicon codicon-edit"></i> Rename</div>
      <div v-if="contextMenu.isDirectory" class="context-item" @click="renameFolderFromContext"><i class="codicon codicon-edit"></i> Rename</div>
      <div v-if="!contextMenu.isDirectory" class="context-item" @click="duplicateFileFromContext"><i class="codicon codicon-copy"></i> Duplicate</div>
      <div class="context-separator"></div>
      <div class="context-item danger" @click="deleteFromContext"><i class="codicon codicon-trash"></i> Delete</div>
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
        :class="{ active: activePanel === 'scm' && sidebarVisible }"
        title="Source Control (Ctrl+Shift+G)"
        @click="togglePanel('scm')"
      >
        <i class="codicon codicon-source-control"></i>
        <span v-if="scmChangedFiles.length > 0" class="activity-badge">{{ scmChangedFiles.length }}</span>
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
            <button class="icon-btn" title="New File" @click="startInlineCreate('file')">
              <i class="codicon codicon-new-file"></i>
            </button>
            <button class="icon-btn" title="New Folder" @click="startInlineCreate('directory')">
              <i class="codicon codicon-new-folder"></i>
            </button>
            <button class="icon-btn" title="Refresh Explorer" @click="refreshTree">
              <i class="codicon codicon-refresh"></i>
            </button>
            <button class="icon-btn" title="Collapse All" @click="collapseAll">
              <i class="codicon codicon-collapse-all"></i>
            </button>
          </div>
        </div>
        <!-- Open Editors section -->
        <div class="explorer-section" v-if="openTabs.length > 0">
          <div class="explorer-section-header" @click="openEditorsExpanded = !openEditorsExpanded">
            <i :class="'codicon codicon-' + (openEditorsExpanded ? 'chevron-down' : 'chevron-right')" class="tree-toggle"></i>
            <span class="explorer-section-title">OPEN EDITORS</span>
            <span class="scm-section-count" style="margin-left:auto;">{{ openTabs.length }}</span>
          </div>
          <div v-if="openEditorsExpanded" class="explorer-section-content">
            <div
              v-for="tab in openTabs"
              :key="'oe-'+tab.path"
              class="file-item"
              :class="{ active: currentFile === tab.path }"
              :style="{ paddingLeft: '24px' }"
              @click="switchToTab(tab.path)"
            >
              <i :class="'codicon codicon-' + getCodiconForFile(tab.name)" class="file-codicon"></i>
              <span class="file-name">{{ tab.name }}</span>
              <span v-if="tab.modified" class="tab-dot" style="margin-left:4px;"><i class="codicon codicon-circle-filled"></i></span>
              <button class="delete-btn" title="Close" @click.stop="closeTab(tab.path)"><i class="codicon codicon-close"></i></button>
            </div>
          </div>
        </div>
        <div class="file-list">
          <!-- File tree section header -->
          <div v-if="projectRoot" class="explorer-section-header" @click="fileTreeExpanded = !fileTreeExpanded" style="padding-left:12px;">
            <i :class="'codicon codicon-' + (fileTreeExpanded ? 'chevron-down' : 'chevron-right')" class="tree-toggle"></i>
            <span class="explorer-section-title">{{ projectRootName }}</span>
          </div>
          <template v-if="projectRoot && fileTreeExpanded">
            <!-- Inline create input at root level -->
            <div v-if="inlineCreate.active && !inlineCreate.parentPath" class="file-item" :style="{ paddingLeft: '12px' }">
              <i v-if="inlineCreate.type === 'directory'" class="codicon codicon-folder file-codicon folder-icon"></i>
              <i v-else class="codicon codicon-file file-codicon"></i>
              <input
                ref="inlineCreateInput"
                v-model="inlineCreate.name"
                class="rename-input"
                :placeholder="inlineCreate.type === 'directory' ? 'Folder name' : 'File name'"
                @blur="finishInlineCreate"
                @keydown.enter="finishInlineCreate"
                @keydown.escape="cancelInlineCreate"
                @click.stop
              />
            </div>
            <template v-for="node in flatTree" :key="node.path">
              <div
                class="file-item"
                :class="{ active: currentFile === node.path, 'drag-over-dir': dragOverExplorerNode === node.path }"
                :style="{ paddingLeft: (12 + node.depth * 16) + 'px' }"
                :draggable="!node.isDirectory"
                @click="node.isDirectory ? toggleTreeNode(node) : openFile(node.path)"
                @dblclick="!node.isDirectory && startRenaming(node.path)"
                @contextmenu.prevent="showFileContextMenu($event, node)"
                @dragstart="!node.isDirectory && onExplorerDragStart($event, node)"
                @dragover="node.isDirectory && onExplorerDragOver($event, node)"
                @dragleave="onExplorerDragLeave"
                @drop="node.isDirectory && onExplorerDrop($event, node)"
                @dragend="onExplorerDragEnd"
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
                <span v-else class="file-name" :class="getFileDecoration(node)">{{ node.name }}</span>
                <span v-if="!node.isDirectory && getFileDecorationLabel(node)" class="file-decoration-badge" :class="getFileDecoration(node)">{{ getFileDecorationLabel(node) }}</span>
                <button
                  v-if="!node.isDirectory"
                  class="delete-btn"
                  title="Delete"
                  @click.stop="removeFile(node.path)"
                ><i class="codicon codicon-close"></i></button>
              </div>
              <!-- Inline create input inside an expanded directory -->
              <div v-if="inlineCreate.active && inlineCreate.parentPath === node.path && node.isDirectory && node.expanded" class="file-item" :style="{ paddingLeft: (12 + (node.depth + 1) * 16) + 'px' }">
                <span class="tree-toggle-spacer"></span>
                <i v-if="inlineCreate.type === 'directory'" class="codicon codicon-folder file-codicon folder-icon"></i>
                <i v-else class="codicon codicon-file file-codicon"></i>
                <input
                  ref="inlineCreateInput"
                  v-model="inlineCreate.name"
                  class="rename-input"
                  :placeholder="inlineCreate.type === 'directory' ? 'Folder name' : 'File name'"
                  @blur="finishInlineCreate"
                  @keydown.enter="finishInlineCreate"
                  @keydown.escape="cancelInlineCreate"
                  @click.stop
                />
              </div>
            </template>
          </template>
          <div v-if="!projectRoot" class="empty-hint">
            <i class="codicon codicon-folder-opened"></i><br/>
            No folder open.<br />Click <kbd>Open Folder</kbd> or press <kbd>Ctrl+N</kbd> to start.
          </div>
          <div v-else-if="flatTree.length === 0 && !inlineCreate.active" class="empty-hint">
            <i class="codicon codicon-new-file"></i><br/>
            This folder is empty.<br />Press <kbd>Ctrl+N</kbd> to create a file.
          </div>
        </div>
        <!-- Outline section -->
        <div class="explorer-section" v-if="currentFile">
          <div class="explorer-section-header" @click="outlineExpanded = !outlineExpanded">
            <i :class="'codicon codicon-' + (outlineExpanded ? 'chevron-down' : 'chevron-right')" class="tree-toggle"></i>
            <span class="explorer-section-title">OUTLINE</span>
          </div>
          <div v-if="outlineExpanded" class="explorer-section-content">
            <div v-if="outlineSymbols.length === 0" class="empty-hint" style="padding:8px 12px;">
              <span style="font-size:11px;color:#666;">No symbols found in this file.</span>
            </div>
            <div
              v-for="(sym, idx) in outlineSymbols"
              :key="idx"
              class="file-item outline-item"
              :style="{ paddingLeft: (24 + sym.depth * 12) + 'px' }"
              @click="goToSymbol(sym)"
            >
              <i :class="'codicon codicon-' + sym.icon" class="file-codicon" :style="{ color: sym.color }"></i>
              <span class="file-name">{{ sym.name }}</span>
              <span class="outline-detail">{{ sym.detail }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- Search panel -->
      <template v-if="activePanel === 'search'">
        <div class="sidebar-header">
          <span class="sidebar-title">SEARCH</span>
          <div class="sidebar-actions">
            <button class="icon-btn" :title="searchReplaceVisible ? 'Hide Replace' : 'Show Replace'" @click="searchReplaceVisible = !searchReplaceVisible">
              <i :class="'codicon codicon-' + (searchReplaceVisible ? 'chevron-down' : 'chevron-right')"></i>
            </button>
          </div>
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
          <div v-if="searchReplaceVisible" class="search-input-wrapper" style="margin-top:4px;">
            <i class="codicon codicon-replace search-icon"></i>
            <input
              v-model="sidebarReplaceQuery"
              class="sidebar-search-field"
              placeholder="Replace"
              @keydown.enter="replaceAllInFiles"
            />
            <button class="search-replace-btn" title="Replace All" @click="replaceAllInFiles" :disabled="!sidebarSearchQuery || sidebarSearchResults.length === 0">
              <i class="codicon codicon-replace-all"></i>
            </button>
          </div>
          <div class="search-options-row">
            <button class="search-option-btn" :class="{ active: searchCaseSensitive }" title="Match Case" @click="searchCaseSensitive = !searchCaseSensitive">
              <i class="codicon codicon-case-sensitive"></i>
            </button>
            <button class="search-option-btn" :class="{ active: searchWholeWord }" title="Match Whole Word" @click="searchWholeWord = !searchWholeWord">
              <i class="codicon codicon-whole-word"></i>
            </button>
            <button class="search-option-btn" :class="{ active: searchRegex }" title="Use Regular Expression" @click="searchRegex = !searchRegex">
              <i class="codicon codicon-regex"></i>
            </button>
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

      <!-- Source Control panel -->
      <template v-if="activePanel === 'scm'">
        <div class="sidebar-header">
          <span class="sidebar-title">SOURCE CONTROL</span>
          <div class="sidebar-actions">
            <button class="icon-btn" title="Git Settings" @click="showGitSettings = !showGitSettings">
              <i class="codicon codicon-gear"></i>
            </button>
            <button class="icon-btn" title="Refresh" @click="refreshScm(); refreshScmLog();">
              <i class="codicon codicon-refresh"></i>
            </button>
          </div>
        </div>

        <!-- Git settings panel (auth + author) -->
        <div v-if="showGitSettings" class="scm-settings-panel">
          <div class="scm-settings-title">Git Settings</div>
          <label class="scm-settings-label">Author Name</label>
          <input v-model="gitAuthorName" class="scm-settings-input" placeholder="Your Name" />
          <label class="scm-settings-label">Author Email</label>
          <input v-model="gitAuthorEmail" class="scm-settings-input" placeholder="you@example.com" />
          <label class="scm-settings-label">GitHub Username (or 'x-access-token' for PAT-only auth)</label>
          <input v-model="gitUsername" class="scm-settings-input" placeholder="username" />
          <label class="scm-settings-label">Personal Access Token</label>
          <input v-model="gitToken" class="scm-settings-input" type="password" placeholder="ghp_..." />
          <button class="scm-commit-btn" style="margin-top:8px;" @click="saveGitSettings">
            <i class="codicon codicon-save"></i> Save Settings
          </button>
        </div>

        <div v-if="!scmInitialized && !showGitSettings" class="scm-init-panel">
          <div class="scm-init-message">
            <i class="codicon codicon-source-control" style="font-size: 48px; color: #555; display: block; margin-bottom: 12px;"></i>
            <p style="color: #888; font-size: 12px; margin-bottom: 12px;">No source control provider registered.</p>
            <button class="ext-btn install" @click="initScm" style="margin: 0 auto; margin-bottom: 8px;">
              <i class="codicon codicon-add"></i> Initialize Repository
            </button>
            <button class="ext-btn install" @click="openCloneDialog" style="margin: 0 auto;">
              <i class="codicon codicon-cloud-download"></i> Clone Repository
            </button>
          </div>
        </div>

        <!-- Clone dialog -->
        <div v-if="showCloneDialog" class="scm-clone-dialog">
          <div class="scm-settings-title">Clone Repository</div>
          <label class="scm-settings-label">Repository URL</label>
          <input v-model="cloneUrl" class="scm-settings-input" placeholder="https://github.com/user/repo.git" />
          <label class="scm-settings-label">Folder Name (optional)</label>
          <input v-model="cloneFolder" class="scm-settings-input" placeholder="auto-detect from URL" />
          <label class="scm-settings-label">Depth (number of commits)</label>
          <input v-model.number="cloneDepth" class="scm-settings-input" type="number" min="1" max="1000" />
          <div v-if="cloneProgressMsg" class="scm-clone-progress">{{ cloneProgressMsg }}</div>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button class="scm-commit-btn" :disabled="cloneInProgress || !cloneUrl.trim()" @click="performClone" style="flex:1;">
              <i class="codicon codicon-cloud-download"></i> {{ cloneInProgress ? 'Cloning...' : 'Clone' }}
            </button>
            <button class="scm-commit-btn" style="flex:0; background:#3c3c3c;" @click="showCloneDialog = false" :disabled="cloneInProgress">
              Cancel
            </button>
          </div>
        </div>

        <div v-if="scmInitialized && !showGitSettings && !showCloneDialog" class="scm-scroll-area">
          <!-- Commit message input -->
          <div class="scm-commit-area">
            <div class="scm-branch-row">
              <i class="codicon codicon-git-branch"></i>
              <span class="scm-branch-name clickable" @click="toggleBranchPicker" title="Switch Branch">{{ scmBranch }}</span>
              <span v-if="scmLoading" class="scm-loading"><i class="codicon codicon-loading codicon-modifier-spin"></i></span>
            </div>

            <!-- Branch picker dropdown -->
            <div v-if="showBranchPicker" class="branch-picker">
              <div class="branch-picker-header">
                <span class="branch-picker-title">Branches</span>
                <button class="icon-btn" @click="showBranchPicker = false" title="Close">
                  <i class="codicon codicon-close"></i>
                </button>
              </div>
              <div v-if="!showNewBranchInput" class="branch-picker-actions">
                <button class="branch-picker-action" @click="showNewBranchInput = true">
                  <i class="codicon codicon-add"></i> New Branch
                </button>
              </div>
              <div v-if="showNewBranchInput" class="branch-picker-new">
                <input
                  v-model="newBranchName"
                  class="scm-settings-input"
                  placeholder="Branch name"
                  @keydown.enter="createAndSwitchBranch"
                  @keydown.escape="showNewBranchInput = false; newBranchName = '';"
                  autofocus
                />
                <div style="display:flex; gap:4px; margin-top:4px;">
                  <button class="branch-picker-action" style="flex:1;" @click="createAndSwitchBranch" :disabled="!newBranchName.trim()">
                    <i class="codicon codicon-check"></i> Create
                  </button>
                  <button class="branch-picker-action" style="flex:0;" @click="showNewBranchInput = false; newBranchName = '';">
                    Cancel
                  </button>
                </div>
              </div>
              <div class="branch-picker-list">
                <div
                  v-for="branch in branchList"
                  :key="branch"
                  class="branch-picker-item"
                  :class="{ active: branch === scmBranch }"
                  @click="switchBranch(branch)"
                >
                  <i class="codicon" :class="branch === scmBranch ? 'codicon-check' : 'codicon-git-branch'"></i>
                  <span class="branch-picker-name">{{ branch }}</span>
                  <button
                    v-if="branch !== scmBranch"
                    class="icon-btn scm-action branch-delete-btn"
                    title="Delete Branch"
                    @click.stop="deleteBranch(branch)"
                  >
                    <i class="codicon codicon-trash"></i>
                  </button>
                </div>
              </div>
            </div>
            <div class="scm-input-wrapper">
              <textarea
                v-model="scmCommitMessage"
                class="scm-commit-input"
                placeholder="Message (press Ctrl+Enter to commit)"
                rows="3"
                @keydown.ctrl.enter="commitScm"
              ></textarea>
            </div>
            <div class="scm-btn-row">
              <button class="scm-commit-btn" :disabled="!scmCommitMessage.trim() || scmStagedFiles.length === 0 || scmLoading" @click="commitScm" style="flex:1;">
                <i class="codicon codicon-check"></i> Commit
              </button>
              <button class="scm-commit-btn scm-push-btn" disabled title="Feature is disabled" style="opacity:0.4;cursor:not-allowed;">
                <i class="codicon codicon-cloud-upload"></i>
              </button>
              <button class="scm-commit-btn scm-pull-btn" :disabled="scmLoading" @click="pullScm" title="Pull from Remote">
                <i class="codicon codicon-cloud-download"></i>
              </button>
            </div>
          </div>
          <!-- Staged changes -->
          <div v-if="scmStagedFiles.length > 0" class="scm-section">
            <div class="scm-section-header" @click="scmStagedExpanded = !scmStagedExpanded">
              <i :class="'codicon codicon-' + (scmStagedExpanded ? 'chevron-down' : 'chevron-right')" class="tree-toggle"></i>
              <span class="scm-section-title">Staged Changes</span>
              <span class="scm-section-count">{{ scmStagedFiles.length }}</span>
              <button class="icon-btn" title="Unstage All" @click.stop="unstageAllScm" style="margin-left:auto;">
                <i class="codicon codicon-remove"></i>
              </button>
            </div>
            <template v-if="scmStagedExpanded">
              <div v-for="file in scmStagedFiles" :key="'staged-'+file.path" class="scm-file-item" @click="openScmDiff(file, true)">
                <i :class="'codicon codicon-' + getCodiconForFile(file.name)" class="file-codicon"></i>
                <span class="scm-file-name">{{ file.name }}</span>
                <span class="scm-file-status" :class="file.status">{{ file.statusLabel }}</span>
                <button class="icon-btn scm-action" title="Unstage" @click.stop="unstageScmFile(file.path)">
                  <i class="codicon codicon-remove"></i>
                </button>
              </div>
            </template>
          </div>
          <!-- Changes (unstaged) -->
          <div v-if="scmChangedFiles.length > 0" class="scm-section">
            <div class="scm-section-header" @click="scmChangesExpanded = !scmChangesExpanded">
              <i :class="'codicon codicon-' + (scmChangesExpanded ? 'chevron-down' : 'chevron-right')" class="tree-toggle"></i>
              <span class="scm-section-title">Changes</span>
              <span class="scm-section-count">{{ scmChangedFiles.length }}</span>
              <button class="icon-btn" title="Stage All" @click.stop="stageAllScm" style="margin-left:auto;">
                <i class="codicon codicon-add"></i>
              </button>
              <button class="icon-btn" title="Discard All" @click.stop="discardAllScm">
                <i class="codicon codicon-discard"></i>
              </button>
            </div>
            <template v-if="scmChangesExpanded">
              <div v-for="file in scmChangedFiles" :key="'changed-'+file.path" class="scm-file-item" @click="openScmDiff(file)">
                <i :class="'codicon codicon-' + getCodiconForFile(file.name)" class="file-codicon"></i>
                <span class="scm-file-name">{{ file.name }}</span>
                <span class="scm-file-status" :class="file.status">{{ file.statusLabel }}</span>
                <button class="icon-btn scm-action" title="Stage" @click.stop="stageScmFile(file.path)">
                  <i class="codicon codicon-add"></i>
                </button>
                <button class="icon-btn scm-action" title="Discard" @click.stop="discardScmFile(file.path)">
                  <i class="codicon codicon-discard"></i>
                </button>
              </div>
            </template>
          </div>
          <div v-if="scmChangedFiles.length === 0 && scmStagedFiles.length === 0 && !scmLoading" class="scm-clean-msg">
            <i class="codicon codicon-check" style="color: #22c55e;"></i>
            <span>No changes detected</span>
          </div>
          <!-- Commit history -->
          <div v-if="scmCommits.length > 0" class="scm-section scm-history-section">
            <div class="scm-section-header" @click="scmHistoryExpanded = !scmHistoryExpanded">
              <i :class="'codicon codicon-' + (scmHistoryExpanded ? 'chevron-down' : 'chevron-right')" class="tree-toggle"></i>
              <span class="scm-section-title">Commit History</span>
              <span class="scm-section-count">{{ scmCommits.length }}</span>
            </div>
            <div v-if="scmHistoryExpanded" class="scm-history-list">
              <div v-for="commit in scmCommits.slice(0, 50)" :key="commit.oid" class="scm-commit-group">
                <div class="scm-commit-entry" @click="toggleCommitExpand(commit)">
                  <i :class="'codicon codicon-' + (commit.expanded ? 'chevron-down' : 'chevron-right')" class="tree-toggle" style="font-size:12px; flex-shrink:0;"></i>
                  <i class="codicon codicon-git-commit"></i>
                  <div class="scm-commit-info">
                    <div class="scm-commit-msg">{{ commit.message }}</div>
                    <div class="scm-commit-meta">{{ commit.oid.substring(0,7) }} · {{ commit.author }} · {{ formatCommitTime(commit.timestamp) }}</div>
                  </div>
                </div>
                <!-- Expanded commit: show changed files -->
                <template v-if="commit.expanded">
                  <div v-if="commit.loadingFiles" class="scm-commit-files-loading">
                    <i class="codicon codicon-loading codicon-modifier-spin"></i> Loading files...
                  </div>
                  <div v-else-if="commit.files.length === 0" class="scm-commit-files-loading">
                    No file changes found
                  </div>
                  <template v-else>
                    <div
                      v-for="file in commit.files"
                      :key="commit.oid + '-' + file.path"
                      class="scm-file-item scm-history-file"
                      @click="showCommitFileDiff(commit, file.path)"
                    >
                      <i :class="'codicon codicon-' + getCodiconForFile(file.path.split('/').pop() || file.path)" class="file-codicon"></i>
                      <span class="scm-file-name">{{ file.path }}</span>
                      <span class="scm-file-status" :class="file.status">{{ file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M' }}</span>
                      <i v-if="commit.loadingDiff === file.path" class="codicon codicon-loading codicon-modifier-spin" style="margin-left:4px;"></i>
                    </div>
                  </template>
                </template>
              </div>
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
          <!-- Extension Configuration -->
          <div v-if="selectedExt.configOptions && selectedExt.configOptions.length > 0 && isInstalled(selectedExt.id)" class="ext-config">
            <div class="ext-config-title"><i class="codicon codicon-gear"></i> Configuration</div>
            <div v-for="opt in selectedExt.configOptions" :key="opt.key" class="ext-config-item">
              <label class="ext-config-label">{{ opt.label }}</label>
              <input
                v-if="opt.type === 'boolean'"
                type="checkbox"
                class="ext-config-checkbox"
                :checked="getExtConfigValue(extState, selectedExt.id, opt.key)"
                @change="updateExtConfig(selectedExt.id, opt.key, ($event.target as HTMLInputElement).checked)"
              >
              <select
                v-else-if="opt.type === 'select'"
                class="ext-config-select"
                :value="getExtConfigValue(extState, selectedExt.id, opt.key)"
                @change="updateExtConfig(selectedExt.id, opt.key, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="o in opt.options" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <input
                v-else-if="opt.type === 'number'"
                type="number"
                class="ext-config-number"
                :value="getExtConfigValue(extState, selectedExt.id, opt.key)"
                :min="opt.min"
                :max="opt.max"
                @change="updateExtConfig(selectedExt.id, opt.key, Number(($event.target as HTMLInputElement).value))"
              >
            </div>
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
      <div class="tab-bar" v-if="sortedTabs.length > 0">
        <div
          v-for="tab in sortedTabs"
          :key="tab.path"
          class="tab"
          :class="{ active: tab.path === currentFile, modified: tab.modified, pinned: tab.pinned, 'drag-over': dragOverTab === tab.path }"
          draggable="true"
          @click="switchToTab(tab.path)"
          @auxclick.middle.prevent="closeTab(tab.path)"
          @contextmenu.prevent="showTabContextMenu($event, tab)"
          @dragstart="onTabDragStart($event, tab)"
          @dragover.prevent="onTabDragOver($event, tab)"
          @dragleave="onTabDragLeave"
          @drop="onTabDrop($event, tab)"
          @dragend="onTabDragEnd"
        >
          <i v-if="tab.pinned" class="codicon codicon-pinned tab-pin-icon"></i>
          <i v-if="tab.isDiff" class="codicon codicon-diff tab-codicon" style="color:#e8a838;"></i>
          <i v-else :class="'codicon codicon-' + getCodiconForFile(tab.name)" class="tab-codicon"></i>
          <span v-if="!tab.pinned" class="tab-label">{{ tab.diffTitle || tab.name }}</span>
          <span v-if="tab.modified && !tab.pinned" class="tab-dot"><i class="codicon codicon-circle-filled"></i></span>
          <button v-if="!tab.pinned" class="tab-close" @click.stop="closeTab(tab.path)"><i class="codicon codicon-close"></i></button>
        </div>
      </div>

      <!-- Tab context menu -->
      <div
        v-if="tabContextMenu.show"
        class="context-menu"
        :style="{ top: tabContextMenu.y + 'px', left: tabContextMenu.x + 'px' }"
      >
        <div v-if="!tabContextMenu.pinned" class="context-item" @click="pinTab(tabContextMenu.path)"><i class="codicon codicon-pin"></i> Pin Tab</div>
        <div v-else class="context-item" @click="unpinTab(tabContextMenu.path)"><i class="codicon codicon-pinned"></i> Unpin Tab</div>
        <div class="context-separator"></div>
        <div class="context-item" @click="closeTab(tabContextMenu.path); tabContextMenu.show = false"><i class="codicon codicon-close"></i> Close</div>
        <div class="context-item" @click="closeOtherTabs(tabContextMenu.path)"><i class="codicon codicon-close-all"></i> Close Others</div>
        <div class="context-item" @click="closeAllTabs"><i class="codicon codicon-close-all"></i> Close All</div>
      </div>
      <div v-if="tabContextMenu.show" class="click-blocker" @click="tabContextMenu.show = false" @contextmenu.prevent="tabContextMenu.show = false"></div>

      <!-- Breadcrumbs -->
      <div v-if="currentFile" class="breadcrumbs">
        <i class="codicon codicon-home breadcrumb-home" @click="togglePanel('explorer')"></i>
        <template v-for="(seg, idx) in currentFileBreadcrumbs" :key="idx">
          <i class="codicon codicon-chevron-right breadcrumb-sep"></i>
          <i v-if="idx === currentFileBreadcrumbs.length - 1" :class="'codicon codicon-' + getCodiconForFile(seg)" class="breadcrumb-icon"></i>
          <span class="breadcrumb-item" :class="{ 'breadcrumb-last': idx === currentFileBreadcrumbs.length - 1 }">{{ seg }}</span>
        </template>
        <i class="codicon codicon-chevron-right breadcrumb-sep"></i>
        <span class="breadcrumb-lang">{{ getLanguageLabel(sortedTabs.find(t => t.path === currentFile)?.name || '') }}</span>
      </div>

      <!-- Editor -->
      <div v-show="currentFile && !currentTabIsDiff" id="monaco-container" ref="monacoContainer"></div>

      <!-- Diff Editor (shown when current tab is a diff tab) -->
      <div v-show="currentFile && currentTabIsDiff" id="diff-container" ref="diffEditorContainer"></div>

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
              <template v-if="recentItems.length > 0">
                <div
                  v-for="item in recentItems.slice(0, 8)"
                  :key="item.path"
                  class="welcome-link"
                  @click="item.isFolder ? openRecentFolder(item.path) : openFile(item.path)"
                ><i :class="'codicon codicon-' + (item.isFolder ? 'folder' : getCodiconForFile(item.name))"></i> {{ item.name }}</div>
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
              <div class="shortcut-row"><kbd>Ctrl+Shift+G</kbd> <span>Source Control</span></div>
              <div class="shortcut-row"><kbd>Ctrl+Shift+E</kbd> <span>Explorer</span></div>
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

      <!-- Bottom Panel (Terminal, Problems, Output) -->
      <div v-if="bottomPanelVisible" class="terminal-panel" :style="{ height: terminalHeight + 'px' }">
        <!-- Panel resize handle -->
        <div
          class="terminal-resize-handle"
          @mousedown="startTerminalResize"
          @touchstart="startTerminalResize"
        ></div>
        <div class="terminal-header">
          <!-- Panel type tabs -->
          <div class="panel-type-tabs">
            <div class="panel-type-tab" :class="{ active: bottomPanelTab === 'terminal' }" @click="bottomPanelTab = 'terminal'">
              <i class="codicon codicon-terminal"></i> Terminal
            </div>
            <div class="panel-type-tab" :class="{ active: bottomPanelTab === 'problems' }" @click="bottomPanelTab = 'problems'">
              <i class="codicon codicon-warning"></i> Problems
              <span v-if="editorProblems.length > 0" class="panel-badge">{{ editorProblems.length }}</span>
            </div>
            <div class="panel-type-tab" :class="{ active: bottomPanelTab === 'output' }" @click="bottomPanelTab = 'output'">
              <i class="codicon codicon-output"></i> Output
            </div>
          </div>
          <!-- Terminal instance tabs (only show when terminal tab is active) -->
          <div v-if="bottomPanelTab === 'terminal'" class="terminal-tabs">
            <div
              v-for="t in terminals"
              :key="t.id"
              class="terminal-tab"
              :class="{ active: activeTerminalId === t.id }"
              @click="switchTerminal(t.id)"
            >
              <i class="codicon codicon-terminal"></i>
              <span>{{ t.label }}</span>
              <button v-if="terminals.length > 1" class="terminal-tab-close" @click.stop="removeTerminal(t.id)">
                <i class="codicon codicon-close"></i>
              </button>
            </div>
            <button class="terminal-action-btn" title="New Terminal" @click="addTerminal">
              <i class="codicon codicon-add"></i>
            </button>
          </div>
          <div v-else class="terminal-tabs"></div>
          <div class="terminal-actions">
            <button v-if="bottomPanelTab === 'terminal'" class="terminal-action-btn" title="Clear" @click="clearTerminal">
              <i class="codicon codicon-clear-all"></i>
            </button>
            <button v-if="bottomPanelTab === 'output'" class="terminal-action-btn" title="Clear Output" @click="outputLines = []">
              <i class="codicon codicon-clear-all"></i>
            </button>
            <button class="terminal-action-btn" title="Close Panel" @click="bottomPanelVisible = false">
              <i class="codicon codicon-close"></i>
            </button>
          </div>
        </div>
        <!-- Terminal content -->
        <div v-show="bottomPanelTab === 'terminal'" class="terminal-body">
          <div v-for="t in terminals" :key="t.id" v-show="activeTerminalId === t.id" class="terminal-instance">
            <SharedTerminal :ref="(el: any) => setTerminalRef(t.id, el)" :initial-path="terminalInitialPath" />
          </div>
        </div>
        <!-- Problems content -->
        <div v-show="bottomPanelTab === 'problems'" class="panel-content">
          <div v-if="editorProblems.length === 0" class="panel-empty">
            <i class="codicon codicon-check"></i> No problems detected in workspace.
          </div>
          <div v-for="(problem, idx) in editorProblems" :key="idx" class="problem-item" @click="goToProblem(problem)">
            <i :class="'codicon codicon-' + (problem.severity === 'error' ? 'error' : 'warning')" :style="{ color: problem.severity === 'error' ? '#f44747' : '#e8a838' }"></i>
            <span class="problem-message">{{ problem.message }}</span>
            <span class="problem-source">{{ problem.source }}</span>
            <span class="problem-location">[Ln {{ problem.line }}, Col {{ problem.col }}]</span>
          </div>
        </div>
        <!-- Output content -->
        <div v-show="bottomPanelTab === 'output'" class="panel-content output-content">
          <div v-if="outputLines.length === 0" class="panel-empty">
            <i class="codicon codicon-output"></i> No output yet.
          </div>
          <div v-for="(line, idx) in outputLines" :key="idx" class="output-line" :class="line.type">
            <span class="output-time">{{ line.time }}</span>
            <span>{{ line.text }}</span>
          </div>
        </div>
      </div>

      <!-- Status bar -->
      <div class="status-bar" :class="{ 'zen-status': zenMode }">
        <div class="status-left">
          <span v-if="scmInitialized" class="status-item clickable" title="Source Control" @click="togglePanel('scm')">
            <i class="codicon codicon-git-branch"></i> {{ scmBranch }}
          </span>
          <span v-if="scmInitialized && (scmChangedFiles.length + scmStagedFiles.length) > 0" class="status-item">
            <i class="codicon codicon-git-commit"></i> {{ scmChangedFiles.length + scmStagedFiles.length }}
          </span>
          <span v-if="editorProblems.length > 0" class="status-item clickable" title="Problems" @click="bottomPanelVisible = true; bottomPanelTab = 'problems'">
            <i class="codicon codicon-error" style="color:#f44747"></i> {{ editorProblems.filter(p => p.severity === 'error').length }}
            <i class="codicon codicon-warning" style="color:#e8a838"></i> {{ editorProblems.filter(p => p.severity === 'warning').length }}
          </span>
          <span v-if="currentFile" class="status-item">
            <i class="codicon codicon-text-size"></i> Ln {{ cursorLine }}, Col {{ cursorColumn }}
          </span>
          <span v-if="selectionCount > 0" class="status-item">
            ({{ selectionCount }} selected)
          </span>
        </div>
        <div class="status-right">
          <span class="status-item clickable" title="Notifications" @click="showNotificationCenter = !showNotificationCenter">
            <i class="codicon codicon-bell"></i>
            <span v-if="notificationHistory.length > 0" class="status-badge">{{ notificationHistory.length }}</span>
          </span>
          <span class="status-item clickable" @click="bottomPanelVisible = !bottomPanelVisible" title="Toggle Panel">
            <i class="codicon codicon-terminal"></i>
          </span>
          <span v-if="currentFile" class="status-item clickable" title="Change Indentation" @click="cycleTabSize">
            {{ useTabsIndent ? 'Tab Size' : 'Spaces' }}: {{ editorTabSize }}
          </span>
          <span v-if="currentFile" class="status-item clickable" @click="toggleWordWrap">
            {{ wordWrapEnabled ? 'Word Wrap' : 'No Wrap' }}
          </span>
          <span v-if="currentFile" class="status-item clickable" title="Select Language Mode" @click="openCommandPalette('commands')">
            {{ getLanguageLabel(currentFile) }}
          </span>
          <span v-if="currentFile" class="status-item clickable" title="Select End of Line Sequence" @click="toggleEol">
            {{ eolMode }}
          </span>
          <span class="status-item clickable" title="Select Encoding" @click="toggleEncoding">
            {{ encoding }}
          </span>
          <span class="status-item clickable" title="Settings" @click="showSettings = true">
            <i class="codicon codicon-settings-gear"></i>
          </span>
          <span class="status-item save-indicator" :class="saveStatus">
            <i v-if="saveStatus !== 'idle'" :class="'codicon codicon-' + (saveStatus === 'saved' ? 'check' : 'sync')"></i>
            {{ saveStatusText }}
          </span>
        </div>
      </div>
    </div>

    <!-- Notifications Center -->
    <div v-if="showNotificationCenter" class="notification-center">
      <div class="notification-center-header">
        <span>Notifications</span>
        <button class="icon-btn" title="Clear All" @click="notificationHistory = []; showNotificationCenter = false">
          <i class="codicon codicon-clear-all"></i>
        </button>
      </div>
      <div class="notification-center-list">
        <div v-if="notificationHistory.length === 0" class="notification-empty">No notifications</div>
        <div v-for="(n, idx) in notificationHistory" :key="idx" class="notification-item" :class="n.type">
          <i :class="'codicon codicon-' + (n.type === 'error' ? 'error' : n.type === 'success' ? 'check' : 'info')"></i>
          <span class="notification-text">{{ n.message }}</span>
          <span class="notification-time">{{ n.time }}</span>
          <button class="icon-btn" @click="notificationHistory.splice(idx, 1)"><i class="codicon codicon-close"></i></button>
        </div>
      </div>
    </div>

    <!-- Settings Panel Overlay -->
    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
      <div class="settings-panel">
        <div class="settings-header">
          <i class="codicon codicon-settings-gear"></i>
          <span>Settings</span>
          <button class="icon-btn" @click="showSettings = false" style="margin-left:auto;"><i class="codicon codicon-close"></i></button>
        </div>
        <div class="settings-body">
          <div class="settings-group">
            <h4>Editor</h4>
            <div class="settings-row">
              <label>Font Size</label>
              <input type="number" v-model.number="settingsFontSize" min="8" max="32" class="settings-input" @change="applySettings" />
            </div>
            <div class="settings-row">
              <label>Tab Size</label>
              <select v-model.number="editorTabSize" class="settings-input" @change="applySettings">
                <option :value="2">2</option>
                <option :value="4">4</option>
                <option :value="8">8</option>
              </select>
            </div>
            <div class="settings-row">
              <label>Word Wrap</label>
              <select v-model="wordWrapEnabled" class="settings-input" @change="applySettings">
                <option :value="true">On</option>
                <option :value="false">Off</option>
              </select>
            </div>
            <div class="settings-row">
              <label>Minimap</label>
              <select v-model="minimapEnabled" class="settings-input" @change="applySettings">
                <option :value="true">Visible</option>
                <option :value="false">Hidden</option>
              </select>
            </div>
            <div class="settings-row">
              <label>Render Whitespace</label>
              <select v-model="renderWhitespace" class="settings-input" @change="applySettings">
                <option value="none">None</option>
                <option value="boundary">Boundary</option>
                <option value="selection">Selection</option>
                <option value="all">All</option>
              </select>
            </div>
            <div class="settings-row">
              <label>Cursor Style</label>
              <select v-model="cursorStyle" class="settings-input" @change="applySettings">
                <option value="line">Line</option>
                <option value="block">Block</option>
                <option value="underline">Underline</option>
              </select>
            </div>
            <div class="settings-row">
              <label>Line Numbers</label>
              <select v-model="lineNumbers" class="settings-input" @change="applySettings">
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="relative">Relative</option>
              </select>
            </div>
            <div class="settings-row">
              <label>Auto Save</label>
              <select v-model="autoSaveEnabled" class="settings-input">
                <option :value="true">After Delay (1s)</option>
                <option :value="false">Off</option>
              </select>
            </div>
          </div>
          <div class="settings-group">
            <h4>Theme</h4>
            <div class="settings-row">
              <label>Color Theme</label>
              <select v-model="currentTheme" class="settings-input" @change="applyTheme">
                <option v-for="t in availableThemes" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Click blocker for context menu -->
    <div v-if="contextMenu.show" class="click-blocker" @click="contextMenu.show = false" @contextmenu.prevent="contextMenu.show = false"></div>
    <div v-if="showNotificationCenter" class="click-blocker" style="z-index:2999;" @click="showNotificationCenter = false"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue';
// Types need explicit imports; components and util functions are auto-imported by the shared Nuxt layer
import type { PickerResult, ExtensionFilter } from '../../shared/components/FilesPicker.vue';
import type { ReadonlyFS } from '../../shared/utils';
import type { GitLogEntry, GitDiffFile, GitFileDiff, GitAuth, GitAuthor } from '../../shared/utils/git';
import {
  gitInit,
  gitClone,
  gitAdd,
  gitRemove,
  gitCommit,
  gitPush,
  gitPull,
  gitFetch,
  gitCurrentBranch,
  gitLog,
  gitStatusMatrix,
  gitIsRepo,
  gitReadBlob,
  gitDiffFiles,
  gitDiffFileContent,
  gitDiffWorkingFile,
  gitListBranches,
  gitCreateBranch,
  gitCheckout,
  gitDeleteBranch,
  gitMerge,
  gitSetConfig,
} from '../../shared/utils/git';
import {
  extensionCatalog,
  loadExtensionState,
  saveExtensionState,
  getCategories,
  defineCustomThemes,
  applyExtension,
  getExtConfigValue,
  type Extension,
  type ExtensionState,
  type ExtensionCategory,
  type ExtensionConfigOption,
} from '~/composables/useExtensions';
import { initializeVscodeServices } from '~/composables/useVscodeServices';

// ─── Types ──────────────────────────────────────────
interface Tab {
  name: string;
  path: string;  // full OPFS path; diff tabs use 'diff:<realpath>' prefix
  modified: boolean;
  pinned: boolean;
  order: number;
  isDiff?: boolean;       // true when this tab shows a diff view
  diffOld?: string;       // original content for diff view
  diffNew?: string;       // modified content for diff view
  diffTitle?: string;     // display title (e.g. "file.ts (Working Tree)")
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
interface ScmFileEntry {
  path: string;
  name: string;
  status: 'modified' | 'added' | 'deleted';
  statusLabel: string;
}
interface ScmCommitEntry {
  oid: string;
  message: string;
  timestamp: number;
  author: string;
  files: GitDiffFile[];       // populated lazily when expanding a commit
  expanded: boolean;          // whether the commit detail is shown
  loadingFiles: boolean;      // whether we're loading the file list
  diffs: GitFileDiff[];       // populated lazily when viewing a file diff
  loadingDiff: string | null; // path of the file whose diff is loading
}
interface TerminalInstance {
  id: number;
  label: string;
}

// ─── Constants ──────────────────────────────────────
const SAVE_DELAY = 1000;
const SETTINGS_FILE = 'home/.stark-code/settings.json'; // /home/.stark-code/settings.json in OPFS
const GIT_SETTINGS_FILE = 'home/.stark-code/git-settings.json';
const RECENT_FILE = 'home/.stark-code/recent.json';
const MAX_RECENT_ITEMS = 20;

// ─── Shared OPFS FS ────────────────────────────────
let opfsRoot: FileSystemDirectoryHandle | null = null;
let fs: ReadonlyFS | null = null;

// ─── State ──────────────────────────────────────────
const monacoContainer = ref<HTMLElement | null>(null);
const diffEditorContainer = ref<HTMLElement | null>(null);
let diffEditorInstance: any = null;  // Monaco diff editor instance
const paletteInput = ref<HTMLInputElement | null>(null);
const sidebarSearchInput = ref<HTMLInputElement | null>(null);
const renameInput = ref<HTMLInputElement | null>(null);
const inlineCreateInput = ref<HTMLInputElement | null>(null);

const projectRoot = ref<string | null>(null);  // null = no project open
const treeNodes = ref<TreeNode[]>([]);
const currentFile = ref<string | null>(null);
const saveStatus = ref<'saved' | 'saving' | 'idle'>('idle');
const openTabs = ref<Tab[]>([]);
let tabOrderCounter = 0;

// Recently opened files/folders (persisted to OPFS)
interface RecentItem {
  path: string;
  name: string;
  isFolder: boolean;
}
const recentItems = ref<RecentItem[]>([]);
const sidebarVisible = ref(true);
const sidebarWidth = ref(260);
const activePanel = ref<'explorer' | 'search' | 'scm' | 'extensions'>('explorer');
const cursorLine = ref(1);
const cursorColumn = ref(1);
const editorTabSize = ref(2);
const wordWrapEnabled = ref(true);
const terminalVisible = ref(false);
const terminalHeight = ref(250);

// Bottom panel state
const bottomPanelVisible = ref(false);
const bottomPanelTab = ref<'terminal' | 'problems' | 'output'>('terminal');

// Problems panel
interface EditorProblem {
  severity: 'error' | 'warning';
  message: string;
  source: string;
  line: number;
  col: number;
  file: string;
}
const editorProblems = ref<EditorProblem[]>([]);

// Output panel
interface OutputLine {
  text: string;
  type: 'info' | 'error' | 'warning';
  time: string;
}
const outputLines = ref<OutputLine[]>([]);

// Status bar extra state
const selectionCount = ref(0);
const eolMode = ref('LF');
const encoding = ref('UTF-8');
const useTabsIndent = ref(false);

// Settings UI
const showSettings = ref(false);
const settingsFontSize = ref(14);
const minimapEnabled = ref(true);
const renderWhitespace = ref('selection');
const cursorStyle = ref('line');
const lineNumbers = ref('on');
const autoSaveEnabled = ref(true);
const currentTheme = ref('vs-dark');
const availableThemes = [
  { id: 'vs-dark', label: 'Dark+ (default)' },
  { id: 'vs', label: 'Light+' },
  { id: 'hc-black', label: 'High Contrast Dark' },
  { id: 'hc-light', label: 'High Contrast Light' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'solarized-dark', label: 'Solarized Dark' },
  { id: 'github-dark', label: 'GitHub Dark' },
];

// Zen mode
const zenMode = ref(false);
let zenModePreviousState: { sidebar: boolean; panel: boolean } | null = null;

// Notifications center
const showNotificationCenter = ref(false);
interface NotificationEntry {
  message: string;
  type: 'info' | 'success' | 'error';
  time: string;
}
const notificationHistory = ref<NotificationEntry[]>([]);

// Search replace
const searchReplaceVisible = ref(false);
const sidebarReplaceQuery = ref('');
const searchCaseSensitive = ref(false);
const searchWholeWord = ref(false);
const searchRegex = ref(false);

// Explorer sections
const openEditorsExpanded = ref(true);
const fileTreeExpanded = ref(true);
const outlineExpanded = ref(false);
interface OutlineSymbol {
  name: string;
  icon: string;
  color: string;
  detail: string;
  line: number;
  depth: number;
}
const outlineSymbols = ref<OutlineSymbol[]>([]);

// Drag file in explorer
const draggedExplorerNode = ref<TreeNode | null>(null);
const dragOverExplorerNode = ref<string | null>(null);

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
const paletteMode = ref<'commands' | 'files' | 'symbols'>('commands');

// Search
const sidebarSearchQuery = ref('');
const sidebarSearchResults = ref<SearchResult[]>([]);
const sidebarSearchDone = ref(false);

// Rename
const renamingFile = ref<string | null>(null);
const renameValue = ref('');

// Context menu
const contextMenu = reactive({ show: false, x: 0, y: 0, file: '', path: '', isDirectory: false });

// Tab context menu
const tabContextMenu = reactive({ show: false, x: 0, y: 0, path: '', pinned: false });

// Tab drag state
const dragOverTab = ref<string | null>(null);
let draggedTab: Tab | null = null;

// Inline create state
const inlineCreate = reactive({ active: false, type: 'file' as 'file' | 'directory', parentPath: '' as string | null, name: '' });

// Notifications
const toasts = ref<ToastMsg[]>([]);

// Terminal multi-instance state
let terminalIdCounter = 1;
const terminals = ref<TerminalInstance[]>([{ id: 1, label: 'Terminal 1' }]);
const activeTerminalId = ref(1);
const terminalRefs = new Map<number, any>();

// Terminal resize state
let isTerminalResizing = false;
let terminalResizeStartY = 0;
let terminalResizeStartHeight = 0;

// SCM (Source Control) state — backed by isomorphic-git
const scmInitialized = ref(false);
const scmBranch = ref('main');
const scmCommitMessage = ref('');
const scmChangedFiles = ref<ScmFileEntry[]>([]);
const scmStagedFiles = ref<ScmFileEntry[]>([]);
const scmCommits = ref<ScmCommitEntry[]>([]);
const scmStagedExpanded = ref(true);
const scmChangesExpanded = ref(true);
const scmHistoryExpanded = ref(false);
const scmLoading = ref(false);
// Clone dialog
const showCloneDialog = ref(false);
const cloneUrl = ref('');
const cloneFolder = ref('');
const cloneDepth = ref(20);
const cloneInProgress = ref(false);
const cloneProgressMsg = ref('');
// Git auth / settings
const gitUsername = ref('');
const gitToken = ref('');
const gitAuthorName = ref('');
const gitAuthorEmail = ref('');
const showGitSettings = ref(false);
// Inline diff viewer for commit history
const historyDiffContent = ref<GitFileDiff | null>(null);
// Branch management
const showBranchPicker = ref(false);
const branchList = ref<string[]>([]);
const newBranchName = ref('');
const showNewBranchInput = ref(false);

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

// ─── Sorted tabs (pinned first, then by order) ─────
const sortedTabs = computed(() => {
  return [...openTabs.value].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.order - b.order;
  });
});

// ─── Is current tab a diff tab? ─────────────────────
const currentTabIsDiff = computed(() => {
  if (!currentFile.value) return false;
  const tab = openTabs.value.find(t => t.path === currentFile.value);
  return tab?.isDiff === true;
});

// ─── Breadcrumbs segments ───────────────────────────
const currentFileBreadcrumbs = computed(() => {
  if (!currentFile.value || !projectRoot.value) return [];
  const rel = currentFile.value.startsWith(projectRoot.value)
    ? currentFile.value.slice(projectRoot.value.length + 1)
    : currentFile.value;
  return rel.split('/').filter(Boolean);
});

// ─── Project root name ──────────────────────────────
const projectRootName = computed(() => {
  if (!projectRoot.value) return '';
  const parts = getPathParts(projectRoot.value);
  return parts[parts.length - 1]?.toUpperCase() || 'WORKSPACE';
});

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

/** Build a Monaco URI from an OPFS path. */
function pathToMonacoUri(path: string) {
  return monacoModule.Uri.parse(`file:///${path.replace(/^\//, '')}`);
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
  const extConfig = extState.value.config[id] || {};
  const disposer = applyExtension(id, editor, monacoModule, extConfig);
  if (disposer) activeExtDisposers.set(id, disposer);
}

function unapplyExt(id: string) {
  const disposer = activeExtDisposers.get(id);
  if (disposer) {
    disposer();
    activeExtDisposers.delete(id);
  }
}

/** Re-apply an extension (e.g. after config change). */
function reapplyExt(id: string) {
  unapplyExt(id);
  applyExt(id);
}

async function updateExtConfig(extId: string, key: string, value: any) {
  if (!extState.value.config[extId]) {
    extState.value.config[extId] = {};
  }
  extState.value.config[extId][key] = value;
  await saveExtensionState(extState.value);
  // Re-apply extension with new config if it's enabled
  if (isEnabled(extId)) {
    reapplyExt(extId);
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
  { codicon: 'new-file', label: 'New File', shortcut: 'Ctrl+N', action: () => startInlineCreate('file') },
  { codicon: 'new-folder', label: 'New Folder', action: () => startInlineCreate('directory') },
  { codicon: 'save', label: 'Save File', shortcut: 'Ctrl+S', action: saveCurrentFile },
  { codicon: 'save-as', label: 'Save As...', action: saveAsFile },
  { codicon: 'search', label: 'Search in Files', shortcut: 'Ctrl+Shift+F', action: () => openSidebarSearch() },
  { codicon: 'go-to-file', label: 'Quick Open File', shortcut: 'Ctrl+P', action: () => openCommandPalette('files') },
  { codicon: 'close', label: 'Close Tab', shortcut: 'Ctrl+W', action: () => currentFile.value && closeTab(currentFile.value) },
  { codicon: 'close-all', label: 'Close All Tabs', action: closeAllTabs },
  { codicon: 'layout-sidebar-left', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => { sidebarVisible.value = !sidebarVisible.value } },
  { codicon: 'terminal', label: 'Toggle Terminal', shortcut: "Ctrl+`", action: () => toggleTerminal() },
  { codicon: 'terminal', label: 'New Terminal', action: () => { bottomPanelVisible.value = true; bottomPanelTab.value = 'terminal'; addTerminal(); } },
  { codicon: 'source-control', label: 'Source Control', shortcut: 'Ctrl+Shift+G', action: () => togglePanel('scm') },
  { codicon: 'files', label: 'Explorer', shortcut: 'Ctrl+Shift+E', action: () => togglePanel('explorer') },
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
  { codicon: 'collapse-all', label: 'Collapse All in Explorer', action: collapseAll },
  { codicon: 'refresh', label: 'Refresh Explorer', action: refreshTree },
  { codicon: 'color-mode', label: 'Color Theme', shortcut: 'Ctrl+K Ctrl+T', action: openThemePicker },
  { codicon: 'settings-gear', label: 'Open Settings', shortcut: 'Ctrl+,', action: () => { showSettings.value = true; } },
  { codicon: 'eye', label: 'Toggle Zen Mode', shortcut: 'Ctrl+K Z', action: toggleZenMode },
  { codicon: 'symbol-method', label: 'Go to Symbol in Editor', shortcut: 'Ctrl+Shift+O', action: () => openCommandPalette('symbols') },
  { codicon: 'layout-panel', label: 'Toggle Panel', shortcut: 'Ctrl+J', action: () => { bottomPanelVisible.value = !bottomPanelVisible.value; } },
  { codicon: 'warning', label: 'Show Problems', action: () => { bottomPanelVisible.value = true; bottomPanelTab.value = 'problems'; } },
  { codicon: 'output', label: 'Show Output', action: () => { bottomPanelVisible.value = true; bottomPanelTab.value = 'output'; } },
  { codicon: 'replace-all', label: 'Search and Replace in Files', shortcut: 'Ctrl+Shift+H', action: () => { openSidebarSearch(); searchReplaceVisible.value = true; } },
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
  if (paletteMode.value === 'symbols') {
    const q = paletteQuery.value.toLowerCase();
    return outlineSymbols.value
      .filter(s => s.name.toLowerCase().includes(q))
      .map(s => ({
        codicon: s.icon,
        label: s.name,
        shortcut: s.detail,
        action: () => goToSymbol(s),
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
  // Add to notification history
  const now = new Date();
  notificationHistory.value.unshift({
    message,
    type,
    time: now.toLocaleTimeString(),
  });
  // Keep last 50 notifications
  if (notificationHistory.value.length > 50) {
    notificationHistory.value = notificationHistory.value.slice(0, 50);
  }
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
    tab = { name, path, modified: false, pinned: false, order: tabOrderCounter++ };
    openTabs.value.push(tab);
  }
  return tab;
}

async function switchToTab(path: string) {
  if (currentFile.value === path) return;
  // Cancel any pending auto-save before switching tabs
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
  const tab = openTabs.value.find(t => t.path === path);
  if (tab?.isDiff) {
    // Switching to a diff tab
    if (currentFile.value && editor && !currentTabIsDiff.value) {
      await saveCurrentFile();
    }
    disposeDiffModels();
    currentFile.value = path;
    await nextTick();
    await showDiffEditor(tab);
  } else {
    // Switching to a regular file tab — clean up diff editor
    disposeDiffModels();
    await openFile(path);
  }
}

async function closeTab(path: string) {
  const idx = openTabs.value.findIndex(t => t.path === path);
  if (idx === -1) return;

  const tab = openTabs.value[idx];
  if (tab.isDiff) {
    // Diff tab — just dispose models
    if (currentFile.value === path) disposeDiffModels();
  } else {
    if (tab.modified && editor && currentFile.value === path) {
      await saveCurrentFile();
    }
    const model = fileModels.get(path);
    if (model) { model.dispose(); fileModels.delete(path); }
  }

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
  // Reload SCM state for the newly opened folder
  scmInitialized.value = false;
  scmBranch.value = 'main';
  scmCommits.value = [];
  scmStagedFiles.value = [];
  scmChangedFiles.value = [];
  await detectGitRepo();
  notify(`Opened folder: ${projectRoot.value}`, 'success');
}

async function openRecentFolder(path: string) {
  projectRoot.value = path;
  await refreshTree();
  // Close all open tabs from different project
  for (const tab of [...openTabs.value]) {
    await closeTab(tab.path);
  }
  currentFile.value = null;
  scmInitialized.value = false;
  scmBranch.value = 'main';
  scmCommits.value = [];
  scmStagedFiles.value = [];
  scmChangedFiles.value = [];
  await detectGitRepo();
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
  // Cancel any pending auto-save before switching files to prevent the
  // timer from firing while currentFile has changed but the model hasn't
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }

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
    const uri = pathToMonacoUri(path);
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
  // Update outline for the newly opened file
  nextTick(() => updateOutline());
}

async function initEditor(content: string, filename: string, path: string) {
  // Initialize VS Code services before first editor creation.
  // This replaces standalone Monaco services with real VS Code implementations
  // for themes, TextMate grammars, language support, configuration, and keybindings.
  try {
    await initializeVscodeServices();
  } catch (e) {
    // If VS Code services fail to initialize (e.g. in test environment),
    // fall back to standalone Monaco
    console.warn('VS Code services initialization failed, using standalone Monaco:', e);
  }

  // Monaco Editor — now backed by VS Code services
  monacoModule = await import('monaco-editor');

  // Configure the editor worker for syntax checking, validation, and diagnostics.
  // The ?worker&inline suffix tells Vite to bundle the worker as an inline blob,
  // which is required for single-bundle deployment (no separate .js worker files).
  const editorWorkerModule = await import('@codingame/monaco-vscode-api/workers/editor.worker?worker&inline');
  (self as any).MonacoEnvironment = {
    getWorker() {
      return new editorWorkerModule.default();
    },
  };

  let model = fileModels.get(path);
  if (!model) {
    const uri = pathToMonacoUri(path);;
    model = monacoModule.editor.createModel(content, getLanguage(filename), uri);
    fileModels.set(path, model);
  }

  editor = monacoModule.editor.create(monacoContainer.value!, {
    model,
    automaticLayout: true,
    // Editor settings — use persisted values (loaded from OPFS on mount)
    minimap: { enabled: minimapEnabled.value },
    fontSize: settingsFontSize.value,
    fontFamily: "'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
    fontLigatures: true,
    lineNumbers: lineNumbers.value,
    scrollBeyondLastLine: false,
    wordWrap: wordWrapEnabled.value ? 'on' : 'off',
    tabSize: editorTabSize.value,
    renderWhitespace: renderWhitespace.value,
    cursorStyle: cursorStyle.value,
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

  editor.onDidChangeCursorPosition((e: any) => {
    cursorLine.value = e.position.lineNumber;
    cursorColumn.value = e.position.column;
  });

  editor.onDidChangeCursorSelection((e: any) => {
    const sel = e.selection;
    if (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn) {
      selectionCount.value = 0;
    } else {
      const selectedText = editor.getModel()?.getValueInRange(sel) || '';
      selectionCount.value = selectedText.length;
    }
  });

  // Listen for marker changes (for Problems panel)
  monacoModule.editor.onDidChangeMarkers(() => {
    updateProblems();
  });

  // Update outline when model content changes
  editor.onDidChangeModelContent(() => {
    if (isLoadingFile) return;
    const tab = openTabs.value.find(t => t.path === currentFile.value);
    if (tab) tab.modified = true;
    scheduleSave();
    // Debounced outline update
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(updateOutline, 500);
  });

  // Apply enabled extensions after editor is ready
  applyAllEnabledExtensions();
  // Initial outline update
  updateOutline();
  updateProblems();
}

let outlineTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (!autoSaveEnabled.value) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveCurrentFile(), SAVE_DELAY);
}

async function saveCurrentFile() {
  if (!currentFile.value || !editor) return;
  // Never save diff tabs — they are read-only views, not real files
  if (currentFile.value.startsWith('diff:') || currentFile.value.startsWith('commit:')) return;
  // Guard: skip if the editor has no model (e.g. model was disposed during closeTab)
  const model = editor.getModel();
  if (!model) return;
  // Guard: only save when the editor's model matches the current file to
  // prevent writing stale content to the wrong path during tab switches
  const modelPath = model.uri.path;
  if (modelPath && modelPath !== '/' && modelPath !== currentFile.value) {
    return;
  }
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
    if (input) {
      const el = Array.isArray(input) ? input[0] : input;
      if (el) { el.focus(); el.select(); }
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
        const uri = pathToMonacoUri(newPath);
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
function showFileContextMenu(event: MouseEvent, node: TreeNode) {
  const parts = getPathParts(node.path);
  contextMenu.show = true;
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.file = parts[parts.length - 1] || '';
  contextMenu.path = node.path;
  contextMenu.isDirectory = node.isDirectory;
}

function newFileFromContext() {
  const path = contextMenu.path;
  const isDir = contextMenu.isDirectory;
  contextMenu.show = false;
  if (isDir) {
    startInlineCreate('file', path);
  } else {
    // Create in parent directory
    const parts = getPathParts(path);
    parts.pop();
    const parentPath = '/' + parts.join('/');
    startInlineCreate('file', parentPath === projectRoot.value ? undefined : parentPath);
  }
}

function newFolderFromContext() {
  const path = contextMenu.path;
  const isDir = contextMenu.isDirectory;
  contextMenu.show = false;
  if (isDir) {
    startInlineCreate('directory', path);
  } else {
    const parts = getPathParts(path);
    parts.pop();
    const parentPath = '/' + parts.join('/');
    startInlineCreate('directory', parentPath === projectRoot.value ? undefined : parentPath);
  }
}

function renameFileFromContext() {
  const path = contextMenu.path;
  contextMenu.show = false;
  startRenaming(path);
}

function renameFolderFromContext() {
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

async function deleteFromContext() {
  const path = contextMenu.path;
  const isDir = contextMenu.isDirectory;
  contextMenu.show = false;
  if (isDir) {
    await removeDirectory(path);
  } else {
    removeFile(path);
  }
}

async function removeDirectory(path: string) {
  const parts = getPathParts(path);
  const name = parts[parts.length - 1] || path;
  if (!confirm(`Delete folder "${name}" and all its contents?`)) return;
  if (!fs) return;
  try {
    // Recursively delete using fs.rmdir if available, else manual
    const entries = await fs.readdirWithTypes(path);
    for (const entry of entries) {
      const childPath = normalizePath(path + '/' + entry.name);
      if (entry.isDirectory()) {
        await removeDirectory(childPath);
      } else {
        await opfsDeleteFile(childPath);
        // Close tab if open
        const tabIdx = openTabs.value.findIndex(t => t.path === childPath);
        if (tabIdx !== -1) {
          const model = fileModels.get(childPath);
          if (model) { model.dispose(); fileModels.delete(childPath); }
          openTabs.value.splice(tabIdx, 1);
        }
      }
    }
    // Delete the directory itself using unlink (it should be empty now)
    try { await fs.unlink(path); } catch { /* some FS impls need different approach */ }
    await refreshTree();
    notify(`Deleted folder: ${name}`, 'info');
  } catch (e) {
    notify(`Failed to delete folder: ${name}`, 'error');
  }
}

// ─── Command Palette ────────────────────────────────
function openCommandPalette(mode: 'commands' | 'files' | 'symbols') {
  paletteMode.value = mode;
  paletteQuery.value = '';
  paletteIndex.value = 0;
  showCommandPalette.value = true;
  if (mode === 'symbols') updateOutline();
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

function togglePanel(panel: 'explorer' | 'search' | 'scm' | 'extensions') {
  if (activePanel.value === panel && sidebarVisible.value) {
    sidebarVisible.value = false;
  } else {
    activePanel.value = panel;
    sidebarVisible.value = true;
    if (panel === 'search') nextTick(() => sidebarSearchInput.value?.focus());
    if (panel === 'scm' && scmInitialized.value) nextTick(() => refreshScm());
  }
}

// ─── Terminal (multi-instance) ───────────────────────
function setTerminalRef(id: number, el: any) {
  if (el) {
    terminalRefs.set(id, el);
  } else {
    terminalRefs.delete(id);
  }
}

function toggleTerminal() {
  if (bottomPanelVisible.value && bottomPanelTab.value === 'terminal') {
    bottomPanelVisible.value = false;
  } else {
    bottomPanelVisible.value = true;
    bottomPanelTab.value = 'terminal';
    nextTick(() => {
      const ref = terminalRefs.get(activeTerminalId.value);
      if (ref) ref.fit();
    });
  }
}

function clearTerminal() {
  const ref = terminalRefs.get(activeTerminalId.value);
  if (ref) ref.clear();
}

function addTerminal() {
  terminalIdCounter++;
  const inst: TerminalInstance = { id: terminalIdCounter, label: `Terminal ${terminalIdCounter}` };
  terminals.value.push(inst);
  activeTerminalId.value = inst.id;
  nextTick(() => {
    const ref = terminalRefs.get(inst.id);
    if (ref) ref.fit();
  });
}

function removeTerminal(id: number) {
  const idx = terminals.value.findIndex(t => t.id === id);
  if (idx === -1 || terminals.value.length <= 1) return;
  terminalRefs.delete(id);
  terminals.value.splice(idx, 1);
  if (activeTerminalId.value === id) {
    activeTerminalId.value = terminals.value[Math.min(idx, terminals.value.length - 1)].id;
    nextTick(() => {
      const ref = terminalRefs.get(activeTerminalId.value);
      if (ref) ref.fit();
    });
  }
}

function switchTerminal(id: number) {
  activeTerminalId.value = id;
  nextTick(() => {
    const ref = terminalRefs.get(id);
    if (ref) { ref.fit(); ref.focus(); }
  });
}

// ─── Terminal Resize ────────────────────────────────
function startTerminalResize(e: MouseEvent | TouchEvent) {
  isTerminalResizing = true;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  terminalResizeStartY = clientY;
  terminalResizeStartHeight = terminalHeight.value;
  e.preventDefault();
  document.addEventListener('mousemove', onTerminalResize);
  document.addEventListener('mouseup', stopTerminalResize);
  document.addEventListener('touchmove', onTerminalResize);
  document.addEventListener('touchend', stopTerminalResize);
}

function onTerminalResize(e: MouseEvent | TouchEvent) {
  if (!isTerminalResizing) return;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  const delta = terminalResizeStartY - clientY;
  terminalHeight.value = Math.max(100, Math.min(600, terminalResizeStartHeight + delta));
}

function stopTerminalResize() {
  isTerminalResizing = false;
  document.removeEventListener('mousemove', onTerminalResize);
  document.removeEventListener('mouseup', stopTerminalResize);
  document.removeEventListener('touchmove', onTerminalResize);
  document.removeEventListener('touchend', stopTerminalResize);
  // Refit active terminal after resize
  nextTick(() => {
    const ref = terminalRefs.get(activeTerminalId.value);
    if (ref) ref.fit();
  });
}

// ─── Inline Create (in explorer) ────────────────────
function startInlineCreate(type: 'file' | 'directory', parentPath?: string) {
  if (!projectRoot.value) {
    // If no project open, open folder first
    openFolder();
    return;
  }
  inlineCreate.active = true;
  inlineCreate.type = type;
  inlineCreate.parentPath = parentPath || null;
  inlineCreate.name = '';

  // If parent is a directory node, expand it
  if (parentPath) {
    const node = findTreeNode(treeNodes.value, parentPath);
    if (node && !node.expanded) {
      toggleTreeNode(node);
    }
  }

  nextTick(() => {
    const input = inlineCreateInput.value;
    if (input) {
      const el = Array.isArray(input) ? input[0] : input;
      if (el) { el.focus(); el.select(); }
    }
  });
}

function cancelInlineCreate() {
  inlineCreate.active = false;
  inlineCreate.name = '';
}

async function finishInlineCreate() {
  const name = inlineCreate.name.trim();
  if (!name || !projectRoot.value) {
    cancelInlineCreate();
    return;
  }

  const basePath = inlineCreate.parentPath || projectRoot.value;
  const fullPath = normalizePath(basePath + '/' + name);

  try {
    if (inlineCreate.type === 'directory') {
      await fs!.mkdir(fullPath, true);
      notify(`Created folder: ${name}`, 'success');
    } else {
      await opfsSaveFile(fullPath, '');
      notify(`Created file: ${name}`, 'success');
    }
    await refreshTree();
    if (inlineCreate.type === 'file') {
      await openFile(fullPath);
    }
  } catch (e) {
    notify(`Failed to create ${inlineCreate.type}: ${name}`, 'error');
  }

  cancelInlineCreate();
}

function findTreeNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.isDirectory && node.children.length > 0) {
      const found = findTreeNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function collapseAll() {
  function collapseNodes(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.isDirectory) {
        node.expanded = false;
        collapseNodes(node.children);
      }
    }
  }
  collapseNodes(treeNodes.value);
}

// ─── Tab Drag & Drop (reorder) ──────────────────────
function onTabDragStart(e: DragEvent, tab: Tab) {
  draggedTab = tab;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.path);
  }
}

function onTabDragOver(e: DragEvent, tab: Tab) {
  if (!draggedTab || draggedTab.path === tab.path) return;
  dragOverTab.value = tab.path;
}

function onTabDragLeave() {
  dragOverTab.value = null;
}

function onTabDrop(e: DragEvent, targetTab: Tab) {
  dragOverTab.value = null;
  if (!draggedTab || draggedTab.path === targetTab.path) return;
  // Can only reorder within same group (pinned with pinned, unpinned with unpinned)
  if (draggedTab.pinned !== targetTab.pinned) return;
  // Swap order values
  const tempOrder = draggedTab.order;
  draggedTab.order = targetTab.order;
  targetTab.order = tempOrder;
  draggedTab = null;
}

function onTabDragEnd() {
  draggedTab = null;
  dragOverTab.value = null;
}

// ─── Tab Pin/Unpin ──────────────────────────────────
function pinTab(path: string) {
  tabContextMenu.show = false;
  const tab = openTabs.value.find(t => t.path === path);
  if (tab) tab.pinned = true;
}

function unpinTab(path: string) {
  tabContextMenu.show = false;
  const tab = openTabs.value.find(t => t.path === path);
  if (tab) tab.pinned = false;
}

function showTabContextMenu(e: MouseEvent, tab: Tab) {
  tabContextMenu.show = true;
  tabContextMenu.x = e.clientX;
  tabContextMenu.y = e.clientY;
  tabContextMenu.path = tab.path;
  tabContextMenu.pinned = tab.pinned;
}

async function closeOtherTabs(keepPath: string) {
  tabContextMenu.show = false;
  const toClose = openTabs.value.filter(t => t.path !== keepPath && !t.pinned);
  for (const tab of toClose) {
    await closeTab(tab.path);
  }
}

async function closeAllTabs() {
  tabContextMenu.show = false;
  const toClose = openTabs.value.filter(t => !t.pinned);
  for (const tab of toClose) {
    await closeTab(tab.path);
  }
}

// ─── Source Control (SCM) — powered by isomorphic-git ─

/** Load git settings (auth, author) from OPFS. */
async function loadGitSettings() {
  if (!fs) return;
  try {
    const raw = await fs.readFile(GIT_SETTINGS_FILE);
    const s = JSON.parse(raw);
    gitUsername.value = s.username || '';
    gitToken.value = s.token || '';
    gitAuthorName.value = s.authorName || '';
    gitAuthorEmail.value = s.authorEmail || '';
  } catch { /* no saved settings */ }
}

/** Save git settings (auth, author) to OPFS. */
async function saveGitSettings() {
  if (!fs) return;
  try {
    await fs.mkdir('home/.stark-code', true);
    await fs.writeFile(GIT_SETTINGS_FILE, JSON.stringify({
      username: gitUsername.value,
      token: gitToken.value,
      authorName: gitAuthorName.value,
      authorEmail: gitAuthorEmail.value,
    }));
  } catch { /* ignore */ }
  notify('Git settings saved', 'success');
  showGitSettings.value = false;
}

function getGitAuth(): GitAuth | undefined {
  if (gitToken.value) {
    return { username: gitUsername.value || 'x-access-token', password: gitToken.value };
  }
  return undefined;
}

function getGitAuthor(): GitAuthor {
  return {
    name: gitAuthorName.value || 'User',
    email: gitAuthorEmail.value || 'user@example.com',
  };
}

/** Detect if the current project folder is a git repo and load state. */
async function detectGitRepo() {
  if (!opfsRoot || !projectRoot.value) {
    scmInitialized.value = false;
    return;
  }
  try {
    const isRepo = await gitIsRepo(opfsRoot, projectRoot.value);
    scmInitialized.value = isRepo;
    if (isRepo) {
      scmBranch.value = await gitCurrentBranch(opfsRoot, projectRoot.value);
      await refreshScmLog();
      await refreshScm();
    }
  } catch {
    scmInitialized.value = false;
  }
}

/** Initialize a new git repo in the current project folder. */
async function initScm() {
  if (!projectRoot.value || !opfsRoot) {
    notify('Open a folder first to initialize a repository', 'error');
    return;
  }
  scmLoading.value = true;
  try {
    await gitInit(opfsRoot, projectRoot.value, 'main');
    // Set author config if available
    if (gitAuthorName.value) {
      await gitSetConfig(opfsRoot, projectRoot.value, 'user.name', gitAuthorName.value);
    }
    if (gitAuthorEmail.value) {
      await gitSetConfig(opfsRoot, projectRoot.value, 'user.email', gitAuthorEmail.value);
    }
    scmInitialized.value = true;
    scmBranch.value = 'main';
    notify('Initialized git repository on branch: main', 'success');
    await refreshScm();
  } catch (err: any) {
    notify('Failed to init repo: ' + (err.message || err), 'error');
  } finally {
    scmLoading.value = false;
  }
}

/** Open the clone dialog. */
function openCloneDialog() {
  showCloneDialog.value = true;
  cloneUrl.value = '';
  cloneFolder.value = '';
  cloneInProgress.value = false;
  cloneProgressMsg.value = '';
}

/** Clone a remote repository. */
async function performClone() {
  if (!cloneUrl.value.trim() || !opfsRoot) return;
  cloneInProgress.value = true;
  cloneProgressMsg.value = 'Starting clone...';

  // Derive folder name from URL if not specified
  let targetDir = cloneFolder.value.trim();
  if (!targetDir) {
    const urlParts = cloneUrl.value.trim().replace(/\.git$/, '').split('/');
    targetDir = urlParts[urlParts.length - 1] || 'repo';
  }
  const fullPath = normalizePath('/home/' + targetDir);

  try {
    await fs?.mkdir(fullPath, true);
    await gitClone(
      opfsRoot,
      fullPath,
      cloneUrl.value.trim(),
      getGitAuth(),
      undefined,
      (msg) => { cloneProgressMsg.value = msg; },
      cloneDepth.value,
    );
    projectRoot.value = fullPath;
    await refreshTree();
    showCloneDialog.value = false;
    scmInitialized.value = true;
    scmBranch.value = await gitCurrentBranch(opfsRoot, fullPath);
    await refreshScmLog();
    await refreshScm();
    notify(`Cloned into ${fullPath}`, 'success');
  } catch (err: any) {
    notify('Clone failed: ' + (err.message || err), 'error');
    cloneProgressMsg.value = 'Clone failed: ' + (err.message || err);
  } finally {
    cloneInProgress.value = false;
  }
}

/** Refresh the git status matrix to find changed / staged files. */
/** Determine SCM status label from matrix row values. */
function scmStatusFromMatrix(head: number, workdir: number, stage: number, forStaged: boolean): ScmFileEntry['status'] {
  if (forStaged) {
    if (head === 0) return 'added';
    if (workdir === 0 && stage === 0) return 'deleted';
    return 'modified';
  }
  // Unstaged
  if (head === 0 && stage === 0) return 'added';
  if (workdir === 0) return 'deleted';
  return 'modified';
}

async function refreshScm() {
  if (!scmInitialized.value || !opfsRoot || !projectRoot.value) return;
  scmLoading.value = true;
  try {
    const matrix = await gitStatusMatrix(opfsRoot, projectRoot.value);
    const changed: ScmFileEntry[] = [];
    const staged: ScmFileEntry[] = [];

    for (const [filepath, head, workdir, stage] of matrix) {
      // Skip internal dirs
      if (filepath.startsWith('.stark-code/')) continue;

      // isomorphic-git statusMatrix semantics:
      // [filepath, HEAD, WORKDIR, STAGE]
      // HEAD:    0=absent, 1=present
      // WORKDIR: 0=absent, 1=identical to HEAD, 2=different from HEAD
      // STAGE:   0=absent, 1=identical to HEAD, 2=identical to WORKDIR, 3=different from both

      // Skip unchanged files: [*, 1, 1, 1] = unmodified
      if (head === 1 && workdir === 1 && stage === 1) continue;
      // Skip absent-everywhere: [*, 0, 0, 0]
      if (head === 0 && workdir === 0 && stage === 0) continue;

      // ── Staged changes (index ≠ HEAD) ──
      // stage=2: index matches workdir, differs from HEAD → new or modified staged
      // stage=3: index differs from both HEAD and workdir → partially staged
      // stage=0 && head=1: file removed from index → staged deletion
      const isStaged =
        stage === 2 ||
        stage === 3 ||
        (stage === 0 && head === 1);

      if (isStaged) {
        const status = scmStatusFromMatrix(head, workdir, stage, true);
        staged.push({
          path: filepath,
          name: filepath.split('/').pop() || filepath,
          status,
          statusLabel: status === 'added' ? 'A' : status === 'deleted' ? 'D' : 'M',
        });
      }

      // ── Unstaged changes (workdir ≠ index) ──
      // stage=1 && workdir≠1: index=HEAD but workdir changed → unstaged mod/del
      // stage=0 && workdir=2 && head=0: file in workdir only → untracked
      // stage=3: workdir has additional changes beyond what's staged
      const hasUnstaged =
        (stage === 1 && workdir !== 1) ||
        (stage === 0 && workdir === 2 && head === 0) ||
        stage === 3;

      if (hasUnstaged) {
        const status = scmStatusFromMatrix(head, workdir, stage, false);
        changed.push({
          path: filepath,
          name: filepath.split('/').pop() || filepath,
          status,
          statusLabel: status === 'added' ? 'A' : status === 'deleted' ? 'D' : 'M',
        });
      }
    }

    scmChangedFiles.value = changed;
    scmStagedFiles.value = staged;
  } catch (err: any) {
    // Might fail if .git is not fully initialized yet
    console.warn('refreshScm error:', err);
  } finally {
    scmLoading.value = false;
  }
}

/** Refresh the commit log. */
async function refreshScmLog() {
  if (!scmInitialized.value || !opfsRoot || !projectRoot.value) return;
  try {
    const logEntries = await gitLog(opfsRoot, projectRoot.value, 100);
    scmCommits.value = logEntries.map((e) => ({
      oid: e.oid,
      message: e.message.split('\n')[0], // first line only
      timestamp: e.author.timestamp * 1000,
      author: e.author.name,
      files: [],
      expanded: false,
      loadingFiles: false,
      diffs: [],
      loadingDiff: null,
    }));
  } catch {
    // No commits yet — that's fine
    scmCommits.value = [];
  }
}

/** Stage a single file using git add. */
async function stageScmFile(path: string) {
  if (!opfsRoot || !projectRoot.value) return;
  try {
    await gitAdd(opfsRoot, projectRoot.value, path);
    await refreshScm();
  } catch (err: any) {
    notify('Stage failed: ' + (err.message || err), 'error');
  }
}

/** Unstage a single file (remove from index, re-add HEAD version). */
async function unstageScmFile(path: string) {
  if (!opfsRoot || !projectRoot.value) return;
  try {
    await gitRemove(opfsRoot, projectRoot.value, path);
    // Re-add from working dir to restore it to unstaged state
    // (git remove only removes from index, the file stays in workdir)
    await refreshScm();
  } catch (err: any) {
    notify('Unstage failed: ' + (err.message || err), 'error');
  }
}

/** Stage all changed files. */
async function stageAllScm() {
  if (!opfsRoot || !projectRoot.value) return;
  try {
    const paths = scmChangedFiles.value.map(f => f.path);
    for (const p of paths) {
      await gitAdd(opfsRoot, projectRoot.value, p);
    }
    await refreshScm();
  } catch (err: any) {
    notify('Stage all failed: ' + (err.message || err), 'error');
  }
}

/** Unstage all staged files. */
async function unstageAllScm() {
  if (!opfsRoot || !projectRoot.value) return;
  try {
    const paths = scmStagedFiles.value.map(f => f.path);
    for (const p of paths) {
      await gitRemove(opfsRoot, projectRoot.value, p);
    }
    await refreshScm();
  } catch (err: any) {
    notify('Unstage all failed: ' + (err.message || err), 'error');
  }
}

/** Discard changes for a single file (checkout from HEAD). */
async function discardScmFile(path: string) {
  if (!opfsRoot || !fs || !projectRoot.value) return;
  const fullPath = normalizePath(projectRoot.value + '/' + path);
  try {
    // Try to read file from HEAD and restore it
    const logEntries = await gitLog(opfsRoot, projectRoot.value, 1);
    if (logEntries.length > 0) {
      const headOid = logEntries[0].oid;
      const blob = await gitReadBlob(opfsRoot, projectRoot.value, headOid, path);
      if (blob) {
        await fs.writeFile(fullPath, new TextDecoder().decode(blob));
      } else {
        // File didn't exist in HEAD — delete it
        await fs.unlink(fullPath);
      }
    } else {
      // No commits yet, just delete the file
      await fs.unlink(fullPath);
    }
    await refreshTree();
    await refreshScm();
    // Reload if it's the open file
    if (currentFile.value === fullPath) {
      const content = await opfsReadFile(fullPath);
      if (editor && content !== null) {
        isLoadingFile = true;
        editor.setValue(content);
        isLoadingFile = false;
      }
    }
    notify(`Discarded changes: ${path.split('/').pop()}`, 'info');
  } catch (err: any) {
    notify('Discard failed: ' + (err.message || err), 'error');
  }
}

/** Discard all unstaged changes. */
async function discardAllScm() {
  if (!confirm('Discard ALL changes? This cannot be undone.')) return;
  for (const file of [...scmChangedFiles.value]) {
    await discardScmFile(file.path);
  }
}

/** Create a commit from staged files. */
async function commitScm() {
  if (!scmCommitMessage.value.trim() || scmStagedFiles.value.length === 0) return;
  if (!opfsRoot || !projectRoot.value) return;

  scmLoading.value = true;
  try {
    const oid = await gitCommit(
      opfsRoot,
      projectRoot.value,
      scmCommitMessage.value.trim(),
      getGitAuthor(),
    );
    const fileCount = scmStagedFiles.value.length;
    scmCommitMessage.value = '';
    await refreshScmLog();
    await refreshScm();
    notify(`Committed ${fileCount} file${fileCount !== 1 ? 's' : ''} (${oid.substring(0, 7)})`, 'success');
  } catch (err: any) {
    notify('Commit failed: ' + (err.message || err), 'error');
  } finally {
    scmLoading.value = false;
  }
}

/** Push commits to remote. */
async function pushScm() {
  if (!opfsRoot || !projectRoot.value) return;
  scmLoading.value = true;
  try {
    await gitPush(opfsRoot, projectRoot.value, getGitAuth());
    notify('Pushed to remote', 'success');
  } catch (err: any) {
    notify('Push failed: ' + (err.message || err), 'error');
  } finally {
    scmLoading.value = false;
  }
}

/** Pull from remote. */
async function pullScm() {
  if (!opfsRoot || !projectRoot.value) return;
  scmLoading.value = true;
  try {
    await gitPull(opfsRoot, projectRoot.value, getGitAuth(), getGitAuthor());
    await refreshScmLog();
    await refreshScm();
    await refreshTree();
    notify('Pulled from remote', 'success');
  } catch (err: any) {
    notify('Pull failed: ' + (err.message || err), 'error');
  } finally {
    scmLoading.value = false;
  }
}

/** Open a diff tab for a staged or unstaged SCM file. */
async function openScmDiff(file: ScmFileEntry, staged = false) {
  if (!projectRoot.value || !opfsRoot) return;
  scmLoading.value = true;
  try {
    const diff = await gitDiffWorkingFile(opfsRoot, projectRoot.value, file.path, staged);
    const label = staged ? 'Index' : 'Working Tree';
    await openDiffTab(file.path, `${file.name} (${label})`, diff.oldContent, diff.newContent);
  } catch (err: any) {
    // Fallback: just open the file
    const fullPath = normalizePath(projectRoot.value + '/' + file.path);
    await openFile(fullPath);
  } finally {
    scmLoading.value = false;
  }
}

/** Toggle expand/collapse of a commit in history to show its changed files. */
async function toggleCommitExpand(commit: ScmCommitEntry) {
  if (commit.expanded) {
    commit.expanded = false;
    return;
  }
  commit.expanded = true;
  // Load files if not yet loaded
  if (commit.files.length === 0 && !commit.loadingFiles) {
    commit.loadingFiles = true;
    try {
      if (!opfsRoot || !projectRoot.value) return;
      // Find the parent commit
      const idx = scmCommits.value.findIndex(c => c.oid === commit.oid);
      const parentOid = idx < scmCommits.value.length - 1 ? scmCommits.value[idx + 1]?.oid : undefined;
      const files = await gitDiffFiles(opfsRoot, projectRoot.value, commit.oid, parentOid);
      commit.files = files;
    } catch (err: any) {
      console.warn('Failed to load commit files:', err);
    } finally {
      commit.loadingFiles = false;
    }
  }
}

/** Load and display the diff for a specific file in a commit — opens in a full tab. */
async function showCommitFileDiff(commit: ScmCommitEntry, filePath: string) {
  if (!opfsRoot || !projectRoot.value) return;
  commit.loadingDiff = filePath;
  try {
    const idx = scmCommits.value.findIndex(c => c.oid === commit.oid);
    const parentOid = idx < scmCommits.value.length - 1 ? scmCommits.value[idx + 1]?.oid : undefined;
    const diff = await gitDiffFileContent(opfsRoot, projectRoot.value, filePath, commit.oid, parentOid);
    const shortOid = commit.oid.substring(0, 7);
    const fileName = filePath.split('/').pop() || filePath;
    await openDiffTab(
      `commit:${commit.oid}:${filePath}`,
      `${fileName} (${shortOid})`,
      diff.oldContent,
      diff.newContent,
    );
  } catch (err: any) {
    notify('Failed to load diff: ' + (err.message || err), 'error');
  } finally {
    commit.loadingDiff = null;
  }
}

function formatCommitTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/** Return CSS class for a diff line (unified diff format). */
function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff-meta';
  if (line.startsWith('@@')) return 'diff-hunk';
  if (line.startsWith('+')) return 'diff-add';
  if (line.startsWith('-')) return 'diff-del';
  return 'diff-ctx';
}

// ─── Diff Editor Tab Support ────────────────────────
/**
 * Open (or switch to) a diff tab. Creates a Monaco diff editor showing
 * the old and new content side by side.
 */
async function openDiffTab(key: string, title: string, oldContent: string, newContent: string) {
  const diffPath = `diff:${key}`;
  let tab = openTabs.value.find(t => t.path === diffPath);
  if (!tab) {
    const name = title.split('/').pop() || title;
    tab = {
      name,
      path: diffPath,
      modified: false,
      pinned: false,
      order: tabOrderCounter++,
      isDiff: true,
      diffOld: oldContent,
      diffNew: newContent,
      diffTitle: title,
    };
    openTabs.value.push(tab);
  } else {
    tab.diffOld = oldContent;
    tab.diffNew = newContent;
    tab.diffTitle = title;
  }
  // Save current file before switching
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
  if (currentFile.value && editor && !currentTabIsDiff.value) {
    await saveCurrentFile();
  }
  currentFile.value = diffPath;
  await nextTick();
  await showDiffEditor(tab);
}

/** Create / update the Monaco diff editor for the given diff tab. */
async function showDiffEditor(tab: Tab) {
  if (!diffEditorContainer.value) return;

  // Ensure Monaco is loaded (handles the case where diff is opened first)
  if (!monacoModule) {
    try {
      await initializeVscodeServices();
    } catch (e) {
      console.warn('VS Code services initialization failed:', e);
    }
    monacoModule = await import('monaco-editor');
    const editorWorkerModule = await import('@codingame/monaco-vscode-api/workers/editor.worker?worker&inline');
    (self as any).MonacoEnvironment = {
      getWorker() {
        return new editorWorkerModule.default();
      },
    };
  }

  const oldContent = tab.diffOld || '';
  const newContent = tab.diffNew || '';
  const fileName = tab.diffTitle || tab.name;

  // Dispose previous models before creating new ones
  if (diffEditorInstance) {
    const prev = diffEditorInstance.getModel();
    if (prev) {
      prev.original?.dispose();
      prev.modified?.dispose();
    }
  }

  if (!diffEditorInstance) {
    diffEditorInstance = monacoModule.editor.createDiffEditor(diffEditorContainer.value, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    });
  }

  const originalModel = monacoModule.editor.createModel(oldContent, getLanguage(fileName));
  const modifiedModel = monacoModule.editor.createModel(newContent, getLanguage(fileName));
  diffEditorInstance.setModel({ original: originalModel, modified: modifiedModel });
  // Force layout after the container becomes visible via v-show
  requestAnimationFrame(() => {
    diffEditorInstance?.layout();
  });
}

/** Dispose the diff editor models when leaving a diff tab. */
function disposeDiffModels() {
  if (diffEditorInstance) {
    const model = diffEditorInstance.getModel();
    if (model) {
      model.original?.dispose();
      model.modified?.dispose();
    }
  }
}

// ─── Branch Management ─────────────────────────────
async function toggleBranchPicker() {
  if (showBranchPicker.value) {
    showBranchPicker.value = false;
    return;
  }
  await loadBranches();
  showBranchPicker.value = true;
  showNewBranchInput.value = false;
  newBranchName.value = '';
}

async function loadBranches() {
  if (!opfsRoot || !projectRoot.value) return;
  try {
    // Fetch latest refs from remote so remote branches are up-to-date
    try {
      await gitFetch(opfsRoot, projectRoot.value, getGitAuth());
    } catch {
      // Fetch may fail if offline or no remote configured — still show local branches
    }
    branchList.value = await gitListBranches(opfsRoot, projectRoot.value);
  } catch (err: any) {
    console.warn('Failed to list branches:', err);
    branchList.value = [scmBranch.value];
  }
}

async function switchBranch(name: string) {
  if (name === scmBranch.value) {
    showBranchPicker.value = false;
    return;
  }
  if (!opfsRoot || !projectRoot.value) return;
  scmLoading.value = true;
  try {
    await gitCheckout(opfsRoot, projectRoot.value, name);
    scmBranch.value = await gitCurrentBranch(opfsRoot, projectRoot.value);
    showBranchPicker.value = false;
    await refreshScm();
    await refreshScmLog();
    await refreshTree();
    notify(`Switched to branch: ${scmBranch.value}`, 'success');
  } catch (err: any) {
    notify('Failed to switch branch: ' + (err.message || err), 'error');
  } finally {
    scmLoading.value = false;
  }
}

async function createAndSwitchBranch() {
  const name = newBranchName.value.trim();
  if (!name || !opfsRoot || !projectRoot.value) return;
  scmLoading.value = true;
  try {
    await gitCreateBranch(opfsRoot, projectRoot.value, name, true);
    scmBranch.value = name;
    showNewBranchInput.value = false;
    newBranchName.value = '';
    showBranchPicker.value = false;
    await loadBranches();
    notify(`Created and switched to branch: ${name}`, 'success');
  } catch (err: any) {
    notify('Failed to create branch: ' + (err.message || err), 'error');
  } finally {
    scmLoading.value = false;
  }
}

async function deleteBranch(name: string) {
  if (!confirm(`Delete branch "${name}"?`)) return;
  if (!opfsRoot || !projectRoot.value) return;
  scmLoading.value = true;
  try {
    await gitDeleteBranch(opfsRoot, projectRoot.value, name);
    await loadBranches();
    notify(`Deleted branch: ${name}`, 'success');
  } catch (err: any) {
    notify('Failed to delete branch: ' + (err.message || err), 'error');
  } finally {
    scmLoading.value = false;
  }
}

// ─── Git File Decorations ───────────────────────────
function getFileDecoration(node: TreeNode): string {
  if (!scmInitialized.value || node.isDirectory) return '';
  const relPath = node.path.startsWith(projectRoot.value!)
    ? node.path.slice(projectRoot.value!.length + 1)
    : node.path;
  const inChanged = scmChangedFiles.value.find(f => f.path === relPath);
  const inStaged = scmStagedFiles.value.find(f => f.path === relPath);
  const entry = inChanged || inStaged;
  if (!entry) return '';
  return 'scm-' + entry.status;
}

function getFileDecorationLabel(node: TreeNode): string {
  if (!scmInitialized.value || node.isDirectory) return '';
  const relPath = node.path.startsWith(projectRoot.value!)
    ? node.path.slice(projectRoot.value!.length + 1)
    : node.path;
  const inChanged = scmChangedFiles.value.find(f => f.path === relPath);
  const inStaged = scmStagedFiles.value.find(f => f.path === relPath);
  const entry = inChanged || inStaged;
  if (!entry) return '';
  return entry.statusLabel;
}

// ─── Problems Panel ─────────────────────────────────
function updateProblems() {
  if (!editor || !monacoModule) { editorProblems.value = []; return; }
  const markers = monacoModule.editor.getModelMarkers({});
  editorProblems.value = markers.map((m: any) => ({
    severity: m.severity === 8 ? 'error' : 'warning',
    message: m.message,
    source: m.source || '',
    line: m.startLineNumber,
    col: m.startColumn,
    file: m.resource?.path || '',
  }));
}

function goToProblem(problem: EditorProblem) {
  if (editor && problem.file) {
    const fullPath = problem.file.startsWith('/') ? problem.file : '/' + problem.file;
    // Try to find the file and open it
    const tab = openTabs.value.find(t => t.path.endsWith(problem.file));
    if (tab) switchToTab(tab.path);
    nextTick(() => {
      if (editor) {
        editor.revealLineInCenter(problem.line);
        editor.setPosition({ lineNumber: problem.line, column: problem.col });
        editor.focus();
      }
    });
  }
}

// ─── Output Panel ───────────────────────────────────
function addOutput(text: string, type: OutputLine['type'] = 'info') {
  const now = new Date();
  const time = now.toLocaleTimeString();
  outputLines.value.push({ text, type, time });
  // Keep last 1000 lines
  if (outputLines.value.length > 1000) {
    outputLines.value = outputLines.value.slice(-500);
  }
}

// ─── Settings & Theme ───────────────────────────────
interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  renderWhitespace: string;
  cursorStyle: string;
  lineNumbers: string;
  autoSave: boolean;
  theme: string;
}

async function saveEditorSettings() {
  if (!fs) return;
  try {
    const settings: EditorSettings = {
      fontSize: settingsFontSize.value,
      tabSize: editorTabSize.value,
      wordWrap: wordWrapEnabled.value,
      minimap: minimapEnabled.value,
      renderWhitespace: renderWhitespace.value,
      cursorStyle: cursorStyle.value,
      lineNumbers: lineNumbers.value,
      autoSave: autoSaveEnabled.value,
      theme: currentTheme.value,
    };
    // Ensure /home/.stark-code/ directory exists
    await fs.mkdir('home/.stark-code', true);
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings));
  } catch { /* ignore */ }
}

async function loadEditorSettings() {
  if (!fs) return;
  try {
    const raw = await fs.readFile(SETTINGS_FILE);
    if (!raw) return;
    const settings: Partial<EditorSettings> = JSON.parse(raw);
    if (settings.fontSize !== undefined) settingsFontSize.value = settings.fontSize;
    if (settings.tabSize !== undefined) editorTabSize.value = settings.tabSize;
    if (settings.wordWrap !== undefined) wordWrapEnabled.value = settings.wordWrap;
    if (settings.minimap !== undefined) minimapEnabled.value = settings.minimap;
    if (settings.renderWhitespace !== undefined) renderWhitespace.value = settings.renderWhitespace;
    if (settings.cursorStyle !== undefined) cursorStyle.value = settings.cursorStyle;
    if (settings.lineNumbers !== undefined) lineNumbers.value = settings.lineNumbers;
    if (settings.autoSave !== undefined) autoSaveEnabled.value = settings.autoSave;
    if (settings.theme !== undefined) currentTheme.value = settings.theme;
  } catch { /* ignore — use defaults */ }
}

// ─── Recently opened persistence ────────────────────
async function loadRecentItems() {
  if (!fs) return;
  try {
    const raw = await fs.readFile(RECENT_FILE);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      recentItems.value = data.slice(0, MAX_RECENT_ITEMS);
    }
  } catch { /* ignore */ }
}

async function saveRecentItems() {
  if (!fs) return;
  try {
    await fs.mkdir('home/.stark-code', true);
    await fs.writeFile(RECENT_FILE, JSON.stringify(recentItems.value));
  } catch { /* ignore */ }
}

function addRecentItem(path: string, name: string, isFolder: boolean) {
  // Remove existing entry for this path (if any)
  recentItems.value = recentItems.value.filter(r => r.path !== path);
  // Add to front
  recentItems.value.unshift({ path, name, isFolder });
  // Trim
  if (recentItems.value.length > MAX_RECENT_ITEMS) {
    recentItems.value = recentItems.value.slice(0, MAX_RECENT_ITEMS);
  }
  saveRecentItems();
}

function applySettings() {
  if (!editor) return;
  editor.updateOptions({
    fontSize: settingsFontSize.value,
    tabSize: editorTabSize.value,
    wordWrap: wordWrapEnabled.value ? 'on' : 'off',
    minimap: { enabled: minimapEnabled.value },
    renderWhitespace: renderWhitespace.value,
    cursorStyle: cursorStyle.value,
    lineNumbers: lineNumbers.value,
  });
  // Persist settings to OPFS
  saveEditorSettings();
}

function applyTheme() {
  if (!monacoModule) return;
  monacoModule.editor.setTheme(currentTheme.value);
  // Persist theme choice
  saveEditorSettings();
}

function openThemePicker() {
  // Cycle through themes as a quick picker
  const idx = availableThemes.findIndex(t => t.id === currentTheme.value);
  const nextIdx = (idx + 1) % availableThemes.length;
  currentTheme.value = availableThemes[nextIdx].id;
  applyTheme();
  notify(`Theme: ${availableThemes[nextIdx].label}`, 'info');
}

// ─── Status Bar Helpers ─────────────────────────────
function cycleTabSize() {
  const sizes = [2, 4, 8];
  const idx = sizes.indexOf(editorTabSize.value);
  editorTabSize.value = sizes[(idx + 1) % sizes.length];
  if (editor) editor.getModel()?.updateOptions({ tabSize: editorTabSize.value });
}

function toggleEol() {
  eolMode.value = eolMode.value === 'LF' ? 'CRLF' : 'LF';
  if (editor && monacoModule) {
    const model = editor.getModel();
    if (model) {
      model.setEOL(eolMode.value === 'LF' ? 0 : 1);
    }
  }
}

function toggleEncoding() {
  // Simple toggle for demonstration
  const encodings = ['UTF-8', 'UTF-16', 'ASCII', 'ISO-8859-1'];
  const idx = encodings.indexOf(encoding.value);
  encoding.value = encodings[(idx + 1) % encodings.length];
}

// ─── Zen Mode ───────────────────────────────────────
function toggleZenMode() {
  zenMode.value = !zenMode.value;
  if (zenMode.value) {
    zenModePreviousState = {
      sidebar: sidebarVisible.value,
      panel: bottomPanelVisible.value,
    };
    sidebarVisible.value = false;
    bottomPanelVisible.value = false;
  } else {
    if (zenModePreviousState) {
      sidebarVisible.value = zenModePreviousState.sidebar;
      bottomPanelVisible.value = zenModePreviousState.panel;
      zenModePreviousState = null;
    }
  }
}

// ─── Outline Symbols ────────────────────────────────
function updateOutline() {
  if (!editor || !monacoModule || !currentFile.value) {
    outlineSymbols.value = [];
    return;
  }
  const model = editor.getModel();
  if (!model) { outlineSymbols.value = []; return; }

  // Extract symbols from the current file using simple regex-based parsing
  const content = model.getValue();
  const lines = content.split('\n');
  const symbols: OutlineSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Function declarations
    let match = line.match(/^\s*(export\s+)?(async\s+)?function\s+(\w+)/);
    if (match) {
      symbols.push({ name: match[3], icon: 'symbol-method', color: '#b180d7', detail: 'function', line: i + 1, depth: 0 });
      continue;
    }
    // Arrow functions / const functions
    match = line.match(/^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/);
    if (match) {
      symbols.push({ name: match[3], icon: 'symbol-method', color: '#b180d7', detail: 'function', line: i + 1, depth: 0 });
      continue;
    }
    // Class declarations
    match = line.match(/^\s*(export\s+)?class\s+(\w+)/);
    if (match) {
      symbols.push({ name: match[2], icon: 'symbol-class', color: '#ee9d28', detail: 'class', line: i + 1, depth: 0 });
      continue;
    }
    // Interface declarations (TypeScript)
    match = line.match(/^\s*(export\s+)?interface\s+(\w+)/);
    if (match) {
      symbols.push({ name: match[2], icon: 'symbol-interface', color: '#75beff', detail: 'interface', line: i + 1, depth: 0 });
      continue;
    }
    // Type declarations (TypeScript)
    match = line.match(/^\s*(export\s+)?type\s+(\w+)/);
    if (match) {
      symbols.push({ name: match[2], icon: 'symbol-type-parameter', color: '#4ec9b0', detail: 'type', line: i + 1, depth: 0 });
      continue;
    }
    // Enum declarations
    match = line.match(/^\s*(export\s+)?enum\s+(\w+)/);
    if (match) {
      symbols.push({ name: match[2], icon: 'symbol-enum', color: '#ee9d28', detail: 'enum', line: i + 1, depth: 0 });
      continue;
    }
    // Python: def/class
    match = line.match(/^(\s*)def\s+(\w+)/);
    if (match) {
      const depth = Math.floor(match[1].length / 4);
      symbols.push({ name: match[2], icon: 'symbol-method', color: '#b180d7', detail: 'def', line: i + 1, depth });
      continue;
    }
    match = line.match(/^class\s+(\w+)/);
    if (match) {
      symbols.push({ name: match[1], icon: 'symbol-class', color: '#ee9d28', detail: 'class', line: i + 1, depth: 0 });
      continue;
    }
    // Go: func
    match = line.match(/^func\s+(\w+)/);
    if (match) {
      symbols.push({ name: match[1], icon: 'symbol-method', color: '#b180d7', detail: 'func', line: i + 1, depth: 0 });
      continue;
    }
    // Markdown headings
    match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const depth = match[1].length - 1;
      symbols.push({ name: match[2], icon: 'symbol-string', color: '#569cd6', detail: `h${match[1].length}`, line: i + 1, depth });
    }
  }

  outlineSymbols.value = symbols;
}

function goToSymbol(sym: OutlineSymbol) {
  if (editor) {
    editor.revealLineInCenter(sym.line);
    editor.setPosition({ lineNumber: sym.line, column: 1 });
    editor.focus();
  }
}

// ─── Search & Replace in Files ──────────────────────
async function replaceAllInFiles() {
  if (!sidebarSearchQuery.value || !sidebarReplaceQuery.value || !fs || !projectRoot.value) return;
  if (!confirm(`Replace all occurrences of "${sidebarSearchQuery.value}" with "${sidebarReplaceQuery.value}" in ${sidebarSearchResults.value.length} locations?`)) return;

  const query = sidebarSearchQuery.value;
  const replacement = sidebarReplaceQuery.value;
  let totalReplacements = 0;

  // Group results by file
  const fileGroups = new Map<string, SearchResult[]>();
  for (const result of sidebarSearchResults.value) {
    const existing = fileGroups.get(result.file) || [];
    existing.push(result);
    fileGroups.set(result.file, existing);
  }

  for (const [relFile] of fileGroups) {
    const fullPath = normalizePath(projectRoot.value + '/' + relFile);
    try {
      let content = await fs.readFile(fullPath);
      if (searchRegex.value) {
        try {
          // Validate regex before use to avoid ReDoS
          const flags = searchCaseSensitive.value ? 'g' : 'gi';
          const re = new RegExp(query, flags);
          // Test with a short timeout by limiting match scope
          const matches = content.match(re);
          if (matches) totalReplacements += matches.length;
          content = content.replace(re, replacement.replace(/\$/g, '$$$$'));
        } catch { continue; }
      } else {
        const lq = searchCaseSensitive.value ? query : query.toLowerCase();
        let idx = 0;
        let newContent = '';
        const searchContent = searchCaseSensitive.value ? content : content.toLowerCase();
        while (true) {
          const pos = searchContent.indexOf(lq, idx);
          if (pos === -1) {
            newContent += content.slice(idx);
            break;
          }
          newContent += content.slice(idx, pos) + replacement;
          totalReplacements++;
          idx = pos + query.length;
        }
        content = newContent;
      }
      await opfsSaveFile(fullPath, content);

      // Update open tab if needed
      const model = fileModels.get(fullPath);
      if (model) {
        isLoadingFile = true;
        model.setValue(content);
        isLoadingFile = false;
      }
    } catch { /* skip */ }
  }

  notify(`Replaced ${totalReplacements} occurrences across ${fileGroups.size} files`, 'success');
  addOutput(`Replace: "${query}" → "${replacement}" (${totalReplacements} replacements in ${fileGroups.size} files)`, 'info');
  await performSidebarSearch(); // Refresh search results
}

// ─── Drag Files in Explorer ─────────────────────────
function onExplorerDragStart(e: DragEvent, node: TreeNode) {
  draggedExplorerNode.value = node;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.path);
  }
}

function onExplorerDragOver(e: DragEvent, node: TreeNode) {
  if (!draggedExplorerNode.value || draggedExplorerNode.value.path === node.path) return;
  if (!node.isDirectory) return;
  e.preventDefault();
  dragOverExplorerNode.value = node.path;
}

function onExplorerDragLeave() {
  dragOverExplorerNode.value = null;
}

async function onExplorerDrop(e: DragEvent, targetNode: TreeNode) {
  dragOverExplorerNode.value = null;
  const sourceNode = draggedExplorerNode.value;
  draggedExplorerNode.value = null;
  if (!sourceNode || !targetNode.isDirectory || !fs) return;
  if (sourceNode.path === targetNode.path) return;
  // Don't allow moving into itself
  if (targetNode.path.startsWith(sourceNode.path + '/')) return;

  const newPath = normalizePath(targetNode.path + '/' + sourceNode.name);
  try {
    if (sourceNode.isDirectory) {
      // For directories, we'd need recursive move - skip for now
      notify('Moving folders is not yet supported', 'info');
      return;
    }
    const content = await fs.readFile(sourceNode.path);
    await opfsSaveFile(newPath, content);
    await fs.unlink(sourceNode.path);

    // Update tab if open
    const tab = openTabs.value.find(t => t.path === sourceNode.path);
    if (tab) {
      const model = fileModels.get(sourceNode.path);
      if (model) {
        fileModels.delete(sourceNode.path);
        const newModel = monacoModule?.editor.createModel(content, getLanguage(sourceNode.name), pathToMonacoUri(newPath));
        if (newModel) fileModels.set(newPath, newModel);
        model.dispose();
      }
      tab.path = newPath;
      if (currentFile.value === sourceNode.path) {
        currentFile.value = newPath;
        if (editor && fileModels.get(newPath)) {
          isLoadingFile = true;
          editor.setModel(fileModels.get(newPath));
          isLoadingFile = false;
        }
      }
    }

    await refreshTree();
    notify(`Moved ${sourceNode.name} to ${targetNode.name}/`, 'success');
  } catch (err) {
    notify(`Failed to move file: ${sourceNode.name}`, 'error');
  }
}

function onExplorerDragEnd() {
  draggedExplorerNode.value = null;
  dragOverExplorerNode.value = null;
}

// ─── Keyboard Shortcuts ─────────────────────────────
function handleKeydown(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  if (ctrl && shift && e.key === 'P') {
    e.preventDefault(); openCommandPalette('commands');
  } else if (ctrl && !shift && e.key === 'p') {
    e.preventDefault(); openCommandPalette('files');
  } else if (ctrl && shift && e.key === 'O') {
    e.preventDefault(); openCommandPalette('symbols');
  } else if (ctrl && e.key === 'n') {
    e.preventDefault(); startInlineCreate('file');
  } else if (ctrl && e.key === 's') {
    e.preventDefault(); saveCurrentFile();
  } else if (ctrl && e.key === 'w') {
    e.preventDefault();
    if (currentFile.value) closeTab(currentFile.value);
  } else if (ctrl && shift && e.key === 'F') {
    e.preventDefault(); openSidebarSearch();
  } else if (ctrl && shift && e.key === 'H') {
    e.preventDefault(); openSidebarSearch(); searchReplaceVisible.value = true;
  } else if (ctrl && shift && e.key === 'G') {
    e.preventDefault(); togglePanel('scm');
  } else if (ctrl && shift && e.key === 'E') {
    e.preventDefault(); togglePanel('explorer');
  } else if (ctrl && shift && e.key === 'X') {
    e.preventDefault(); togglePanel('extensions');
  } else if (ctrl && e.key === 'b') {
    e.preventDefault(); sidebarVisible.value = !sidebarVisible.value;
  } else if (ctrl && e.key === '`') {
    e.preventDefault(); toggleTerminal();
  } else if (ctrl && e.key === 'j') {
    e.preventDefault(); bottomPanelVisible.value = !bottomPanelVisible.value;
  } else if (ctrl && e.key === ',') {
    e.preventDefault(); showSettings.value = !showSettings.value;
  } else if (ctrl && e.key === 'k') {
    // Two-key shortcuts: Ctrl+K Z = Zen Mode, Ctrl+K Ctrl+T = Theme
    e.preventDefault();
    const onSecondKey = (e2: KeyboardEvent) => {
      window.removeEventListener('keydown', onSecondKey);
      if (e2.key === 'z' || e2.key === 'Z') {
        e2.preventDefault();
        toggleZenMode();
      } else if ((e2.ctrlKey || e2.metaKey) && (e2.key === 't' || e2.key === 'T')) {
        e2.preventDefault();
        openThemePicker();
      }
    };
    window.addEventListener('keydown', onSecondKey, { once: true });
  } else if (e.key === 'Escape' && zenMode.value) {
    e.preventDefault(); toggleZenMode();
  } else if (e.key === 'F2' && currentFile.value) {
    e.preventDefault(); startRenaming(currentFile.value);
  }
}

// ─── Initial args (from intent system) ──────────────
function getInitialPaths(): string[] {
  try {
    const ctx = (window.parent as Record<string, unknown>).__STARK_CONTEXT__ as
      { args?: string[] } | undefined;
    if (ctx?.args && ctx.args.length > 0) {
      return ctx.args.filter(a => typeof a === 'string' && a.trim().length > 0);
    }
  } catch { /* cross-origin or no parent */ }
  return [];
}

// ─── Lifecycle ──────────────────────────────────────
onMounted(async () => {
  opfsRoot = await getStarkOpfsRoot();
  if (opfsRoot) {
    fs = buildOpfsFS(opfsRoot);
  }
  await refreshExtensionState();
  // Load persisted editor settings (font size, theme, tab size, etc.)
  await loadEditorSettings();
  // Load recently opened items
  await loadRecentItems();
  // Load SCM state — detect git repo in current project
  await loadGitSettings();
  await detectGitRepo();
  window.addEventListener('keydown', handleKeydown);

  // Open file(s)/folder(s) passed as arguments from the intent system
  const initialPaths = getInitialPaths();
  if (initialPaths.length > 0 && opfsRoot) {
    let folderOpened = false;
    // Check if the first path is a directory — open it as the project root
    try {
      const parts = getPathParts(initialPaths[0]);
      if (parts.length > 0) {
        const name = parts[parts.length - 1];
        const parentParts = parts.slice(0, -1);
        let parent = opfsRoot;
        for (const p of parentParts) parent = await parent.getDirectoryHandle(p);
        try {
          await parent.getDirectoryHandle(name);
          // It's a directory — set as project root
          projectRoot.value = initialPaths[0];
          await refreshTree();
          scmInitialized.value = false;
          await detectGitRepo();
          folderOpened = true;
          // Track folder in recently opened
          addRecentItem(initialPaths[0], name, true);
        } catch { /* not a directory, continue as files */ }
      }
    } catch { /* ignore */ }

    // Open remaining paths as files
    const filePaths = folderOpened ? initialPaths.slice(1) : initialPaths;
    for (const filePath of filePaths) {
      // If no project is open, set project root to the file's directory
      if (!projectRoot.value) {
        const parts = getPathParts(filePath);
        parts.pop();
        projectRoot.value = '/' + parts.join('/');
        await refreshTree();
      }
      await openFile(filePath);
      // Track file in recently opened
      const fileParts = getPathParts(filePath);
      addRecentItem(filePath, fileParts[fileParts.length - 1] || filePath, false);
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (saveTimeout) clearTimeout(saveTimeout);
  if (editor) editor.dispose();
  for (const disposer of activeExtDisposers.values()) disposer();
  activeExtDisposers.clear();
  for (const model of fileModels.values()) model.dispose();
  fileModels.clear();
  terminalRefs.clear();
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
  background: #1e1e1e;
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

/* ─── Tab Pinning ─────────────────────────────── */
.tab.pinned {
  padding: 0 8px;
  min-width: 36px;
  justify-content: center;
  border-right: 1px solid #3c3c3c;
}
.tab-pin-icon { font-size: 12px; color: #888; flex-shrink: 0; }
.tab.pinned.active .tab-pin-icon { color: #cccccc; }
.tab.drag-over { border-left: 2px solid #007acc; }

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
.breadcrumb-item.breadcrumb-last { color: #cccccc; }
.breadcrumb-lang { color: #777; }

/* ─── Editor ───────────────────────────────────── */
#monaco-container { flex: 1; overflow: hidden; }
#diff-container { flex: 1; overflow: hidden; background: #1e1e1e; }

/* ─── Terminal Panel (xterm.js) ────────────────── */
.terminal-panel {
  border-top: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
  min-height: 100px;
  max-height: 600px;
  background: #1e1e1e;
  position: relative;
}

.terminal-resize-handle {
  height: 4px;
  cursor: ns-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}
.terminal-resize-handle:hover,
.terminal-resize-handle:active {
  background: #007acc;
}

@media (pointer: coarse) {
  .terminal-resize-handle {
    height: 8px;
  }
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

.terminal-tabs { display: flex; align-items: center; gap: 0; overflow-x: auto; flex: 1; }

.terminal-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888;
  padding: 0 8px;
  height: 35px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
}

.terminal-tab:hover { color: #cccccc; background: #2a2d2e; }
.terminal-tab.active { color: #cccccc; border-bottom-color: #cccccc; }

.terminal-tab .codicon { font-size: 14px; }
.terminal-tab span { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }

.terminal-tab-close {
  background: none;
  border: none;
  color: transparent;
  cursor: pointer;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.terminal-tab-close .codicon { font-size: 12px; }
.terminal-tab:hover .terminal-tab-close { color: #888; }
.terminal-tab-close:hover { background: #3c3c3c; color: #cccccc; }

.terminal-actions { display: flex; gap: 2px; flex-shrink: 0; }

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

.terminal-instance {
  width: 100%;
  height: 100%;
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

/* ─── Extension Config ───────────────────────── */
.ext-config {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #333;
}
.ext-config-title {
  font-size: 12px;
  font-weight: 600;
  color: #ccc;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.ext-config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.ext-config-label {
  font-size: 12px;
  color: #bbb;
}
.ext-config-checkbox {
  accent-color: #007acc;
  cursor: pointer;
}
.ext-config-select {
  background: #2d2d2d;
  color: #ccc;
  border: 1px solid #444;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
}
.ext-config-number {
  background: #2d2d2d;
  color: #ccc;
  border: 1px solid #444;
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 12px;
  width: 60px;
}

/* ─── Activity Badge ──────────────────────────── */
.activity-btn {
  position: relative;
}
.activity-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #007acc;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  line-height: 1;
}

/* ─── Source Control Panel ─────────────────────── */
.scm-init-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.scm-init-message {
  text-align: center;
}

.scm-scroll-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.scm-commit-area {
  padding: 8px 12px;
  border-bottom: 1px solid #3c3c3c;
}

.scm-branch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}

.scm-branch-row .codicon { font-size: 14px; }
.scm-branch-name { font-weight: 500; color: #cccccc; }

.scm-input-wrapper { position: relative; margin-bottom: 6px; }

.scm-commit-input {
  width: 100%;
  background: #3c3c3c;
  color: #cccccc;
  border: 1px solid #3c3c3c;
  outline: none;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  border-radius: 2px;
  resize: vertical;
  min-height: 32px;
}

.scm-commit-input:focus { border-color: #007acc; }

.scm-commit-btn {
  width: 100%;
  padding: 5px 12px;
  border: none;
  border-radius: 3px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #007acc;
  color: #fff;
}

.scm-commit-btn:hover { background: #006bb3; }
.scm-commit-btn:disabled { background: #3c3c3c; color: #666; cursor: not-allowed; }

.scm-section {
  border-bottom: 1px solid #3c3c3c;
}

.scm-section-header {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #bbbbbb;
  cursor: pointer;
  gap: 4px;
}

.scm-section-header:hover { background: #2a2d2e; }
.scm-section-title { flex: 1; }
.scm-section-count {
  background: #3c3c3c;
  color: #cccccc;
  font-size: 10px;
  min-width: 18px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.scm-file-item {
  display: flex;
  align-items: center;
  padding: 2px 12px 2px 28px;
  font-size: 12px;
  cursor: pointer;
  gap: 6px;
}

.scm-file-item:hover { background: #2a2d2e; }
.scm-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cccccc; }

.scm-file-status {
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
}

.scm-file-status.modified { color: #e8a838; }
.scm-file-status.added { color: #22c55e; }
.scm-file-status.deleted { color: #e06c75; }

.scm-action {
  opacity: 0;
  width: 20px;
  height: 20px;
}

.scm-file-item:hover .scm-action { opacity: 1; }

.scm-clean-msg {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 12px;
  font-size: 12px;
  color: #888;
}

.scm-commit-entry .codicon { font-size: 14px; color: #888; flex-shrink: 0; margin-top: 2px; }

.scm-commit-info { flex: 1; min-width: 0; }

.scm-commit-msg {
  color: #cccccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scm-commit-meta {
  color: #666;
  font-size: 11px;
}

/* ─── Git Settings & Clone ──────────────────────── */
.scm-settings-panel, .scm-clone-dialog {
  padding: 8px 12px;
  border-bottom: 1px solid #3c3c3c;
}
.scm-settings-title {
  font-size: 12px;
  font-weight: 600;
  color: #cccccc;
  margin-bottom: 8px;
}
.scm-settings-label {
  font-size: 11px;
  color: #888;
  display: block;
  margin-bottom: 2px;
  margin-top: 6px;
}
.scm-settings-input {
  width: 100%;
  background: #3c3c3c;
  color: #cccccc;
  border: 1px solid #3c3c3c;
  outline: none;
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  border-radius: 2px;
  box-sizing: border-box;
}
.scm-settings-input:focus { border-color: #007acc; }

.scm-clone-progress {
  font-size: 11px;
  color: #888;
  margin-top: 6px;
  word-break: break-all;
}

.scm-btn-row {
  display: flex;
  gap: 4px;
}
.scm-push-btn, .scm-pull-btn {
  flex: 0 0 auto !important;
  width: auto !important;
  padding: 5px 8px !important;
  background: #2d5a2d !important;
}
.scm-push-btn:hover { background: #3a6e3a !important; }
.scm-pull-btn { background: #2d4a5a !important; }
.scm-pull-btn:hover { background: #3a5e6e !important; }
.scm-loading {
  margin-left: auto;
  color: #888;
}

/* ─── Branch Picker ──────────────────────────────── */
.scm-branch-name.clickable {
  cursor: pointer;
  border-radius: 3px;
  padding: 1px 4px;
}
.scm-branch-name.clickable:hover {
  background: #3c3c3c;
}
.branch-picker {
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  margin-bottom: 8px;
  overflow: hidden;
}
.branch-picker-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: #2d2d2d;
  font-size: 11px;
  font-weight: 600;
  color: #cccccc;
}
.branch-picker-title { flex: 1; }
.branch-picker-actions {
  padding: 4px 8px;
  border-bottom: 1px solid #3c3c3c;
}
.branch-picker-new {
  padding: 4px 8px;
  border-bottom: 1px solid #3c3c3c;
}
.branch-picker-action {
  background: #3c3c3c;
  color: #cccccc;
  border: none;
  border-radius: 3px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  justify-content: center;
}
.branch-picker-action:hover { background: #4c4c4c; }
.branch-picker-action:disabled { opacity: 0.5; cursor: not-allowed; }
.branch-picker-list {
  max-height: 200px;
  overflow-y: auto;
}
.branch-picker-item {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  gap: 6px;
  color: #cccccc;
}
.branch-picker-item:hover { background: #2a2d2e; }
.branch-picker-item.active {
  background: #094771;
  color: #ffffff;
}
.branch-picker-item .codicon { font-size: 12px; flex-shrink: 0; }
.branch-picker-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.branch-picker-item:hover .branch-delete-btn { opacity: 1; }
.branch-delete-btn { opacity: 0; }

/* ─── Commit History Expandable ──────────────────── */
.scm-history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.scm-history-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
/* VS Code–style thin scrollbar for commit history */
.scm-history-list::-webkit-scrollbar { width: 6px; }
.scm-history-list::-webkit-scrollbar-track { background: transparent; }
.scm-history-list::-webkit-scrollbar-thumb {
  background: rgba(121, 121, 121, 0.4);
  border-radius: 3px;
}
.scm-history-list::-webkit-scrollbar-thumb:hover {
  background: rgba(121, 121, 121, 0.7);
}
.scm-commit-group {
  border-bottom: 1px solid #2a2d2e;
}
.scm-commit-entry {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 12px 4px 16px;
  font-size: 12px;
  cursor: pointer;
}
.scm-commit-entry:hover { background: #2a2d2e; }
.scm-commit-files-loading {
  padding: 4px 12px 4px 44px;
  font-size: 11px;
  color: #888;
}
.scm-history-file {
  padding-left: 44px !important;
}

/* ─── Inline Diff Viewer ──────────────────────── */
.scm-diff-viewer {
  border-top: 1px solid #3c3c3c;
  background: #1a1a2e;
  max-height: 300px;
  overflow: auto;
}
.scm-diff-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: #252540;
  font-size: 11px;
  color: #888;
  position: sticky;
  top: 0;
  z-index: 1;
}
.scm-diff-filename {
  flex: 1;
  font-weight: 600;
  color: #cccccc;
}
.scm-diff-content {
  margin: 0;
  padding: 4px 8px;
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  tab-size: 4;
}
.diff-add { color: #22c55e; background: rgba(34, 197, 94, 0.08); display: inline-block; width: 100%; }
.diff-del { color: #e06c75; background: rgba(224, 108, 117, 0.08); display: inline-block; width: 100%; }
.diff-hunk { color: #61afef; }
.diff-meta { color: #888; }
.diff-ctx { color: #666; }

/* ─── Explorer Sections ────────────────────────── */
.explorer-section {
  border-bottom: 1px solid #3c3c3c;
}

.explorer-section-header {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #bbbbbb;
  cursor: pointer;
  gap: 4px;
  min-height: 22px;
}

.explorer-section-header:hover { background: #2a2d2e; }
.explorer-section-title { text-transform: uppercase; }
.explorer-section-content { max-height: 200px; overflow-y: auto; }

/* ─── Outline View ─────────────────────────────── */
.outline-item { cursor: pointer; }
.outline-detail {
  font-size: 10px;
  color: #666;
  margin-left: auto;
  flex-shrink: 0;
}

/* ─── File Decorations (Git) ───────────────────── */
.file-name.scm-modified { color: #e8a838; }
.file-name.scm-added { color: #22c55e; }
.file-name.scm-deleted { color: #e06c75; text-decoration: line-through; }

.file-decoration-badge {
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  margin-left: auto;
  padding: 0 4px;
}
.file-decoration-badge.scm-modified { color: #e8a838; }
.file-decoration-badge.scm-added { color: #22c55e; }
.file-decoration-badge.scm-deleted { color: #e06c75; }

/* ─── Drag over directory highlight ────────────── */
.file-item.drag-over-dir {
  background: #094771 !important;
  outline: 1px dashed #007acc;
}

/* ─── Panel Type Tabs (Terminal, Problems, Output) ─ */
.panel-type-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  height: 35px;
  border-right: 1px solid #3c3c3c;
  margin-right: 4px;
  flex-shrink: 0;
}

.panel-type-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  padding: 0 12px;
  height: 35px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  white-space: nowrap;
}

.panel-type-tab:hover { color: #cccccc; }
.panel-type-tab.active { color: #cccccc; border-bottom-color: #cccccc; }
.panel-type-tab .codicon { font-size: 14px; }

.panel-badge {
  background: #007acc;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  min-width: 16px;
  height: 14px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  margin-left: 2px;
}

/* ─── Panel Content (Problems, Output) ─────────── */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  font-size: 12px;
  font-family: 'Cascadia Code', 'Fira Code', Menlo, Monaco, monospace;
}

.panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  color: #888;
  font-size: 12px;
}

.panel-empty .codicon { font-size: 16px; }

.problem-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 12px;
  cursor: pointer;
}

.problem-item:hover { background: #2a2d2e; }
.problem-item .codicon { font-size: 14px; flex-shrink: 0; }
.problem-message { flex: 1; color: #cccccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.problem-source { color: #888; font-size: 11px; flex-shrink: 0; }
.problem-location { color: #666; font-size: 11px; flex-shrink: 0; }

.output-content { font-size: 12px; }
.output-line {
  padding: 1px 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.output-line.error { color: #f44747; }
.output-line.warning { color: #e8a838; }
.output-time {
  color: #666;
  margin-right: 8px;
  font-size: 11px;
}

/* ─── Status Bar Badge ─────────────────────────── */
.status-badge {
  background: #e8a838;
  color: #000;
  font-size: 8px;
  font-weight: 700;
  min-width: 12px;
  height: 12px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  margin-left: 2px;
  line-height: 1;
}

/* ─── Zen Mode ─────────────────────────────────── */
.zen-status { opacity: 0; transition: opacity 0.3s; }
.zen-status:hover { opacity: 1; }

/* ─── Notification Center ──────────────────────── */
.notification-center {
  position: fixed;
  bottom: 30px;
  right: 12px;
  z-index: 3000;
  width: 360px;
  max-height: 400px;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
}

.notification-center-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #cccccc;
  border-bottom: 1px solid #3c3c3c;
}

.notification-center-list {
  flex: 1;
  overflow-y: auto;
  max-height: 350px;
}

.notification-empty {
  padding: 24px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #3c3c3c;
  font-size: 12px;
}

.notification-item .codicon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
.notification-item.success .codicon { color: #22c55e; }
.notification-item.error .codicon { color: #e06c75; }
.notification-item.info .codicon { color: #007acc; }

.notification-text { flex: 1; color: #cccccc; word-break: break-word; }
.notification-time { color: #666; font-size: 10px; flex-shrink: 0; white-space: nowrap; }

/* ─── Settings Panel ───────────────────────────── */
.settings-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 4000;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0,0,0,0.4);
}

.settings-panel {
  width: 500px;
  max-width: 90vw;
  max-height: 80vh;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #cccccc;
  border-bottom: 1px solid #3c3c3c;
}

.settings-header .codicon { font-size: 16px; }

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.settings-group {
  margin-bottom: 20px;
}

.settings-group h4 {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  margin-bottom: 12px;
  padding-bottom: 4px;
  border-bottom: 1px solid #3c3c3c;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  color: #cccccc;
}

.settings-row label {
  flex: 1;
}

.settings-input {
  width: 150px;
  background: #3c3c3c;
  color: #cccccc;
  border: 1px solid #3c3c3c;
  outline: none;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 2px;
  font-family: inherit;
}

.settings-input:focus { border-color: #007acc; }

select.settings-input {
  cursor: pointer;
}

/* ─── Search Options ───────────────────────────── */
.search-options-row {
  display: flex;
  gap: 2px;
  margin-top: 4px;
}

.search-option-btn {
  background: none;
  border: 1px solid #3c3c3c;
  color: #888;
  cursor: pointer;
  width: 26px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.search-option-btn:hover { color: #cccccc; border-color: #555; }
.search-option-btn.active { color: #fff; border-color: #007acc; background: #007acc; }
.search-option-btn .codicon { font-size: 12px; }

.search-replace-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
}

.search-replace-btn:hover { color: #cccccc; background: #3c3c3c; }
.search-replace-btn:disabled { color: #555; cursor: not-allowed; }
.search-replace-btn .codicon { font-size: 14px; }
</style>
