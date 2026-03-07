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
} from './icons';

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
} from './opfs';

export {
  commands as terminalCommands,
  normalizePath as terminalNormalizePath,
  type TerminalFS,
  type CommandContext,
} from './terminal-commands';

export {
  parseCommandLine,
  executePlan,
  type ShellState,
  type ExecutionPlan,
} from './terminal-shell';
