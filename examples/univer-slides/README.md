# Univer Slides Example

This example demonstrates a **Univer presentation editor** bundled as a self-contained Nuxt application with **OPFS persistence**.

> **Note:** Univer Slides is currently under active development. This example uses the core Univer slide packages directly (without presets).

## Overview

- 📽️ Presentation editor powered by [Univer](https://github.com/dream-num/univer)
- 💾 Auto-saves to the browser's Origin Private File System (OPFS) every 5 seconds
- 📦 Builds to a single self-contained bundle with all assets inlined
- 🔒 Works offline — no network requests needed after load

## Features

- Slide creation and editing
- Text and shape support
- Data persisted locally via OPFS
- Loads previous data on startup

## Development

```bash
cd examples/univer-slides
pnpm install
pnpm dev
```

## Building with the CLI

```bash
node packages/cli/dist/index.js pack bundle ./examples/univer-slides --out ./bundle-slides.js --name univer-slides
```

## How It Works

1. The Nuxt app initializes Univer Slides inside a container div using core Univer packages
2. On mount, it checks OPFS for previously saved presentation data
3. If found, the presentation loads from the saved snapshot; otherwise a blank slide is created
4. Every 5 seconds the current slide state is serialized and written to OPFS
5. The Nuxt build configuration ensures everything compiles to a single self-contained bundle

## OPFS Persistence

Data is stored at `stark-os-office/univer-slides.json` in the Origin Private File System. OPFS is a sandboxed, browser-native file system that does not require user permission prompts.

## Project Structure

```
univer-slides/
├── app.vue                  # Root Vue component
├── pages/
│   └── index.vue            # Main page with Univer Slides
├── composables/
│   └── useOpfsStorage.ts    # OPFS save/load helpers
├── nuxt.config.ts           # Nuxt configuration for bundling
├── package.json             # Dependencies
└── README.md
```

## Dependencies

Unlike the Sheets and Docs examples that use `@univerjs/presets`, this example uses individual Univer packages since there is no preset available for Slides yet:

- `@univerjs/core` — Core Univer framework
- `@univerjs/engine-render` — Canvas rendering engine
- `@univerjs/ui` — UI framework
- `@univerjs/slides` — Slide data model
- `@univerjs/slides-ui` — Slide UI components
- `@univerjs/docs` / `@univerjs/docs-ui` — Required for text editing within slides
- `@univerjs/drawing` — Drawing support
- `@univerjs/engine-formula` — Formula engine
- `@univerjs/design` — Theme and design tokens
