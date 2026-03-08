# Stark Code

A **full-featured code editor** bundled as a self-contained Nuxt application with **OPFS persistence**, **VS Code services**, and an **extension marketplace**.

## Architecture

Stark Code uses [`@codingame/monaco-vscode-api`](https://github.com/CodinGame/monaco-vscode-api) to bring **real VS Code functionality** to the Monaco editor. Instead of reimplementing VS Code features by hand, this approach plugs in actual VS Code service implementations:

- **Theme Service** — VS Code's built-in themes (Dark+, Light+, High Contrast) with proper TextMate scope coloring
- **TextMate Service** — Real TextMate grammar engine using Oniguruma for accurate syntax highlighting
- **Languages Service** — VS Code's language detection and configuration
- **Configuration Service** — VS Code's `settings.json`-compatible configuration system
- **Keybindings Service** — VS Code keybinding resolution
- **Model Service** — VS Code's document model management
- **Editor Service** — Multi-editor orchestration
- **Lifecycle Service** — Proper initialization and shutdown

### Default Language Extensions

These VS Code default extensions are loaded at startup for proper syntax highlighting:

| Extension | Languages |
|-----------|-----------|
| JavaScript | `.js`, `.mjs`, `.cjs`, `.jsx` |
| TypeScript | `.ts`, `.tsx`, `.d.ts` |
| JSON | `.json`, `.jsonc` |
| HTML | `.html`, `.htm` |
| CSS | `.css`, `.scss`, `.less` |
| Markdown | `.md`, `.markdown` |

### Why not bundle VS Code directly?

Microsoft does **not** publish a web-embeddable VS Code bundle on npm. The `vscode.dev` website is built from the [microsoft/vscode](https://github.com/microsoft/vscode) source but requires a full build from source (~4-6 hours, complex toolchain). The `@codingame/monaco-vscode-api` package provides the same VS Code services as a standard npm dependency, which is the industry-standard approach for web-based VS Code-like editors.

## Packages Used

| Package | Purpose |
|---------|---------|
| [`@codingame/monaco-vscode-api`](https://github.com/CodinGame/monaco-vscode-api) | VS Code services layer |
| [`@codingame/monaco-vscode-editor-api`](https://github.com/CodinGame/monaco-vscode-api) | VS Code-compatible Monaco editor API (aliased as `monaco-editor`) |
| [`@codingame/monaco-vscode-*-service-override`](https://github.com/CodinGame/monaco-vscode-api) | Theme, TextMate, Languages, Configuration, Keybindings, Model, Editor, Lifecycle services |
| [`@codingame/monaco-vscode-*-default-extension`](https://github.com/CodinGame/monaco-vscode-api) | JS, TS, JSON, HTML, CSS, Markdown language support |
| [`@vscode/codicons`](https://github.com/microsoft/vscode-codicons) | Icon font for the UI |
| [`@xterm/xterm`](https://github.com/xtermjs/xterm.js) | Integrated terminal emulator |
| [`@xterm/addon-fit`](https://github.com/xtermjs/xterm.js) | Auto-fit addon for the terminal |

## Features

### Editor (VS Code-powered)
- Syntax highlighting via TextMate grammars (25+ languages)
- VS Code Dark+/Light+/High Contrast themes
- IntelliSense / autocomplete
- Bracket pair colorization and indentation guides
- Code folding, sticky scroll headers
- Find and Replace (Ctrl+F / Ctrl+H)
- Go to Line (Ctrl+G)
- Go to Symbol (Ctrl+Shift+O)
- Format Document
- Minimap navigation (toggleable)
- Word wrap, mouse wheel zoom, drag and drop
- Format on paste/type, auto-closing brackets/quotes
- Configurable tab size, cursor style, line numbers, whitespace rendering
- Settings UI (Ctrl+,)

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
- Multiple terminal instances with tabs
- JavaScript REPL — evaluate any JS expression
- OPFS file commands: `ls`, `cat`, `touch`, `rm`, `wc`, `head`, `echo`
- Resizable panel with drag handle
- Toggle with Ctrl+\`

### Bottom Panel
- **Terminal** — multiple terminal tabs, create/delete instances
- **Problems** — shows editor diagnostics (errors, warnings) from Monaco markers
- **Output** — timestamped log output

### Multi-Tab Editing
- Open multiple files in tabs
- Tab reordering via drag-and-drop
- Tab pinning via right-click context menu
- Tab close buttons and middle-click to close
- Modified indicator on unsaved tabs
- Automatic save when switching tabs

### File Explorer
- Create, open, rename, delete files inline
- New File / New Folder buttons in toolbar
- Drag files between folders
- Double-click to rename, right-click context menu
- File type icons using codicons
- Git status decorations (M/A/D badges)
- Open Editors section
- Outline view with symbol navigation

### Source Control (Git-like)
- Initialize repository with snapshot tracking
- Stage / unstage files
- Commit with message
- Branch display
- Commit history
- Discard changes

### Command Palette
- Full command palette (Ctrl+Shift+P)
- Quick file open (Ctrl+P)
- Go to symbol (Ctrl+Shift+O)
- Built-in editor commands + extension commands

### Search & Replace
- Search across all files in OPFS
- Replace in files with Replace All
- Case sensitivity, whole word, and regex toggles
- Results with file name and line number
- Click to navigate to result

### Status Bar
- Git branch and pending changes count
- Cursor position (line, column), selection count
- Tab size / indent mode toggle
- Word wrap toggle
- Language mode, EOL selector, encoding
- Terminal toggle, settings, save status

### Zen Mode
- Distraction-free editing (Ctrl+K Z)
- Hides sidebar, panel; fades status bar
- Press Escape to exit

### Notifications
- Toast notifications for editor actions
- Notification center with history (bell icon)

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+P` | Quick Open File |
| `Ctrl+Shift+O` | Go to Symbol |
| `Ctrl+N` | New File |
| `Ctrl+S` | Save File |
| `Ctrl+W` | Close Tab |
| `Ctrl+Shift+F` | Search in Files |
| `Ctrl+Shift+H` | Search & Replace in Files |
| `Ctrl+Shift+G` | Source Control |
| `Ctrl+Shift+E` | Explorer |
| `Ctrl+Shift+X` | Extensions |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find and Replace |
| `Ctrl+G` | Go to Line |
| `Ctrl+B` | Toggle Sidebar |
| `Ctrl+J` | Toggle Bottom Panel |
| `Ctrl+,` | Settings |
| `Ctrl+K Z` | Zen Mode |
| `` Ctrl+` `` | Toggle Terminal |
| `F2` | Rename File |

## Development

```bash
cd examples/monaco
pnpm install
pnpm dev
```

## Building

```bash
cd examples/monaco
pnpm build
```

## OPFS Persistence

Files are stored in the `stark-orchestrator/` directory in the Origin Private File System. Extension state is stored in `.stark-extensions.json`. SCM state is stored in `.stark-code/scm.json`.

## Project Structure

```
monaco/
├── app.vue                        # Root Vue component
├── pages/
│   └── index.vue                  # Full editor UI (~4800 lines)
├── composables/
│   ├── useOpfsStorage.ts          # OPFS file operations
│   ├── useExtensions.ts           # Extension catalog, state, and application logic
│   └── useVscodeServices.ts       # VS Code service initialization
├── nuxt.config.ts                 # Nuxt configuration for bundling
├── package.json                   # Dependencies
└── README.md
```
