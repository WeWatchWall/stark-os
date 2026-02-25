# Stark Code

A **full-featured code editor** bundled as a self-contained Nuxt application with **OPFS persistence** and an **extension marketplace**.

## Packages Used

| Package | Purpose |
|---------|---------|
| [`monaco-editor`](https://github.com/microsoft/monaco-editor) | Core code editor engine |
| [`@vscode/codicons`](https://github.com/microsoft/vscode-codicons) | Icon font for the UI |
| [`@xterm/xterm`](https://github.com/xtermjs/xterm.js) | Integrated terminal emulator |
| [`@xterm/addon-fit`](https://github.com/xtermjs/xterm.js) | Auto-fit addon for the terminal |

## Features

### Editor
- Syntax highlighting for 25+ languages
- Dark theme with accurate colors
- IntelliSense / autocomplete
- Bracket pair colorization and indentation guides
- Code folding, sticky scroll headers
- Find and Replace (Ctrl+F / Ctrl+H)
- Go to Line (Ctrl+G)
- Format Document
- Minimap navigation (toggleable)
- Word wrap, mouse wheel zoom, drag and drop
- Format on paste/type, auto-closing brackets/quotes
- Configurable tab size (2 or 4 spaces)

### Extensions Marketplace
- Browse 21 built-in extensions across 6 categories (Themes, Language, Snippets, Formatters, Keymaps, Other)
- Search and filter extensions by category
- Install / uninstall extensions
- Enable / disable installed extensions
- Extension detail view with description, stats, and actions
- **Theme extensions** apply real Monaco editor themes (Monokai, Solarized Dark, GitHub Dark, High Contrast, Light+)
- **Snippet extensions** register actual completion providers (JavaScript ES6, HTML, React/Redux)
- **Formatter extensions** configure editor options (Prettier, Indent Rainbow, Trailing Spaces)
- **Other extensions** apply editor enhancements (Bracket Colorizer, Minimap Highlight, Error Lens, TODO Highlight)
- Extension state persisted to OPFS — survives page reload
- Ctrl+Shift+X to open Extensions panel

### Integrated Terminal
- Full terminal emulator (xterm.js)
- JavaScript REPL — evaluate any JS expression
- OPFS file commands: `ls`, `cat`, `touch`, `rm`, `wc`, `head`, `echo`
- Toggle with Ctrl+\`

### Multi-Tab Editing
- Open multiple files in tabs
- Tab close buttons and middle-click to close
- Modified indicator on unsaved tabs
- Automatic save when switching tabs

### File Explorer
- Create, open, rename, delete files
- Double-click to rename, right-click context menu
- File type icons using codicons

### Command Palette
- Full command palette (Ctrl+Shift+P)
- Quick file open (Ctrl+P)
- Built-in editor commands + extension commands

### Search
- Search across all files in OPFS
- Results with file name and line number
- Click to navigate to result

### Status Bar
- Cursor position (line, column)
- Tab size, word wrap toggle
- Language mode, encoding
- Terminal toggle, save status

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+P` | Quick Open File |
| `Ctrl+N` | New File |
| `Ctrl+S` | Save File |
| `Ctrl+W` | Close Tab |
| `Ctrl+Shift+F` | Search in Files |
| `Ctrl+Shift+X` | Extensions |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find and Replace |
| `Ctrl+G` | Go to Line |
| `Ctrl+B` | Toggle Sidebar |
| `` Ctrl+` `` | Toggle Terminal |
| `F2` | Rename File |

## Development

```bash
cd examples/vscode
pnpm install
pnpm dev
```

## Building

```bash
cd examples/vscode
pnpm build
```

## OPFS Persistence

Files are stored in the `stark-os-vscode/` directory in the Origin Private File System. Extension state is stored in `.stark-extensions.json`.

## Project Structure

```
vscode/
├── app.vue                        # Root Vue component
├── pages/
│   └── index.vue                  # Full editor UI
├── composables/
│   ├── useOpfsStorage.ts          # OPFS file operations
│   └── useExtensions.ts           # Extension catalog, state, and application logic
├── nuxt.config.ts                 # Nuxt configuration for bundling
├── package.json                   # Dependencies
└── README.md
```
