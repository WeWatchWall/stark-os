# VS Code Example

This example demonstrates a **VS Code-like code editor** bundled as a self-contained Nuxt application with **OPFS persistence**, inspired by [vscode.dev](https://vscode.dev/).

## VS Code Packages Used

This project is built using **actual packages from the VS Code ecosystem** (microsoft/vscode):

| Package | From | Purpose |
|---------|------|---------|
| [`monaco-editor`](https://github.com/microsoft/monaco-editor) | microsoft/vscode | The core code editor that powers VS Code |
| [`@vscode/codicons`](https://github.com/microsoft/vscode-codicons) | microsoft/vscode | VS Code's icon font — all icons match vscode.dev |
| [`@xterm/xterm`](https://github.com/xtermjs/xterm.js) | VS Code terminal | The terminal emulator used by VS Code's integrated terminal |
| [`@xterm/addon-fit`](https://github.com/xtermjs/xterm.js) | VS Code terminal | Auto-fit addon for the xterm.js terminal |

## Overview

- 💻 Code editor powered by [Monaco Editor](https://github.com/microsoft/monaco-editor) (the editor that powers VS Code)
- 🎨 Icons from [@vscode/codicons](https://github.com/microsoft/vscode-codicons) — identical to vscode.dev
- 🖥️ Integrated terminal powered by [xterm.js](https://github.com/xtermjs/xterm.js) — same as VS Code's terminal
- 📁 File explorer sidebar with create/open/delete/rename operations
- 🔍 Search across all files
- 💾 Auto-saves to the browser's Origin Private File System (OPFS)
- 📦 Builds to a single self-contained bundle with all assets inlined
- 🔒 Works offline — no network requests needed after load

## Features

### Editor (Monaco Editor from VS Code)
- Syntax highlighting for 25+ languages
- VS Code dark theme with accurate colors
- IntelliSense / autocomplete with full suggestion categories
- Bracket pair colorization and indentation guides
- Code folding with indentation strategy
- Sticky scroll headers
- Find and Replace (Ctrl+F / Ctrl+H) — built-in Monaco/VS Code widget
- Go to Line (Ctrl+G) — built-in Monaco/VS Code widget
- Format Document — built-in Monaco/VS Code action
- Minimap navigation (toggleable)
- Word wrap toggle
- Mouse wheel zoom
- Drag and drop editing
- Format on paste and type
- Auto-closing brackets and quotes
- Linked editing
- Configurable tab size (2 or 4 spaces)

### Integrated Terminal (xterm.js from VS Code)
- Full terminal emulator (same as VS Code uses internally)
- JavaScript REPL — evaluate any JS expression
- OPFS file commands: `ls`, `cat`, `touch`, `rm`, `wc`, `head`, `echo`
- VS Code dark terminal theme with matching colors
- Toggle with Ctrl+` (same shortcut as VS Code)

### Multi-Tab Editing
- Open multiple files in tabs simultaneously
- Tab close buttons and middle-click to close
- Modified indicator (dot) on unsaved tabs
- Automatic save when switching tabs

### File Explorer (with codicons)
- Create, open, rename, delete files
- Double-click to rename
- Right-click context menu (Rename, Duplicate, Delete)
- File type icons using @vscode/codicons

### Activity Bar (codicons)
- Explorer panel toggle
- Search panel with results navigation
- Settings access via command palette
- All icons from @vscode/codicons

### Command Palette
- Full command palette (Ctrl+Shift+P)
- Quick file open (Ctrl+P)
- Built-in VS Code editor commands (Find, Replace, Go to Line, Fold, Format, etc.)

### Search
- Search across all files in OPFS
- Results with file name and line number
- Click to navigate to result
- Sidebar search panel

### Status Bar
- Cursor position (line, column)
- Tab size indicator
- Word wrap toggle
- Language mode display
- File encoding (UTF-8)
- Terminal toggle
- Save status indicator

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+P` | Quick Open File |
| `Ctrl+N` | New File |
| `Ctrl+S` | Save File |
| `Ctrl+W` | Close Tab |
| `Ctrl+Shift+F` | Search in Files |
| `Ctrl+F` | Find (Monaco built-in) |
| `Ctrl+H` | Find and Replace (Monaco built-in) |
| `Ctrl+G` | Go to Line (Monaco built-in) |
| `Ctrl+B` | Toggle Sidebar |
| `` Ctrl+` `` | Toggle Terminal |
| `F2` | Rename File |

### Other
- Toast notifications for file operations
- Welcome page with recent files, shortcuts, and VS Code ecosystem attribution
- Breadcrumbs navigation with codicons
- Collapsible sidebar
- File duplication via context menu

## Development

```bash
cd examples/vscode
pnpm install
pnpm dev
```

## Building with the CLI

```bash
node packages/cli/dist/index.js pack bundle ./examples/vscode --out ./bundle-vscode.js --name vscode
```

## How It Works

1. The Nuxt app loads Monaco Editor (VS Code's editor), @vscode/codicons (VS Code's icons), and xterm.js (VS Code's terminal)
2. An activity bar with codicons provides access to Explorer and Search panels
3. A file explorer sidebar lists all files stored in OPFS
4. Users can create, rename, duplicate, and delete files
5. Multiple files can be open as tabs simultaneously
6. Changes are auto-saved to OPFS after a 1 second debounce
7. The integrated terminal (xterm.js) provides a JS REPL and OPFS file commands
8. A command palette provides keyboard-driven access to all features including built-in Monaco editor actions
9. The Nuxt build configuration ensures everything compiles to a self-contained bundle

## OPFS Persistence

Files are stored in the `stark-os-vscode/` directory in the Origin Private File System. Each file is stored as an individual entry. OPFS is a sandboxed, browser-native file system that does not require user permission prompts.

## Project Structure

```
vscode/
├── app.vue                  # Root Vue component
├── pages/
│   └── index.vue            # Full VS Code UI (Monaco + codicons + xterm.js)
├── composables/
│   └── useOpfsStorage.ts    # OPFS file operations (list, save, load, delete, rename, search)
├── nuxt.config.ts           # Nuxt configuration for bundling
├── package.json             # VS Code ecosystem dependencies
└── README.md
```
