/**
 * Extension system for the VS Code example.
 * Provides a catalog of built-in extensions that enhance Monaco Editor functionality.
 * Extension state (installed/enabled) is persisted to OPFS.
 */

import { saveFile, loadFile } from './useOpfsStorage';

const EXTENSIONS_STATE_FILE = '.vscode-extensions.json';

// ─── Types ──────────────────────────────────────────

export interface Extension {
  id: string;
  name: string;
  displayName: string;
  description: string;
  publisher: string;
  version: string;
  category: ExtensionCategory;
  codicon: string;
  downloads: string;
  rating: number;
}

export type ExtensionCategory =
  | 'Themes'
  | 'Language'
  | 'Snippets'
  | 'Formatters'
  | 'Keymaps'
  | 'Other';

export interface ExtensionState {
  installed: string[];  // extension IDs
  enabled: string[];    // extension IDs
}

// ─── Built-in Extension Catalog ─────────────────────

export const extensionCatalog: Extension[] = [
  // Themes
  {
    id: 'theme-monokai',
    name: 'monokai',
    displayName: 'Monokai Theme',
    description: 'A classic dark theme with vibrant syntax highlighting colors inspired by Monokai.',
    publisher: 'VS Code Themes',
    version: '1.0.0',
    category: 'Themes',
    codicon: 'symbol-color',
    downloads: '12.4M',
    rating: 4.8,
  },
  {
    id: 'theme-solarized-dark',
    name: 'solarized-dark',
    displayName: 'Solarized Dark',
    description: 'Precision-designed color scheme for machines and people. Dark variant.',
    publisher: 'VS Code Themes',
    version: '1.0.0',
    category: 'Themes',
    codicon: 'symbol-color',
    downloads: '5.2M',
    rating: 4.5,
  },
  {
    id: 'theme-github-dark',
    name: 'github-dark',
    displayName: 'GitHub Dark Theme',
    description: 'GitHub\'s dark theme for VS Code. Clean and minimal dark mode.',
    publisher: 'GitHub',
    version: '1.0.0',
    category: 'Themes',
    codicon: 'symbol-color',
    downloads: '8.7M',
    rating: 4.7,
  },
  {
    id: 'theme-high-contrast',
    name: 'high-contrast',
    displayName: 'High Contrast',
    description: 'A high contrast theme optimized for accessibility and readability.',
    publisher: 'VS Code Themes',
    version: '1.0.0',
    category: 'Themes',
    codicon: 'symbol-color',
    downloads: '3.1M',
    rating: 4.3,
  },
  {
    id: 'theme-light-plus',
    name: 'light-plus',
    displayName: 'Light+ (Default Light)',
    description: 'VS Code default light theme with enhanced token colors.',
    publisher: 'VS Code Themes',
    version: '1.0.0',
    category: 'Themes',
    codicon: 'symbol-color',
    downloads: '10.1M',
    rating: 4.4,
  },

  // Language support
  {
    id: 'lang-python',
    name: 'python',
    displayName: 'Python',
    description: 'Rich Python language support with auto-complete, linting hints, and snippets.',
    publisher: 'Microsoft',
    version: '2024.1.0',
    category: 'Language',
    codicon: 'file-code',
    downloads: '98.2M',
    rating: 4.6,
  },
  {
    id: 'lang-html-css',
    name: 'html-css-support',
    displayName: 'HTML CSS Support',
    description: 'CSS class and ID completion for HTML, including class attribute suggestions.',
    publisher: 'ecmel',
    version: '2.0.0',
    category: 'Language',
    codicon: 'file-code',
    downloads: '24.3M',
    rating: 4.4,
  },
  {
    id: 'lang-json',
    name: 'json-enhanced',
    displayName: 'JSON Tools',
    description: 'Enhanced JSON editing with schema validation, formatting and sorting.',
    publisher: 'Microsoft',
    version: '1.0.0',
    category: 'Language',
    codicon: 'json',
    downloads: '15.7M',
    rating: 4.5,
  },
  {
    id: 'lang-markdown',
    name: 'markdown-enhanced',
    displayName: 'Markdown All in One',
    description: 'Markdown keyboard shortcuts, table of contents, auto preview, and list editing.',
    publisher: 'Yu Zhang',
    version: '3.6.0',
    category: 'Language',
    codicon: 'markdown',
    downloads: '18.4M',
    rating: 4.6,
  },

  // Snippets
  {
    id: 'snippets-javascript',
    name: 'javascript-snippets',
    displayName: 'JavaScript (ES6) Snippets',
    description: 'Code snippets for JavaScript in ES6 syntax: import, arrow functions, promises, classes.',
    publisher: 'charalampos',
    version: '1.8.0',
    category: 'Snippets',
    codicon: 'symbol-snippet',
    downloads: '14.5M',
    rating: 4.5,
  },
  {
    id: 'snippets-html',
    name: 'html-snippets',
    displayName: 'HTML Snippets',
    description: 'Full HTML tags including HTML5 snippets. Quickly scaffold HTML boilerplate.',
    publisher: 'Mohamed Abusaid',
    version: '1.0.0',
    category: 'Snippets',
    codicon: 'symbol-snippet',
    downloads: '11.2M',
    rating: 4.3,
  },
  {
    id: 'snippets-react',
    name: 'react-snippets',
    displayName: 'ES7+ React/Redux Snippets',
    description: 'Extensions for React, Redux with ES7+ syntax. Component snippets and hooks.',
    publisher: 'dsznajder',
    version: '4.4.0',
    category: 'Snippets',
    codicon: 'symbol-snippet',
    downloads: '10.8M',
    rating: 4.4,
  },

  // Formatters
  {
    id: 'fmt-prettier',
    name: 'prettier',
    displayName: 'Prettier - Code Formatter',
    description: 'Code formatter using Prettier. Supports JavaScript, TypeScript, CSS, JSON, HTML, and more.',
    publisher: 'Prettier',
    version: '10.4.0',
    category: 'Formatters',
    codicon: 'symbol-method',
    downloads: '42.1M',
    rating: 4.2,
  },
  {
    id: 'fmt-indent-rainbow',
    name: 'indent-rainbow',
    displayName: 'Indent Rainbow',
    description: 'Colorizes the indentation in front of your text alternating four colors on each step.',
    publisher: 'oderwat',
    version: '8.3.0',
    category: 'Formatters',
    codicon: 'symbol-color',
    downloads: '9.3M',
    rating: 4.5,
  },
  {
    id: 'fmt-trailing-spaces',
    name: 'trailing-spaces',
    displayName: 'Trailing Spaces',
    description: 'Highlight and auto-remove trailing whitespace from your files.',
    publisher: 'Shardul Mahadik',
    version: '0.4.0',
    category: 'Formatters',
    codicon: 'whitespace',
    downloads: '3.2M',
    rating: 4.3,
  },

  // Keymaps
  {
    id: 'keymap-vim',
    name: 'vim',
    displayName: 'Vim',
    description: 'Vim emulation for VS Code. Supports most Vim commands including normal, insert and visual modes.',
    publisher: 'vscodevim',
    version: '1.27.0',
    category: 'Keymaps',
    codicon: 'keyboard',
    downloads: '7.5M',
    rating: 4.1,
  },
  {
    id: 'keymap-sublime',
    name: 'sublime-keybindings',
    displayName: 'Sublime Text Keymap',
    description: 'Popular Sublime Text keybindings for VS Code. Ctrl+D, Ctrl+Shift+K, etc.',
    publisher: 'Microsoft',
    version: '4.0.0',
    category: 'Keymaps',
    codicon: 'keyboard',
    downloads: '4.2M',
    rating: 4.0,
  },

  // Other
  {
    id: 'other-bracket-colorizer',
    name: 'bracket-pair-colorizer',
    displayName: 'Bracket Pair Colorizer',
    description: 'Enhanced bracket pair colorization with customizable colors and nesting depth.',
    publisher: 'CoenraadS',
    version: '2.0.0',
    category: 'Other',
    codicon: 'symbol-array',
    downloads: '15.3M',
    rating: 4.6,
  },
  {
    id: 'other-minimap-highlight',
    name: 'minimap-highlight',
    displayName: 'Minimap Highlight',
    description: 'Highlight matching search results and selections in the minimap for better navigation.',
    publisher: 'VS Code',
    version: '1.0.0',
    category: 'Other',
    codicon: 'layout-sidebar-right',
    downloads: '2.1M',
    rating: 4.2,
  },
  {
    id: 'other-error-lens',
    name: 'error-lens',
    displayName: 'Error Lens',
    description: 'Improve highlighting of errors, warnings, and diagnostics inline in the editor.',
    publisher: 'usernamehw',
    version: '3.16.0',
    category: 'Other',
    codicon: 'warning',
    downloads: '8.4M',
    rating: 4.7,
  },
  {
    id: 'other-todo-highlight',
    name: 'todo-highlight',
    displayName: 'TODO Highlight',
    description: 'Highlight TODO, FIXME, and other annotations within your code comments.',
    publisher: 'Wayou Liu',
    version: '2.0.0',
    category: 'Other',
    codicon: 'checklist',
    downloads: '6.8M',
    rating: 4.4,
  },
];

