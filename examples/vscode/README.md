# VS Code Example

This example demonstrates a **VS Code-like code editor** bundled as a self-contained Nuxt application with **OPFS persistence**, inspired by [vscode.dev](https://vscode.dev/).

## Overview

- 💻 Code editor powered by [Monaco Editor](https://github.com/microsoft/monaco-editor) (the editor that powers VS Code)
- 📁 File explorer sidebar with create/open/delete/rename operations
- 🔍 Search across all files
- 💾 Auto-saves to the browser's Origin Private File System (OPFS) on each edit
- 📦 Builds to a single self-contained bundle with all assets inlined
- 🔒 Works offline — no network requests needed after load

## Features

### Editor
- Syntax highlighting for 25+ languages (JavaScript, TypeScript, Python, Go, Rust, etc.)
- VS Code dark theme with accurate colors
- Minimap navigation (toggleable)
- Word wrap toggle
- Bracket pair colorization and guides
- Code folding with indentation strategy
- Cursor line highlighting
- Smooth scrolling and cursor animation
- Whitespace rendering on selection
- Configurable tab size (2 or 4 spaces)

### Multi-Tab Editing
- Open multiple files in tabs simultaneously
- Tab close buttons and middle-click to close
- Modified indicator (dot) on unsaved tabs
- Automatic save when switching tabs

### File Explorer
- Create, open, rename, delete files
- Double-click to rename
- Right-click context menu (Rename, Duplicate, Delete)
- File type icons for 30+ extensions

### Activity Bar
- Explorer panel toggle
- Search panel with results navigation
- Settings access via command palette

### Command Palette
- Full command palette (Ctrl+Shift+P) with fuzzy search
- Quick file open (Ctrl+P) with file search
- All commands with keyboard shortcut hints

### Search
- Search across all files in OPFS
- Results with file name and line number
- Click to navigate to search result
- Sidebar search panel

### Status Bar
- Cursor position (line, column)
- Tab size indicator
- Word wrap toggle
- Language mode display
- File encoding (UTF-8)
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
| `Ctrl+B` | Toggle Sidebar |
| `F2` | Rename File |

### Other
- Toast notifications for file operations
- Welcome page with recent files and shortcut reference
- Breadcrumbs navigation
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

1. The Nuxt app initializes Monaco Editor inside a container div
2. An activity bar provides access to Explorer and Search panels
3. A file explorer sidebar lists all files stored in OPFS
4. Users can create, rename, duplicate, and delete files
5. Multiple files can be open as tabs simultaneously
6. Changes are auto-saved to OPFS after a short debounce delay (1 second)
7. A command palette provides keyboard-driven access to all features
8. The Nuxt build configuration ensures everything compiles to a self-contained bundle

## OPFS Persistence

Files are stored in the `stark-os-vscode/` directory in the Origin Private File System. Each file is stored as an individual entry, supporting a real file-based workflow. OPFS is a sandboxed, browser-native file system that does not require user permission prompts.

## Project Structure

```
vscode/
├── app.vue                  # Root Vue component
├── pages/
│   └── index.vue            # Main page with full VS Code UI
├── composables/
│   └── useOpfsStorage.ts    # OPFS file operations (list, save, load, delete, rename, search)
├── nuxt.config.ts           # Nuxt configuration for bundling
├── package.json             # Dependencies
└── README.md
```
