// Re-export everything through this barrel.
// icons.ts and opfs.ts live in lib/ (a subdirectory) so Nuxt does NOT
// auto-import them directly — only this index.ts is scanned.

export {
  getIconCategory,
  getIconSvg,
  getIconColor,
  CATEGORY_COLORS,
  ICON_FOLDER,
  ICON_FILE,
  ICON_TEXT,
  ICON_CODE,
  ICON_IMAGE,
  ICON_AUDIO,
  ICON_VIDEO,
  ICON_ARCHIVE,
  ICON_PDF,
  ICON_APP,
  ICON_SPREADSHEET,
  ICON_CONFIG,
  type IconCategory,
} from './lib/icons';

export {
  buildOpfsFS,
  getStarkOpfsRoot,
  getPathParts,
  normalizePath,
  getDirectoryHandle,
  getFileHandle,
  formatSize,
  formatType,
  readDirItems,
  type ReadonlyFS,
  type FileItem,
} from './lib/opfs';

export {
  commands as terminalCommands,
  normalizePath as terminalNormalizePath,
  type TerminalFS,
  type CommandContext,
} from './terminal/commands';

export {
  parseCommandLine,
  executePlan,
  type ShellState,
  type ExecutionPlan,
} from './terminal/shell';

// NOTE: git.ts is intentionally NOT re-exported from this barrel.
// It has heavy dependencies (isomorphic-git, buffer, diff) with top-level
// side-effects that prevent tree-shaking.  Apps that need git should import
// directly from './lib/git' (or the convenience re-export in './git').

export {
  loadIntents,
  saveIntents,
  getExtension,
  resolveIntent,
  commonExtension,
  setDefaultIntent,
  browserCompatiblePacks,
  getBrowserNodeId,
  launchPack,
  loadPackList,
  openFilesWithIntent,
  handleOpenWithSelection,
  type IntentMapping,
  type IntentStore,
  type IntentPackInfo,
  type OpenWithNeeded,
} from './lib/intents';