// ─── State Management ───────────────────────────────

const defaultState: ExtensionState = {
  installed: [],
  enabled: [],
};

export async function loadExtensionState(): Promise<ExtensionState> {
  try {
    const data = await loadFile(EXTENSIONS_STATE_FILE);
    if (data) {
      const parsed = JSON.parse(data);
      return {
        installed: Array.isArray(parsed.installed) ? parsed.installed : [],
        enabled: Array.isArray(parsed.enabled) ? parsed.enabled : [],
      };
    }
  } catch {
    // ignore
  }
  return { ...defaultState };
}

export async function saveExtensionState(state: ExtensionState): Promise<void> {
  await saveFile(EXTENSIONS_STATE_FILE, JSON.stringify(state, null, 2));
}

export function getExtensionById(id: string): Extension | undefined {
  return extensionCatalog.find(e => e.id === id);
}

export function getCategories(): ExtensionCategory[] {
  const cats = new Set(extensionCatalog.map(e => e.category));
  return Array.from(cats) as ExtensionCategory[];
}

// ─── Extension Application ──────────────────────────

/** Define custom Monaco themes matching popular VS Code themes */
export function defineCustomThemes(monaco: any): void {
  // Monokai theme
  monaco.editor.defineTheme('monokai', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '88846f', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f92672' },
      { token: 'string', foreground: 'e6db74' },
      { token: 'number', foreground: 'ae81ff' },
      { token: 'type', foreground: '66d9ef', fontStyle: 'italic' },
      { token: 'function', foreground: 'a6e22e' },
      { token: 'variable', foreground: 'f8f8f2' },
      { token: 'constant', foreground: 'ae81ff' },
      { token: 'tag', foreground: 'f92672' },
      { token: 'attribute.name', foreground: 'a6e22e' },
      { token: 'attribute.value', foreground: 'e6db74' },
      { token: 'delimiter', foreground: 'f8f8f2' },
      { token: 'operator', foreground: 'f92672' },
    ],
    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#3e3d32',
      'editor.selectionBackground': '#49483e',
      'editorCursor.foreground': '#f8f8f0',
      'editorWhitespace.foreground': '#464741',
    },
  });

  // Solarized Dark theme
  monaco.editor.defineTheme('solarized-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
      { token: 'keyword', foreground: '859900' },
      { token: 'string', foreground: '2aa198' },
      { token: 'number', foreground: 'd33682' },
      { token: 'type', foreground: 'b58900' },
      { token: 'function', foreground: '268bd2' },
      { token: 'variable', foreground: '839496' },
      { token: 'tag', foreground: '268bd2' },
      { token: 'attribute.name', foreground: '93a1a1' },
      { token: 'attribute.value', foreground: '2aa198' },
      { token: 'operator', foreground: '859900' },
    ],
    colors: {
      'editor.background': '#002b36',
      'editor.foreground': '#839496',
      'editor.lineHighlightBackground': '#073642',
      'editor.selectionBackground': '#274642',
      'editorCursor.foreground': '#839496',
    },
  });

  // GitHub Dark theme
  monaco.editor.defineTheme('github-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'number', foreground: '79c0ff' },
      { token: 'type', foreground: 'ffa657' },
      { token: 'function', foreground: 'd2a8ff' },
      { token: 'variable', foreground: 'c9d1d9' },
      { token: 'tag', foreground: '7ee787' },
      { token: 'attribute.name', foreground: '79c0ff' },
      { token: 'attribute.value', foreground: 'a5d6ff' },
      { token: 'operator', foreground: 'ff7b72' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editor.lineHighlightBackground': '#161b22',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#c9d1d9',
    },
  });

  // High Contrast theme
  monaco.editor.defineTheme('high-contrast', {
    base: 'hc-black',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '7ca668', fontStyle: 'italic' },
      { token: 'keyword', foreground: '569cd6' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'type', foreground: '4ec9b0' },
      { token: 'function', foreground: 'dcdcaa' },
      { token: 'variable', foreground: '9cdcfe' },
    ],
    colors: {
      'editor.background': '#000000',
      'editor.foreground': '#ffffff',
      'editor.lineHighlightBorder': '#f38518',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#ffffff',
    },
  });

  // Light+ (Default Light)
  monaco.editor.defineTheme('light-plus', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'keyword', foreground: '0000ff' },
      { token: 'string', foreground: 'a31515' },
      { token: 'number', foreground: '098658' },
      { token: 'type', foreground: '267f99' },
      { token: 'function', foreground: '795e26' },
      { token: 'variable', foreground: '001080' },
      { token: 'tag', foreground: '800000' },
      { token: 'attribute.name', foreground: 'ff0000' },
      { token: 'attribute.value', foreground: '0000ff' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editor.lineHighlightBackground': '#f5f5f5',
      'editor.selectionBackground': '#add6ff',
    },
  });
}

