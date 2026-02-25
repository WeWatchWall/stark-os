# VS Code Example

This example demonstrates a **VS Code-like code editor** bundled as a self-contained Nuxt application with **OPFS persistence**.

## Overview

- 💻 Code editor powered by [Monaco Editor](https://github.com/microsoft/monaco-editor) (the editor that powers VS Code)
- 📁 File explorer sidebar with create/open/delete operations
- 💾 Auto-saves to the browser's Origin Private File System (OPFS) on each edit
- 📦 Builds to a single self-contained bundle with all assets inlined
- 🔒 Works offline — no network requests needed after load

## Features

- Syntax highlighting for JavaScript, TypeScript, JSON, HTML, CSS, Python, and more
- VS Code dark theme
- Minimap navigation
- Word wrap, line numbers, auto-indentation
- File-based OPFS storage with individual files
- File explorer with create and delete operations

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
2. A file explorer sidebar lists all files stored in OPFS
3. Users can create new files, which are saved to OPFS
4. Opening a file loads its content from OPFS into the Monaco Editor
5. Changes are auto-saved to OPFS after a short debounce delay (1 second)
6. The Nuxt build configuration ensures everything compiles to a self-contained bundle

## OPFS Persistence

Files are stored in the `stark-os-vscode/` directory in the Origin Private File System. Each file is stored as an individual entry, supporting a real file-based workflow. OPFS is a sandboxed, browser-native file system that does not require user permission prompts.

## Project Structure

```
vscode/
├── app.vue                  # Root Vue component
├── pages/
│   └── index.vue            # Main page with Monaco Editor and file explorer
├── composables/
│   └── useOpfsStorage.ts    # OPFS file operations (list, save, load, delete)
├── nuxt.config.ts           # Nuxt configuration for bundling
├── package.json             # Dependencies
└── README.md
```
