# Univer Sheets Example

This example demonstrates a **Univer spreadsheet** bundled as a self-contained Nuxt application with **OPFS persistence**.

## Overview

- 📊 Full-featured spreadsheet powered by [Univer](https://github.com/dream-num/univer)
- 💾 Auto-saves to the browser's Origin Private File System (OPFS) every 5 seconds
- 📦 Builds to a single self-contained bundle with all assets inlined
- 🔒 Works offline — no network requests needed after load

## Features

- Cell editing, formulas, formatting
- Number formatting and formula bar
- Data persisted locally via OPFS
- Loads previous data on startup

## Development

```bash
cd examples/univer-sheets
pnpm install
pnpm dev
```

## Building with the CLI

```bash
node packages/cli/dist/index.js pack bundle ./examples/univer-sheets --out ./bundle-sheets.js --name univer-sheets
```

## How It Works

1. The Nuxt app initializes Univer Sheets inside a container div using `@univerjs/presets`
2. On mount, it checks OPFS for previously saved spreadsheet data
3. If found, the spreadsheet loads from the saved snapshot; otherwise a blank workbook is created
4. Every 5 seconds the current workbook state is serialized and written to OPFS
5. The Nuxt build configuration ensures everything compiles to a single self-contained bundle

## OPFS Persistence

Data is stored at `stark-os-office/univer-sheets.json` in the Origin Private File System. OPFS is a sandboxed, browser-native file system that does not require user permission prompts.

## Project Structure

```
univer-sheets/
├── app.vue                  # Root Vue component
├── pages/
│   └── index.vue            # Main page with Univer Sheets
├── composables/
│   └── useOpfsStorage.ts    # OPFS save/load helpers
├── nuxt.config.ts           # Nuxt configuration for bundling
├── package.json             # Dependencies
└── README.md
```