/**
 * Maps theme extension IDs to Monaco theme names.
 */
export const themeExtensionMap: Record<string, string> = {
  'theme-monokai': 'monokai',
  'theme-solarized-dark': 'solarized-dark',
  'theme-github-dark': 'github-dark',
  'theme-high-contrast': 'high-contrast',
  'theme-light-plus': 'light-plus',
};

/**
 * Applies effects for an extension.
 * Returns an undo function to revert the effect.
 */
export function applyExtension(
  extId: string,
  editor: any,
  monaco: any
): (() => void) | null {
  // Theme extensions
  if (extId in themeExtensionMap) {
    const themeName = themeExtensionMap[extId];
    monaco.editor.setTheme(themeName);
    return () => {
      monaco.editor.setTheme('vs-dark');
    };
  }

  // Snippets: register completion item providers
  if (extId === 'snippets-javascript') {
    const disposable = monaco.languages.registerCompletionItemProvider('javascript', {
      provideCompletionItems: (_model: any, position: any) => {
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        };
        return {
          suggestions: [
            { label: 'clg', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'console.log(${1:object});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'console.log', range },
            { label: 'imp', kind: monaco.languages.CompletionItemKind.Snippet, insertText: "import ${2:moduleName} from '${1:module}';", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'ES6 import', range },
            { label: 'imd', kind: monaco.languages.CompletionItemKind.Snippet, insertText: "import { ${2:export} } from '${1:module}';", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'ES6 destructuring import', range },
            { label: 'afn', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'const ${1:name} = (${2:params}) => {\n\t${3}\n};', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Arrow function', range },
            { label: 'prom', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'new Promise((resolve, reject) => {\n\t${1}\n});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Promise', range },
            { label: 'trycatch', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'try {\n\t${1}\n} catch (${2:error}) {\n\t${3}\n}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'try/catch block', range },
            { label: 'foreach', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '${1:array}.forEach((${2:item}) => {\n\t${3}\n});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Array forEach', range },
            { label: 'map', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '${1:array}.map((${2:item}) => {\n\t${3}\n});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Array map', range },
          ],
        };
      },
    });
    return () => disposable.dispose();
  }

  // Also register for TypeScript
  if (extId === 'snippets-javascript') {
    // handled above for JS, TS will share
  }

  if (extId === 'snippets-html') {
    const disposable = monaco.languages.registerCompletionItemProvider('html', {
      provideCompletionItems: (_model: any, position: any) => {
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        };
        return {
          suggestions: [
            { label: 'html5', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t${2}\n</body>\n</html>', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'HTML5 boilerplate', range },
            { label: 'div', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '<div class="${1:className}">\n\t${2}\n</div>', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'div with class', range },
            { label: 'link:css', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '<link rel="stylesheet" href="${1:style.css}">', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'CSS link tag', range },
            { label: 'script:src', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '<script src="${1:main.js}"></script>', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Script tag with src', range },
            { label: 'a', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '<a href="${1:#}">${2:link text}</a>', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Anchor tag', range },
            { label: 'ul>li', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '<ul>\n\t<li>${1}</li>\n\t<li>${2}</li>\n</ul>', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'Unordered list', range },
          ],
        };
      },
    });
    return () => disposable.dispose();
  }

  if (extId === 'snippets-react') {
    const disposable = monaco.languages.registerCompletionItemProvider(['javascript', 'typescript'], {
      provideCompletionItems: (_model: any, position: any) => {
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column,
        };
        return {
          suggestions: [
            { label: 'rfc', kind: monaco.languages.CompletionItemKind.Snippet, insertText: "import React from 'react';\n\nconst ${1:Component} = () => {\n\treturn (\n\t\t<div>\n\t\t\t${2}\n\t\t</div>\n\t);\n};\n\nexport default ${1:Component};", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'React functional component', range },
            { label: 'useState', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'const [${1:state}, set${2:State}] = useState(${3:initialValue});', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'React useState hook', range },
            { label: 'useEffect', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'useEffect(() => {\n\t${1}\n\treturn () => {\n\t\t${2}\n\t};\n}, [${3}]);', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'React useEffect hook', range },
            { label: 'useMemo', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'const ${1:memoized} = useMemo(() => {\n\t${2}\n}, [${3}]);', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, documentation: 'React useMemo hook', range },
          ],
        };
      },
    });
    return () => disposable.dispose();
  }

  // Formatter extensions: configure editor options
  if (extId === 'fmt-prettier') {
    if (editor) {
      editor.updateOptions({ formatOnPaste: true, formatOnType: true });
    }
    return () => {
      if (editor) editor.updateOptions({ formatOnPaste: false, formatOnType: false });
    };
  }

  if (extId === 'fmt-indent-rainbow') {
    if (editor) {
      editor.updateOptions({
        guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
        renderIndentGuides: true,
      });
    }
    return () => {
      if (editor) editor.updateOptions({ guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: false } });
    };
  }

  if (extId === 'fmt-trailing-spaces') {
    if (editor) {
      editor.updateOptions({ renderWhitespace: 'trailing', trimAutoWhitespace: true });
    }
    return () => {
      if (editor) editor.updateOptions({ renderWhitespace: 'selection', trimAutoWhitespace: false });
    };
  }

  // Other extensions
  if (extId === 'other-bracket-colorizer') {
    if (editor) {
      editor.updateOptions({ bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true } });
    }
    return () => {
      if (editor) editor.updateOptions({ bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false } });
    };
  }

  if (extId === 'other-minimap-highlight') {
    if (editor) {
      editor.updateOptions({
        minimap: { enabled: true, showSlider: 'always', renderCharacters: true },
      });
    }
    return () => {
      if (editor) editor.updateOptions({ minimap: { enabled: true, showSlider: 'mouseover', renderCharacters: true } });
    };
  }

  // Language and keymap extensions: show notification (no runtime effect for these)
  return null;
}
